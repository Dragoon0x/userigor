/**
 * Tiny terminal helpers. No deps. ANSI colors only when stdout is a TTY.
 */

const isTTY = process.stdout.isTTY;

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  amber: '\x1b[38;2;255;176;0m'
};

function wrap(code: string, text: string): string {
  return isTTY ? code + text + ANSI.reset : text;
}

export const c = {
  bold: (t: string) => wrap(ANSI.bold, t),
  dim: (t: string) => wrap(ANSI.dim, t),
  red: (t: string) => wrap(ANSI.red, t),
  green: (t: string) => wrap(ANSI.green, t),
  yellow: (t: string) => wrap(ANSI.yellow, t),
  cyan: (t: string) => wrap(ANSI.cyan, t),
  amber: (t: string) => wrap(ANSI.amber, t),
  magenta: (t: string) => wrap(ANSI.magenta, t),
  blue: (t: string) => wrap(ANSI.blue, t)
};

export function table(rows: string[][], opts: { header?: boolean } = {}): string {
  if (rows.length === 0) return '';
  const cols = rows[0].length;
  const widths = new Array(cols).fill(0);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      const len = stripAnsi(row[i] ?? '').length;
      if (len > widths[i]) widths[i] = len;
    }
  }
  const lines: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const padded = row.map((cell, i) => {
      const text = cell ?? '';
      const visible = stripAnsi(text);
      const pad = ' '.repeat(Math.max(0, widths[i] - visible.length));
      return text + pad;
    });
    const line = padded.join('  ');
    lines.push(opts.header && r === 0 ? c.bold(line) : line);
    if (opts.header && r === 0) {
      lines.push(c.dim('-'.repeat(widths.reduce((a, w) => a + w + 2, -2))));
    }
  }
  return lines.join('\n');
}

export function bar(value: number, max: number, width = 20): string {
  if (max === 0) return ' '.repeat(width);
  const filled = Math.min(width, Math.round((value / max) * width));
  return c.amber('█'.repeat(filled)) + c.dim('░'.repeat(width - filled));
}

export function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function header(title: string): string {
  return [
    '',
    c.bold(c.amber('● ' + title)),
    c.dim('─'.repeat(Math.max(20, title.length + 4))),
    ''
  ].join('\n');
}

export function fail(msg: string, code = 1): never {
  console.error(c.red('✗ ') + msg);
  process.exit(code);
}

export function ok(msg: string): void {
  console.log(c.green('✓ ') + msg);
}

export function info(msg: string): void {
  console.log(c.dim('› ') + msg);
}
