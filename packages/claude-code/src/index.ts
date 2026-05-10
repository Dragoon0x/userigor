/**
 * @userigor/claude-code
 *
 * Adapter that bundles the SKILL.md, slash commands, and example MCP/hook
 * configurations for Claude Code. Use the `rigor-claude-code-install`
 * binary to drop everything into ~/.claude/.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

export const TEMPLATE_PATHS = {
  skill: resolve(TEMPLATES_DIR, 'SKILL.md'),
  recallCommand: resolve(TEMPLATES_DIR, 'commands', 'rigor-recall.md'),
  metricsCommand: resolve(TEMPLATES_DIR, 'commands', 'rigor-metrics.md'),
  patternsCommand: resolve(TEMPLATES_DIR, 'commands', 'rigor-patterns.md'),
  hookExample: resolve(TEMPLATES_DIR, 'hooks', 'settings.example.json'),
  mcpExample: resolve(TEMPLATES_DIR, 'mcp.example.json')
} as const;

export function readTemplate(key: keyof typeof TEMPLATE_PATHS): string {
  return readFileSync(TEMPLATE_PATHS[key], 'utf8');
}
