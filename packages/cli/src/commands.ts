import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, basename } from 'node:path';
import {
  Rigor,
  GitClient,
  detectLanguage,
  diffLines,
  computePatternImpact,
  timeSeries
} from '@userigor/core';
import type { Agent, Pattern } from '@userigor/core';
import { c, table, header, ok, info, fail, pct, bar } from './output.js';
import type { ParsedArgs } from './args.js';

interface RigorConfig {
  dbPath: string;
  agent: Agent;
  repo: string;
  embedDimensions: number;
  similarityThreshold: number;
  topK: number;
}

const CONFIG_DIR = resolve(homedir(), '.rigor');
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json');

function loadConfig(): RigorConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {
      dbPath: resolve(CONFIG_DIR, 'data.db'),
      agent: 'claude-code',
      repo: process.cwd(),
      embedDimensions: 256,
      similarityThreshold: 0.45,
      topK: 3
    };
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  return {
    dbPath: raw.dbPath ?? resolve(CONFIG_DIR, 'data.db'),
    agent: raw.agent ?? 'claude-code',
    repo: raw.repo ?? process.cwd(),
    embedDimensions: raw.embedDimensions ?? 256,
    similarityThreshold: raw.similarityThreshold ?? 0.45,
    topK: raw.topK ?? 3
  };
}

