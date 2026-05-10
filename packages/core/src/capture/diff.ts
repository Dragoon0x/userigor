/**
 * Lightweight unified-diff generator and parser.
 *
 * We avoid pulling in a full diff library because we only need:
 *  - "is text A different from text B" (boolean)
 *  - line-level diff size (for diff_size)
 *  - a printable diff blob for storage
 *
 * Implements Myers diff at line granularity. Adequate for typical file
 * change sizes (sub-1000 lines per change). For huge files, falls back to
 * a fast LCS-by-line approach.
 */

export interface DiffStats {
  additions: number;
  deletions: number;
  /** Sum of additions and deletions. */
  size: number;
  /** Unified-format diff text. */
  unified: string;
}

export function diffLines(before: string, after: string, context = 3): DiffStats {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const ops = lcsDiff(a, b);
  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.type === 'add') additions++;
    if (op.type === 'del') deletions++;
  }
  return {
    additions,
    deletions,
    size: additions + deletions,
    unified: renderUnified(ops, a, b, context)
  };
}

type Op = { type: 'eq' | 'add' | 'del'; aIdx: number; bIdx: number };

function lcsDiff(a: string[], b: string[]): Op[] {
  // Fast path for small inputs: full DP. For large inputs, fall back to
  // greedy line matching, which is approximate but never explodes.
  const max = 4000;
  if (a.length * b.length > max * max) return greedyLineDiff(a, b);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: Op[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'eq', aIdx: i - 1, bIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.unshift({ type: 'del', aIdx: i - 1, bIdx: j });
      i--;
    } else {
      ops.unshift({ type: 'add', aIdx: i, bIdx: j - 1 });
      j--;
    }
  }
  while (i > 0) {
    ops.unshift({ type: 'del', aIdx: i - 1, bIdx: 0 });
    i--;
  }
  while (j > 0) {
    ops.unshift({ type: 'add', aIdx: 0, bIdx: j - 1 });
    j--;
  }
  return ops;
}

function greedyLineDiff(a: string[], b: string[]): Op[] {
  const ops: Op[] = [];
  const bSet = new Set(b);
  let bIdx = 0;
  for (let i = 0; i < a.length; i++) {
    if (bSet.has(a[i])) {
      while (bIdx < b.length && b[bIdx] !== a[i]) {
        ops.push({ type: 'add', aIdx: i, bIdx });
        bIdx++;
      }
      if (bIdx < b.length) {
        ops.push({ type: 'eq', aIdx: i, bIdx });
        bIdx++;
      }
    } else {
      ops.push({ type: 'del', aIdx: i, bIdx });
    }
  }
  while (bIdx < b.length) {
    ops.push({ type: 'add', aIdx: a.length, bIdx });
    bIdx++;
  }
  return ops;
}

function renderUnified(ops: Op[], a: string[], b: string[], context: number): string {
  const out: string[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === 'eq') {
      i++;
      continue;
    }
    // Find the end of the current change block including context.
    const start = Math.max(0, i - context);
    let end = i;
    while (end < ops.length && (ops[end].type !== 'eq' || nearChange(ops, end, context))) {
      end++;
    }
    end = Math.min(ops.length, end + context);
    const aStart = ops[start].aIdx;
    const bStart = ops[start].bIdx;
    const aLines = ops.slice(start, end).filter((o) => o.type !== 'add').length;
    const bLines = ops.slice(start, end).filter((o) => o.type !== 'del').length;
    out.push(`@@ -${aStart + 1},${aLines} +${bStart + 1},${bLines} @@`);
    for (const op of ops.slice(start, end)) {
      if (op.type === 'eq') out.push(' ' + a[op.aIdx]);
      else if (op.type === 'del') out.push('-' + a[op.aIdx]);
      else out.push('+' + b[op.bIdx]);
    }
    i = end;
  }
  return out.join('\n');
}

function nearChange(ops: Op[], idx: number, context: number): boolean {
  for (let k = 1; k <= context; k++) {
    const ahead = ops[idx + k];
    if (ahead && ahead.type !== 'eq') return true;
  }
  return false;
}

/**
 * Detect language from file path. Returns "unknown" when extension isn't in
 * the table. Intentionally limited — no need for a full linguist port.
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    md: 'markdown',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    sql: 'sql',
    vue: 'vue',
    svelte: 'svelte'
  };
  return map[ext] ?? 'unknown';
}
