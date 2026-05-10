#!/usr/bin/env node
/**
 * `rigor-claude-code-install` — installs the userigor skill, slash commands,
 * and example hook config into the user's ~/.claude/ directory.
 *
 * It writes:
 *   ~/.claude/skills/userigor/SKILL.md
 *   ~/.claude/commands/rigor-recall.md
 *   ~/.claude/commands/rigor-metrics.md
 *   ~/.claude/commands/rigor-patterns.md
 *
 * It does NOT modify settings.json. The MCP and hook snippets are written
 * as example files in the same directory so the user can copy what they
 * want consciously.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// templates ship next to dist
const templatesDir = resolve(__dirname, '..', 'templates');

const claudeHome = process.env.CLAUDE_HOME ?? resolve(homedir(), '.claude');

interface PlanEntry {
  src: string;
  dst: string;
}

function buildPlan(): PlanEntry[] {
  const plan: PlanEntry[] = [];
  // Skill
  plan.push({
    src: join(templatesDir, 'SKILL.md'),
    dst: join(claudeHome, 'skills', 'userigor', 'SKILL.md')
  });
  // Slash commands
  const cmdSrcDir = join(templatesDir, 'commands');
  if (existsSync(cmdSrcDir)) {
    for (const file of readdirSync(cmdSrcDir)) {
      plan.push({
        src: join(cmdSrcDir, file),
        dst: join(claudeHome, 'commands', file)
      });
    }
  }
  // Examples (kept side-by-side, not auto-merged)
  plan.push({
    src: join(templatesDir, 'mcp.example.json'),
    dst: join(claudeHome, 'rigor', 'mcp.example.json')
  });
  plan.push({
    src: join(templatesDir, 'hooks', 'settings.example.json'),
    dst: join(claudeHome, 'rigor', 'hooks.settings.example.json')
  });
  return plan;
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function bytes(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  if (!existsSync(templatesDir)) {
    console.error(`templates directory not found: ${templatesDir}`);
    process.exit(1);
  }
  const plan = buildPlan();
  console.log(`installing ${plan.length} files into ${claudeHome}${dryRun ? ' (dry run)' : ''}`);
  let written = 0;
  let skipped = 0;
  for (const entry of plan) {
    if (!existsSync(entry.src)) {
      console.warn(`  ! missing template: ${entry.src}`);
      skipped++;
      continue;
    }
    if (existsSync(entry.dst) && bytes(entry.dst) === bytes(entry.src)) {
      console.log(`  = ${entry.dst} (unchanged)`);
      skipped++;
      continue;
    }
    if (!dryRun) {
      ensureDir(entry.dst);
      copyFileSync(entry.src, entry.dst);
    }
    console.log(`  ${dryRun ? '~' : '+'} ${entry.dst}`);
    written++;
  }
  console.log('');
  console.log(`done. wrote ${written}, skipped ${skipped}.`);
  if (!dryRun) {
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Add the MCP server to ~/.claude/settings.json:`);
    console.log(`     see ${join(claudeHome, 'rigor', 'mcp.example.json')}`);
    console.log(`  2. (optional) Add the PostToolUse hook to enable auto-capture:`);
    console.log(`     see ${join(claudeHome, 'rigor', 'hooks.settings.example.json')}`);
    console.log(`  3. Run \`rigor init\` and \`rigor backfill\` to seed the pattern library.`);
  }
}

main();