function saveConfig(cfg: RigorConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function withRigor<T>(fn: (rigor: Rigor, cfg: RigorConfig) => T | Promise<T>): Promise<T> {
  const cfg = loadConfig();
  const rigor = new Rigor({ dbPath: cfg.dbPath });
  rigor.init();
  return Promise.resolve(fn(rigor, cfg)).finally(() => rigor.close());
}

// -------------------- commands --------------------

export async function cmdInit(args: ParsedArgs): Promise<void> {
  const repo = (args.flags.repo as string) ?? process.cwd();
  const agent = ((args.flags.agent as string) ?? 'claude-code') as Agent;
  const cfg: RigorConfig = {
    dbPath: resolve(CONFIG_DIR, 'data.db'),
    agent,
    repo,
    embedDimensions: 256,
    similarityThreshold: 0.45,
    topK: 3
  };
  saveConfig(cfg);
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  const rigor = new Rigor({ dbPath: cfg.dbPath });
  rigor.init();
  rigor.close();
  ok(`initialized at ${c.cyan(CONFIG_DIR)}`);
  info(`agent: ${c.amber(agent)}  repo: ${c.amber(repo)}  db: ${c.dim(cfg.dbPath)}`);
}

export async function cmdCapture(args: ParsedArgs): Promise<void> {
  const beforeFile = args.positionals[0];
  const afterFile = args.positionals[1];
  if (!beforeFile || !afterFile) fail('usage: rigor capture <before-file> <after-file> [--task "desc"]');
  if (!existsSync(beforeFile)) fail(`before file not found: ${beforeFile}`);
  if (!existsSync(afterFile)) fail(`after file not found: ${afterFile}`);
  const before = readFileSync(beforeFile, 'utf8');
  const after = readFileSync(afterFile, 'utf8');
  const filePath = (args.flags.path as string) ?? afterFile;
  const task = (args.flags.task as string) ?? null;
  await withRigor(async (rigor, cfg) => {
    const id = await rigor.capture({
      before,
      after,
      repo: cfg.repo,
      file_path: filePath,
      agent: cfg.agent,
      task_description: task
    });
    if (!id) {
      info('no difference between files; skipped');
    } else {
      ok(`captured correction ${c.dim(id)}`);
    }
  });
}

export async function cmdBackfill(args: ParsedArgs): Promise<void> {
  const limit = parseInt((args.flags.limit as string) ?? '50', 10);
  const path = (args.flags.path as string) ?? process.cwd();
  const git = new GitClient(path);
  if (!git.isRepo()) fail(`not a git repo: ${path}`);
  const repo = (args.flags.repo as string) ?? basename(git.topLevel());
  const agent = ((args.flags.agent as string) ?? 'unknown') as Agent;
  const commits = git.log({ limit });
  let captured = 0;
  await withRigor(async (rigor) => {
    for (const commit of commits) {
      // Pair each commit with its parent. before = parent's content, after = this commit's.
      // Skip the very first commit (no parent).
      const parent = `${commit.hash}^`;
      for (const file of commit.files) {
        if (!file || file.length > 200) continue;
        const ext = file.split('.').pop() ?? '';
        if (!['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'rb'].includes(ext)) continue;
        const before = git.showFile(parent, file);
        const after = git.showFile(commit.hash, file);
        if (!after || before === after) continue;
        const stats = diffLines(before, after);
        if (stats.size === 0 || stats.size > 500) continue; // skip massive churn
        const id = await rigor.capture({
          before,
          after,
          repo,
          file_path: file,
          agent,
          task_description: commit.subject,
          ai_emitted_at: commit.authorDate - 60_000,
          committed_at: commit.authorDate
        });
        if (id) captured++;
      }
    }
  });
  ok(`backfilled ${c.amber(String(captured))} corrections from ${c.amber(String(commits.length))} commits`);
  info(`run ${c.cyan('rigor cluster')} next to form patterns`);
}

export async function cmdEmbed(): Promise<void> {
  const count = await withRigor(async (rigor) => rigor.embedPending());
  ok(`embedded ${c.amber(String(count))} pending corrections`);
}

export async function cmdCluster(args: ParsedArgs): Promise<void> {
  const threshold = parseFloat((args.flags.threshold as string) ?? '0.45');
  const minSize = parseInt((args.flags['min-size'] as string) ?? '2', 10);
  const result = await withRigor(async (rigor) =>
    rigor.cluster({ similarityThreshold: threshold, minClusterSize: minSize })
  );
  ok(
    `formed ${c.amber(String(result.patternsCreated.length))} patterns; ` +
      `${c.dim(String(result.orphans))} orphan corrections`
  );
  if (result.patternsCreated.length === 0) return;
  console.log(header('Top patterns'));
  const rows: string[][] = [['name', 'size', 'density', 'status']];
  for (const p of result.patternsCreated.slice(0, 10)) {
    rows.push([c.cyan(p.name), String(p.size), p.density.toFixed(2), p.status]);
  }
  console.log(table(rows, { header: true }));
}

export async function cmdMetrics(args: ParsedArgs): Promise<void> {
  const days = parseInt((args.flags.days as string) ?? '30', 10);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const snap = await withRigor(async (rigor) => rigor.metrics({ since }));
  console.log(header(`Metrics  ·  last ${days} days  ·  n=${snap.sample_size}`));
  const rows: string[][] = [
    ['First-Try Acceptance', pct(snap.first_try_acceptance), bar(snap.first_try_acceptance, 1)],
    ['Edit-After-Accept (lines)', snap.edit_after_accept.toFixed(1), ''],
    ['Revert Rate', pct(snap.revert_rate), ''],
    ['Correction Velocity', `${snap.correction_velocity}s`, ''],
    ['Drift Distance (lines)', snap.drift_distance.toFixed(1), ''],
    ['Pattern Coverage', pct(snap.pattern_coverage), bar(snap.pattern_coverage, 1)]
  ];
  console.log(table(rows));
  console.log('');
  if (snap.sample_size === 0) {
    info('no corrections yet — run ' + c.cyan('rigor backfill') + ' or capture some');
  }
}

export async function cmdSeries(args: ParsedArgs): Promise<void> {
  const name = ((args.flags.name as string) ?? 'first_try_acceptance') as
    | 'first_try_acceptance'
    | 'edit_after_accept'
    | 'revert_rate'
    | 'correction_velocity'
    | 'drift_distance'
    | 'pattern_coverage';
  const days = parseInt((args.flags.days as string) ?? '14', 10);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const data = await withRigor(async (rigor) =>
    timeSeries(rigor.store, name, { since, bucketMs: 24 * 60 * 60 * 1000 })
  );
  console.log(header(`${name}  ·  last ${days} days`));
  if (data.length === 0) {
    info('no data');
    return;
  }
  const max = Math.max(...data.map((d) => d.value));
  const rows: string[][] = [['day', 'value', 'n', '']];
  for (const d of data) {
    const date = new Date(d.window_end).toISOString().slice(0, 10);
    rows.push([
      c.dim(date),
      d.value.toFixed(2),
      String(d.sample_size),
      bar(d.value, max || 1, 30)
    ]);
  }
  console.log(table(rows, { header: true }));
}

export async function cmdPatterns(args: ParsedArgs): Promise<void> {
  if (args.subcommand === 'show') {
    const id = args.positionals[0];
    if (!id) fail('usage: rigor patterns show <id-or-name>');
    await withRigor(async (rigor) => {
      const all = rigor.listPatterns();
      const p = all.find((x) => x.id === id || x.name === id);
      if (!p) fail(`pattern not found: ${id}`);
      console.log(header(`Pattern  ${c.cyan(p.name)}`));
      console.log(`id:           ${c.dim(p.id)}`);
      console.log(`status:       ${p.status === 'active' ? c.green(p.status) : c.dim(p.status)}`);
      console.log(`size:         ${p.size}`);
      console.log(`density:      ${p.density.toFixed(2)}`);
      console.log(`injections:   ${p.injection_count}`);
      console.log(`impact:       ${p.impact_score >= 0 ? c.green('+' + p.impact_score.toFixed(3)) : c.red(p.impact_score.toFixed(3))}`);
      console.log(`repos:        ${p.repos.join(', ')}`);
      console.log(`languages:    ${p.languages.join(', ')}`);
      console.log('');
      console.log(c.bold('Description'));
      console.log(p.description);
      if (p.injection_count >= 5) {
        const impact = computePatternImpact(rigor.store, p.id);
        console.log('');
        console.log(c.bold('Causal evidence'));
        console.log(`  with injection FTA:    ${pct(impact.with_injection_fta)}  (n=${impact.sample_with})`);
        console.log(`  without injection FTA: ${pct(impact.without_injection_fta)}  (n=${impact.sample_without})`);
        console.log(`  delta:                 ${impact.delta >= 0 ? c.green('+' + pct(impact.delta)) : c.red(pct(impact.delta))}`);
      }
    });
    return;
  }
  // default: list
  const status = (args.flags.status as string) ?? 'active';
  const patterns = await withRigor(async (rigor) =>
    rigor.store.listPatterns({ status: status === 'all' ? undefined : (status as Pattern['status']) })
  );
  console.log(header(`Patterns  ·  ${status}  ·  ${patterns.length} total`));
  if (patterns.length === 0) {
    info('no patterns yet — run ' + c.cyan('rigor cluster') + ' after capturing corrections');
    return;
  }
  const rows: string[][] = [['name', 'size', 'inj', 'impact', 'status']];
  for (const p of patterns.slice(0, 30)) {
    const impactStr = p.impact_score >= 0 ? c.green('+' + p.impact_score.toFixed(2)) : c.red(p.impact_score.toFixed(2));
    rows.push([c.cyan(p.name), String(p.size), String(p.injection_count), impactStr, p.status]);
  }
  console.log(table(rows, { header: true }));
}

export async function cmdInject(args: ParsedArgs): Promise<void> {
  const prompt = args.positionals.join(' ').trim();
  if (!prompt) fail('usage: rigor inject "<your prompt>"');
  const topK = parseInt((args.flags['top-k'] as string) ?? '3', 10);
  const minSim = parseFloat((args.flags['min-sim'] as string) ?? '0.30');
  const noPersist = args.flags['no-persist'] === true || args.flags.dry === true;
  const result = await withRigor(async (rigor) =>
    rigor.inject(prompt, { topK, minSimilarity: minSim, persist: !noPersist })
  );
  if (result.patterns.length === 0) {
    info('no patterns matched. Original prompt unchanged.');
    return;
  }
  console.log(header(`Injected ${result.patterns.length} pattern${result.patterns.length === 1 ? '' : 's'}  ·  ${result.tokens_added} tokens added`));
  for (let i = 0; i < result.patterns.length; i++) {
    const p = result.patterns[i];
    const score = result.scores[i];
    console.log(
      `  ${c.cyan(p.name)}  sim=${score.similarity.toFixed(2)}  impact=${score.impact >= 0 ? '+' : ''}${score.impact.toFixed(2)}`
    );
  }
  console.log('');
  console.log(c.dim('---  augmented prompt  ---'));
  console.log(result.augmented_prompt);
}

export async function cmdPrune(): Promise<void> {
  const result = await withRigor(async (rigor) => rigor.prune());
  ok(
    `pruned: retired=${c.amber(String(result.retired))}  ` +
      `deleted=${c.amber(String(result.deleted))}  ` +
      `updated=${c.dim(String(result.updated))}`
  );
}

export async function cmdStatus(): Promise<void> {
  const cfg = loadConfig();
  await withRigor(async (rigor) => {
    const corrections = rigor.listCorrections();
    const patterns = rigor.listPatterns();
    console.log(header('userigor status'));
    console.log(`config:        ${c.dim(CONFIG_PATH)}`);
    console.log(`db:            ${c.dim(cfg.dbPath)}`);
    console.log(`agent:         ${c.amber(cfg.agent)}`);
    console.log(`repo:          ${c.amber(cfg.repo)}`);
    console.log(`corrections:   ${c.bold(String(corrections.length))}`);
    console.log(`patterns:      ${c.bold(String(patterns.length))}`);
    const active = patterns.filter((p) => p.status === 'active').length;
    const candidates = patterns.filter((p) => p.status === 'candidate').length;
    const retired = patterns.filter((p) => p.status === 'retired').length;
    console.log(`  active:      ${c.green(String(active))}`);
    console.log(`  candidate:   ${c.yellow(String(candidates))}`);
    console.log(`  retired:     ${c.dim(String(retired))}`);
  });
}

export async function cmdConfig(args: ParsedArgs): Promise<void> {
  if (args.subcommand === 'show' || !args.subcommand) {
    const cfg = loadConfig();
    console.log(JSON.stringify(cfg, null, 2));
    return;
  }
  if (args.subcommand === 'set') {
    const cfg = loadConfig();
    for (const [k, v] of Object.entries(args.flags)) {
      if (k in cfg) {
        const typed = cfg as unknown as Record<string, unknown>;
        if (typeof typed[k] === 'number') typed[k] = parseFloat(String(v));
        else typed[k] = v;
      }
    }
    saveConfig(cfg);
    ok('config updated');
    console.log(JSON.stringify(cfg, null, 2));
    return;
  }
  fail(`unknown config subcommand: ${args.subcommand}`);
}

// reference detectLanguage so the import isn't tree-shaken away
void detectLanguage;
