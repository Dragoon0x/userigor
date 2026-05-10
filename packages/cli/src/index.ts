/**
 * @userigor/cli library exports.
 *
 * The package's primary use is the `rigor` binary, but the command
 * implementations and arg parser are exposed for programmatic embedding
 * (e.g., a custom wrapper that adds extra subcommands).
 */
export { parseArgs } from './args.js';
export type { ParsedArgs } from './args.js';
export {
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
export { c, table, header, ok, info, fail, pct, bar } from './output.js';
