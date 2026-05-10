# userigor

**Telemetry-driven AI coding loop.** Capture corrections, cluster patterns, inject context, measure outcomes.

userigor instruments the gap between what your AI coding agent generates and what actually ships. Every correction becomes a measurement. Every cluster becomes a pattern. Every injection is graded by whether it actually raised first-try acceptance.

```
rigor backfill --limit 200
rigor cluster
rigor inject "add a login form"   →   2 patterns recalled · +18 tokens · sim=0.62
rigor metrics                     →   first_try_acceptance: 64.2%  · drift_distance: 8.1
```

MIT licensed. Local-first. Agent-agnostic via MCP.

---

## Why this exists

Most AI coding tools have no idea if they're getting better. Memory journals tell you what someone wrote down. Rule files tell you what someone said the AI should do. Neither tells you whether your agent is producing more first-try-acceptable code, or less.

userigor takes a different stance:

- **Capture is automatic.** Walk git history, diff each commit against its parent, store the result as a Correction record. No `/learn-rule` rituals.
- **Patterns are clusters, not rules.** Embeddings group similar corrections into Pattern records. Cluster centroids are vectors, not prose.
- **Injection is pre-flight.** Before the agent generates, the most relevant patterns are scored by similarity × impact and dropped into a structured `<rigor:context>` block.
- **Measurement is honest.** First-try acceptance, drift distance, revert rate, correction velocity, and pattern coverage are computed in time windows. Patterns whose injection didn't help get retired automatically.

---

## Install

Pick the surface you use. The CLI alone gets you the full loop.

```bash
# CLI only
npm install -g @userigor/cli
rigor init
rigor backfill --limit 200
rigor cluster
rigor metrics

# With Claude Code (MCP server + skill + slash commands)
npm install -g @userigor/mcp @userigor/claude-code
rigor-claude-code-install

# With Cursor (.cursorrules generator)
npm install -g @userigor/cursor
rigor-cursor

# Local dashboard
npm install -g @userigor/dashboard
rigor-dashboard
```

All packages target Node 20+ and ship as ESM with TypeScript declarations.

---

## Architecture

userigor is a pnpm monorepo of six packages:

```
@userigor/core           ── engine: capture, embed, cluster, inject, metrics
@userigor/cli            ── rigor binary
@userigor/mcp            ── stdio MCP server (rigor_recall, rigor_capture, …)
@userigor/claude-code    ── SKILL.md, slash commands, example MCP/hook configs
@userigor/cursor         ── .cursorrules / .cursor/rules/*.mdc generator
@userigor/dashboard      ── localhost web console
```

Every package depends on `@userigor/core` and nothing else outside the workspace, except the MCP server which adds `@modelcontextprotocol/sdk` and `zod`.

### Data model

```
Correction      one delta between AI output and final commit
Pattern         a cluster of similar corrections, named, scored, statused
Session         one agent invocation with injected patterns and captured corrections
Injection       one event of "patterns X were spliced into prompt Y"
Metric          one computed value over a time window
```

All persisted in a single SQLite database at `~/.rigor/data.db` by default. Vectors stored as Float32 BLOBs; cosine similarity computed in JS. Adequate for collections up to ~50k corrections — beyond that, swap the store for a vec-aware backend via the `Store` interface.

### Pipeline

```
   git history          rigor backfill            Correction[]
                  ──────────────────────────►
                                                       │
                                                       ▼ rigor embed
                                                 Correction[ embedded ]
                                                       │
                                                       ▼ rigor cluster
                                                    Pattern[ active ]
                                                       │
   user prompt    ─────► rigor inject  ─────►  prompt + <rigor:context>
                                                       │
   (agent runs, output is committed; new Correction captured)
                                                       │
                                                       ▼ rigor metrics
                          first_try_acceptance, drift, revert, …
                                                       │
                                                       ▼ rigor prune
                          patterns whose injection didn't help → retired
```

---

## CLI reference

```
rigor init                         Initialize ~/.rigor/ and the local db
rigor status                       Show current setup and counts
rigor capture <before> <after>     Capture a single correction from two files
rigor backfill                     Walk git history and capture corrections
rigor embed                        Embed any pending corrections
rigor cluster                      Form patterns from embedded corrections
rigor patterns [list|show <id>]    List patterns or show details with causal evidence
rigor inject "<prompt>"            Pre-flight: see what context would be injected
rigor metrics                      Show current metric snapshot
rigor series                       Time-series for a single metric
rigor prune                        Retire low-impact / stale patterns
rigor config [show|set]            Read or write configuration
```

Every command takes `--help`. The full set of flags lives in `rigor help`.

---

## MCP tools

The `@userigor/mcp` server exposes seven tools over stdio for any MCP-aware client.

