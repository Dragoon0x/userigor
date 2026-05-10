#!/usr/bin/env node
/**
 * `rigor` — the userigor command-line interface.
 *
 * Dispatches subcommands to handlers in commands.ts.
 */
import { parseArgs } from './args.js';
import {
  cmdInit,
  cmdCapture,
  cmdBackfill,
  cmdEmbed,
  cmdCluster,
  cmdMetrics,
  cmdSeries,
  cmdPatterns,
  cmdInject,
  cmdPrune,
  cmdStatus,
  cmdConfig
} from './commands.js';
import { c, fail } from './output.js';

const VERSION = '1.0.0';

const HELP = `${c.bold(c.amber('rigor'))}  ·  telemetry-driven AI coding loop  ·  v${VERSION}

${c.bold('Usage')}
  rigor <command> [options]

${c.bold('Commands')}
  init                            Initialize ~/.rigor/ and the local db
  status                          Show current setup and counts
  capture <before> <after>        Capture a single correction from two files
  backfill                        Walk git history and capture corrections
  embed                           Embed any pending corrections
  cluster                         Form patterns from embedded corrections
  patterns [list|show <id>]       List patterns or show details with causal evidence
  inject "<prompt>"               Pre-flight: see what context would be injected
  metrics                         Show current metric snapshot
  series                          Time-series for a single metric
  prune                           Retire low-impact / stale patterns
  config [show|set]               Read or write configuration

${c.bold('Common flags')}
  --days <n>                      Window for metrics / series (default 30)
  --threshold <0..1>              Cluster similarity threshold (default 0.45)
  --min-size <n>                  Minimum cluster size (default 2)
  --top-k <n>                     Patterns to inject (default 3)
  --min-sim <0..1>                Minimum similarity for injection (default 0.30)
  --dry                           Don't persist (for inject)
  --status <active|candidate|retired|all>   Filter for patterns list

${c.bold('Examples')}
  rigor init --agent claude-code
  rigor backfill --limit 200
  rigor cluster --threshold 0.40
  rigor patterns
  rigor patterns show typescript:rename-variable
  rigor inject "add error handling to fetchUser"
  rigor metrics --days 7

${c.dim('docs: https://github.com/Dragoon0x/userigor')}
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (!args.command || args.command === 'help' || args.flags.help === true || args.flags.h === true) {
    console.log(HELP);
    return;
  }
  if (args.command === 'version' || args.flags.version === true || args.flags.v === true) {
    console.log(VERSION);
    return;
  }

  switch (args.command) {
    case 'init':
      await cmdInit(args);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'capture':
      await cmdCapture(args);
      break;
    case 'backfill':
      await cmdBackfill(args);
      break;
    case 'embed':
      await cmdEmbed();
      break;
    case 'cluster':
      await cmdCluster(args);
      break;
    case 'patterns':
      await cmdPatterns(args);
      break;
    case 'inject':
      await cmdInject(args);
      break;
    case 'metrics':
      await cmdMetrics(args);
      break;
    case 'series':
      await cmdSeries(args);
      break;
    case 'prune':
      await cmdPrune();
      break;
    case 'config':
      await cmdConfig(args);
      break;
    default:
      fail(`unknown command: ${args.command}\nrun ${c.cyan('rigor help')} to see available commands`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  fail(msg);
});
