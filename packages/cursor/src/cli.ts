#!/usr/bin/env node
/**
 * `rigor-cursor` — generate a `.cursorrules` file (or `.cursor/rules/userigor.md`)
 * from active userigor patterns.
 *
 * Usage:
 *   rigor-cursor                       Write .cursorrules in cwd
 *   rigor-cursor --output path.md      Write to custom path
 *   rigor-cursor --max 10              Cap to 10 patterns
 *   rigor-cursor --language typescript Filter by language
 *   rigor-cursor --stdout              Print to stdout, don't write
 *   rigor-cursor --modern              Write to .cursor/rules/userigor.mdc
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { Rigor } from '@userigor/core';
import { renderCursorRules } from './render.js';

interface Flags {
  output?: string;
  max?: number;
  language?: string;
  repo?: string;
  stdout?: boolean;
  modern?: boolean;
  help?: boolean;
}

function parse(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--stdout') flags.stdout = true;
    else if (a === '--modern') flags.modern = true;
    else if (a === '--output' || a === '-o') flags.output = argv[++i];
    else if (a === '--max') flags.max = parseInt(argv[++i], 10);
    else if (a === '--language' || a === '--lang') flags.language = argv[++i];
    else if (a === '--repo') flags.repo = argv[++i];
  }
  return flags;
}

function loadDbPath(): string {
  const cfgPath = resolve(homedir(), '.rigor', 'config.json');
  if (existsSync(cfgPath)) {
    try {
      const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
      if (raw.dbPath) return raw.dbPath;
    } catch {
      // fall through
    }
  }
  return resolve(homedir(), '.rigor', 'data.db');
}

const HELP = `rigor-cursor · render userigor patterns as Cursor rules

Usage:
  rigor-cursor                       Write .cursorrules in cwd
  rigor-cursor --output path.md      Write to custom path
  rigor-cursor --max 10              Cap to 10 patterns
  rigor-cursor --language typescript Filter by language
  rigor-cursor --stdout              Print to stdout, don't write
  rigor-cursor --modern              Write to .cursor/rules/userigor.mdc
`;

function main(): void {
  const flags = parse(process.argv);
  if (flags.help) {
    console.log(HELP);
    return;
  }
  const rigor = new Rigor({ dbPath: loadDbPath() });
  rigor.init();
  const patterns = rigor.listPatterns();
  const text = renderCursorRules(patterns, {
    maxPatterns: flags.max,
    language: flags.language,
    repoName: flags.repo
  });
  rigor.close();

  if (flags.stdout) {
    process.stdout.write(text);
    return;
  }
  const outPath = flags.output
    ? resolve(flags.output)
    : flags.modern
    ? resolve(process.cwd(), '.cursor', 'rules', 'userigor.mdc')
    : resolve(process.cwd(), '.cursorrules');

  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, text);
  console.log(`wrote ${patterns.filter((p) => p.status === 'active').length} active patterns to ${outPath}`);
}

main();
