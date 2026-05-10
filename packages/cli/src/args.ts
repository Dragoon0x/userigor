/**
 * Minimal arg parser. We deliberately avoid commander/yargs to keep the
 * dependency tree tiny.
 *
 * Supports:
 *   - positional args
 *   - --flag (boolean)
 *   - --key=value
 *   - --key value
 *   - -k value (short form)
 */

export interface ParsedArgs {
  command: string;
  subcommand: string | null;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx >= 0) {
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
        i++;
        continue;
      }
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
      continue;
    }
    positionals.push(arg);
    i++;
  }

  const command = positionals.shift() ?? '';
  // Subcommand pattern only for known commands with sub-actions.
  const COMMANDS_WITH_SUB = new Set(['patterns', 'config']);
  let subcommand: string | null = null;
  if (COMMANDS_WITH_SUB.has(command) && positionals.length > 0) {
    subcommand = positionals.shift() ?? null;
  }

  return { command, subcommand, positionals, flags };
}