| Tool | Purpose |
|---|---|
| `rigor_recall` | Top patterns for a task. Read-only. Use BEFORE generating. |
| `rigor_capture` | Capture a correction (before, after, file, agent, task). |
| `rigor_cluster` | Re-cluster all corrections. Idempotent. |
| `rigor_metrics` | Current snapshot for the last N days. |
| `rigor_patterns` | List patterns by status. |
| `rigor_pattern_detail` | One pattern + causal evidence (FTA delta). |
| `rigor_status` | System status: counts, db path, agent, repo. |

Register with Claude Code by adding to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "userigor": {
      "command": "npx",
      "args": ["-y", "@userigor/mcp"]
    }
  }
}
```

---

## Metrics dictionary

These are the numbers computed by the engine. Precise definitions, not vibes.

| Metric | Direction | Definition |
|---|---|---|
| `first_try_acceptance` | ↑ better | Fraction of AI outputs accepted with zero edits before commit. The headline number. |
| `edit_after_accept` | ↓ better | Average lines edited after the user clicked accept but before commit. Catches "looked good, had to fix it." |
| `revert_rate` | ↓ better | Fraction of corrections inverted by a later correction within seven days. Catches "shipped, broke later." |
| `correction_velocity` | ↓ better | Median seconds between AI emission and final commit. Time spent correcting is time the loop is failing. |
| `drift_distance` | ↓ better | Mean diff size of corrections in the window. Lower means the AI's output is closer to what shipped. |
| `pattern_coverage` | ↑ better | Fraction of corrections that fall into a known cluster. Higher means the system is recognizing recurring problems. |

### Pattern impact

`Pattern.impact_score` is the difference in `first_try_acceptance` between sessions where the pattern was injected and sessions where it wasn't. Computed automatically once a pattern has 5+ injections. Patterns with high impact get a 50% bonus in the injection score; patterns with low impact and 20+ injections get retired.

---

## How userigor differs from manual rule-files / memory journals

userigor sits in a different category from manual annotation systems. The deltas are deliberate:

| Axis | Manual annotation | userigor |
|---|---|---|
| **Capture** | User types a rule | Auto-extracted from git diffs |
| **Search** | Keyword (FTS) | Semantic (embeddings + cosine clustering) |
| **Injection** | Manual recall via slash command | Pre-flight, MCP-driven, scored |
| **Storage** | Local note files | SQLite + vector BLOBs |
| **Outcome metrics** | None — heatmaps of activity | First-try acceptance, drift, revert, velocity |
| **Causal evidence** | None | FTA delta with vs without injection |
| **Retirement** | Manual edit | Automatic for low-impact patterns |
| **Agent compatibility** | Tied to one agent | Agent-agnostic via MCP, with adapters for Claude Code and Cursor |

Both philosophies are valid. They optimize different things. userigor optimizes for measurement-first feedback loops.

---

## Embedding providers

The default `HybridTfIdfProvider` produces 256-dim dense vectors via TF-IDF over word tokens plus 3-4 char n-grams. Zero external deps, deterministic, fits in a single npm package. Good enough to cluster `rename data → domain term` corrections together regardless of variable name.

For higher-quality clustering, plug in OpenAI:

```ts
import { Rigor, OpenAIEmbeddingProvider } from '@userigor/core';

const rigor = new Rigor({
  embedder: new OpenAIEmbeddingProvider({ model: 'text-embedding-3-small' })
});
```

The `EmbeddingProvider` interface is small (`embed`, `embedBatch`, `dimensions`, `id`). Bring your own.

---

## Repository layout

```
userigor/
├── docs/                  GitHub Pages (landing page)
│   └── index.html
├── packages/
│   ├── core/              @userigor/core
│   ├── cli/               @userigor/cli
│   ├── mcp/               @userigor/mcp
│   ├── claude-code/       @userigor/claude-code
│   ├── cursor/            @userigor/cursor
│   └── dashboard/         @userigor/dashboard
├── DISCLAIMER.md
├── LICENSE                MIT
├── PUBLISHING.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Contributing

All packages use:
- TypeScript strict, ESM only, target node20
- `tsup` for builds
- `node:test` for tests (no Jest, no Vitest, no test deps)
- pnpm workspaces

Run `pnpm install` then `pnpm build` from the repo root. Run tests per package with `pnpm test` or for everything with `pnpm -r test`.

---

## Status

v1.0.0. All six packages implemented, tested, built. See [PUBLISHING.md](./PUBLISHING.md) for npm publish procedure and [DISCLAIMER.md](./DISCLAIMER.md) for the experimental-software notice.

GitHub: https://github.com/Dragoon0x/userigor

---

**Author:** [Dragoon0x](https://github.com/Dragoon0x) · MIT
