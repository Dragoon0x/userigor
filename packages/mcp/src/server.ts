#!/usr/bin/env node
/**
 * userigor MCP server.
 *
 * Exposes the rigor engine as Model Context Protocol tools so any MCP-aware
 * agent (Claude Code, Cursor, custom clients) can call:
 *
 *   - rigor_recall(prompt)       Get top patterns relevant to a prompt
 *   - rigor_capture(...)         Capture a correction
 *   - rigor_metrics()            Get current metrics snapshot
 *   - rigor_cluster()            Trigger clustering
 *   - rigor_status()             Get system status
 *   - rigor_patterns()           List patterns
 *
 * The recall tool is the differentiator: it lets the agent ask "what should
 * I keep in mind for this task?" before generating, then attribute its
 * output to specific patterns.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  Rigor,
  computePatternImpact,
  type Agent,
  type RigorOptions
} from '@userigor/core';

interface RigorMcpConfig {
  dbPath: string;
  agent: Agent;
  repo: string;
}

function loadConfig(): RigorMcpConfig {
  const configPath = resolve(homedir(), '.rigor', 'config.json');
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      return {
        dbPath: raw.dbPath ?? resolve(homedir(), '.rigor', 'data.db'),
        agent: (raw.agent as Agent) ?? 'claude-code',
        repo: raw.repo ?? process.cwd()
      };
    } catch {
      // fall through to defaults
    }
  }
  return {
    dbPath: resolve(homedir(), '.rigor', 'data.db'),
    agent: 'claude-code',
    repo: process.cwd()
  };
}

export function createServer(opts: RigorOptions = {}): McpServer {
  const cfg = loadConfig();
  const rigor = new Rigor({ dbPath: opts.dbPath ?? cfg.dbPath, ...opts });
  rigor.init();

  const server = new McpServer(
    { name: 'userigor', version: '1.0.0' },
    {
      capabilities: { tools: {} }
    }
  );

  server.registerTool(
    'rigor_recall',
    {
      title: 'Recall relevant patterns',
      description:
        'Given a task description or prompt, return the most relevant patterns from past corrections. Use BEFORE generating code to anchor your output in patterns this codebase has already learned.',
      inputSchema: {
        prompt: z.string().describe('The task description or prompt about to be sent to the agent.'),
        topK: z.number().int().min(1).max(10).optional().describe('How many patterns to return (default 3).'),
        minSimilarity: z.number().min(0).max(1).optional().describe('Minimum similarity threshold (default 0.30).'),
        repo: z.string().optional().describe('Filter to a specific repo. Defaults to all.'),
        language: z.string().optional().describe('Filter to a specific language. Defaults to all.')
      }
    },
    async (args) => {
      const result = await rigor.inject(args.prompt, {
        topK: args.topK,
        minSimilarity: args.minSimilarity,
        repo: args.repo,
        language: args.language,
        persist: false
      });
      const text = result.patterns.length === 0
        ? 'No relevant patterns found. Proceed without injection.'
        : formatRecallResponse(result.patterns, result.scores);
      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          patterns: result.patterns.map((p, i) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            size: p.size,
            impact_score: p.impact_score,
            similarity: result.scores[i].similarity
          })),
          tokens_added_if_injected: result.tokens_added
        }
      };
    }
  );

  server.registerTool(
    'rigor_capture',
    {
      title: 'Capture a correction',
      description:
        'Capture a correction: what the AI produced (before) vs what was actually committed (after). Used to grow the pattern library.',
      inputSchema: {
        before: z.string().describe('The AI output as it was originally produced.'),
        after: z.string().describe('The final committed text after any user edits.'),
        file_path: z.string().describe('Repo-relative file path.'),
        agent: z.enum(['claude-code', 'cursor', 'codex', 'gemini-cli', 'copilot', 'aider', 'unknown']).optional(),
        task_description: z.string().optional().describe('What the AI was asked to do.'),
        repo: z.string().optional().describe('Repo identifier. Defaults to configured repo.')
      }
    },
    async (args) => {
      const id = await rigor.capture({
        before: args.before,
        after: args.after,
        file_path: args.file_path,
        agent: (args.agent as Agent) ?? cfg.agent,
        task_description: args.task_description ?? null,
        repo: args.repo ?? cfg.repo
      });
      if (!id) {
        return {
          content: [{ type: 'text', text: 'No difference detected. Nothing captured.' }],
          structuredContent: { captured: false }
        };
      }
      return {
        content: [{ type: 'text', text: `Captured correction ${id}.` }],
        structuredContent: { captured: true, id }
      };
    }
  );

  server.registerTool(
    'rigor_cluster',
    {
      title: 'Run clustering',
      description: 'Re-cluster all embedded corrections into patterns. Idempotent. Run after a batch of captures.',
      inputSchema: {
        threshold: z.number().min(0).max(1).optional().describe('Similarity threshold (default 0.45).'),
        minSize: z.number().int().min(2).optional().describe('Minimum cluster size (default 2).')
      }
    },
    async (args) => {
      const result = rigor.cluster({
        similarityThreshold: args.threshold,
        minClusterSize: args.minSize
      });
      return {
        content: [
          {
            type: 'text',
            text: `Formed ${result.patternsCreated.length} patterns. Orphan corrections: ${result.orphans}.`
          }
        ],
        structuredContent: {
          patterns_created: result.patternsCreated.length,
          orphans: result.orphans,
          patterns: result.patternsCreated.map((p) => ({
            id: p.id,
            name: p.name,
            size: p.size,
            density: p.density
          }))
        }
      };
    }
  );

  server.registerTool(
    'rigor_metrics',
    {
      title: 'Get metrics snapshot',
      description:
        'Compute the current metric snapshot: first-try acceptance, edit-after-accept, revert rate, correction velocity, drift distance, pattern coverage.',
      inputSchema: {
        days: z.number().int().min(1).max(365).optional().describe('Window in days (default 30).')
      }
    },
    async (args) => {
      const days = args.days ?? 30;
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const snap = rigor.metrics({ since });
      const text = [
        `Metrics over the last ${days} days (n=${snap.sample_size}):`,
        `  first_try_acceptance:  ${(snap.first_try_acceptance * 100).toFixed(1)}%`,
        `  edit_after_accept:     ${snap.edit_after_accept.toFixed(1)} lines avg`,
        `  revert_rate:           ${(snap.revert_rate * 100).toFixed(1)}%`,
        `  correction_velocity:   ${snap.correction_velocity}s median`,
        `  drift_distance:        ${snap.drift_distance.toFixed(1)} lines avg`,
        `  pattern_coverage:      ${(snap.pattern_coverage * 100).toFixed(1)}%`
      ].join('\n');
      return {
        content: [{ type: 'text', text }],
        structuredContent: snap as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    'rigor_patterns',
    {
      title: 'List patterns',
      description: 'List patterns. Supports filtering by status. Returns patterns sorted by impact then size.',
      inputSchema: {
        status: z.enum(['active', 'candidate', 'retired', 'all']).optional().describe('Status filter (default active).'),
        limit: z.number().int().min(1).max(100).optional().describe('Max patterns to return (default 25).')
      }
    },
    async (args) => {
      const status = args.status ?? 'active';
      const patterns = rigor.store.listPatterns({
        status: status === 'all' ? undefined : status,
        limit: args.limit ?? 25
      });
      const text = patterns.length === 0
        ? 'No patterns yet. Capture corrections and run rigor_cluster to form patterns.'
        : patterns
            .map(
              (p) =>
                `• ${p.name} — size=${p.size}, injections=${p.injection_count}, impact=${p.impact_score >= 0 ? '+' : ''}${p.impact_score.toFixed(2)}, status=${p.status}`
            )
            .join('\n');
      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          count: patterns.length,
          patterns: patterns.map((p) => ({
            id: p.id,
            name: p.name,
            size: p.size,
            density: p.density,
            injection_count: p.injection_count,
            impact_score: p.impact_score,
            status: p.status,
            description: p.description
          }))
        }
      };
    }
  );

  server.registerTool(
    'rigor_pattern_detail',
    {
      title: 'Pattern detail with causal evidence',
      description:
        'Get full details for a single pattern including its causal evidence: did injecting it actually raise first-try acceptance?',
      inputSchema: {
        id_or_name: z.string().describe('The pattern id or name.')
      }
    },
    async (args) => {
      const all = rigor.listPatterns();
      const p = all.find((x) => x.id === args.id_or_name || x.name === args.id_or_name);
      if (!p) {
        return {
          content: [{ type: 'text', text: `Pattern not found: ${args.id_or_name}` }],
          isError: true
        };
      }
      const impact = p.injection_count >= 5 ? computePatternImpact(rigor.store, p.id) : null;
      const lines = [
        `Pattern ${p.name}`,
        `id: ${p.id}`,
        `status: ${p.status}`,
        `size: ${p.size}  density: ${p.density.toFixed(2)}`,
        `injections: ${p.injection_count}  impact: ${p.impact_score >= 0 ? '+' : ''}${p.impact_score.toFixed(3)}`,
        `repos: ${p.repos.join(', ')}  languages: ${p.languages.join(', ')}`,
        '',
        p.description
      ];
      if (impact) {
        lines.push('');
        lines.push('Causal evidence:');
        lines.push(`  with injection FTA:    ${(impact.with_injection_fta * 100).toFixed(1)}% (n=${impact.sample_with})`);
        lines.push(`  without injection FTA: ${(impact.without_injection_fta * 100).toFixed(1)}% (n=${impact.sample_without})`);
        lines.push(`  delta:                 ${impact.delta >= 0 ? '+' : ''}${(impact.delta * 100).toFixed(1)}%`);
      }
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: { pattern: p, causal_evidence: impact }
      };
    }
  );

  server.registerTool(
    'rigor_status',
    {
      title: 'Get rigor status',
      description: 'Get summary status: db path, counts of corrections and patterns by status.',
      inputSchema: {}
    },
    async () => {
      const corrections = rigor.listCorrections();
      const patterns = rigor.listPatterns();
      const summary = {
        db_path: opts.dbPath ?? cfg.dbPath,
        agent: cfg.agent,
        repo: cfg.repo,
        corrections: corrections.length,
        patterns_total: patterns.length,
        patterns_active: patterns.filter((p) => p.status === 'active').length,
        patterns_candidate: patterns.filter((p) => p.status === 'candidate').length,
        patterns_retired: patterns.filter((p) => p.status === 'retired').length
      };
      const text = Object.entries(summary)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      return {
        content: [{ type: 'text', text }],
        structuredContent: summary
      };
    }
  );

  // Wire shutdown.
  const onClose = () => {
    rigor.close();
    process.exit(0);
  };
  process.on('SIGINT', onClose);
  process.on('SIGTERM', onClose);

  return server;
}

function formatRecallResponse(
  patterns: { name: string; description: string; impact_score: number; size: number }[],
  scores: { similarity: number; impact: number }[]
): string {
  const lines = ['These patterns may apply to the task:'];
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const s = scores[i];
    lines.push(
      `${i + 1}. ${p.name}  (similarity=${s.similarity.toFixed(2)}, impact=${p.impact_score >= 0 ? '+' : ''}${p.impact_score.toFixed(2)}, observed in ${p.size} corrections)`
    );
    const desc = p.description.split('\n').slice(0, 2).join(' ').slice(0, 240);
    lines.push(`   ${desc}`);
  }
  return lines.join('\n');
}

// If run directly (rigor-mcp binary), start the stdio server.
const isDirectExecution =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('rigor-mcp');

if (isDirectExecution) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`rigor-mcp failed to start: ${msg}`);
    process.exit(1);
  });
}
