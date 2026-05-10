import type { Pattern } from '@userigor/core';

export interface RenderOptions {
  /** Maximum patterns to include. Older / lower-impact patterns drop off. */
  maxPatterns?: number;
  /** Filter by language. */
  language?: string;
  /** Repo context to prepend as a header. */
  repoName?: string;
  /** Include patterns with negative impact_score. Default false. */
  includeNegativeImpact?: boolean;
}

/**
 * Render active patterns as a Cursor rules file.
 *
 * The output is plain markdown with a clear "auto-generated" header so
 * users don't manually edit it (and lose changes on regen). Patterns are
 * sorted by impact then size and trimmed to maxPatterns.
 */
export function renderCursorRules(patterns: Pattern[], options: RenderOptions = {}): string {
  const max = options.maxPatterns ?? 20;
  let filtered = patterns.filter((p) => p.status === 'active');
  if (!options.includeNegativeImpact) {
    filtered = filtered.filter((p) => p.impact_score >= 0);
  }
  if (options.language) {
    filtered = filtered.filter((p) => p.languages.includes(options.language!));
  }
  const sorted = filtered
    .slice()
    .sort((a, b) => b.impact_score - a.impact_score || b.size - a.size)
    .slice(0, max);

  const lines: string[] = [];
  lines.push('# userigor patterns');
  lines.push('# auto-generated · do not edit manually · regenerate with `rigor-cursor`');
  if (options.repoName) lines.push(`# repo: ${options.repoName}`);
  lines.push(`# patterns: ${sorted.length}`);
  lines.push('');
  lines.push('The following coding patterns were learned from past corrections in this codebase.');
  lines.push('Apply them when generating code. Patterns with higher impact have proven causal evidence');
  lines.push('that they raise first-try acceptance.');
  lines.push('');

  if (sorted.length === 0) {
    lines.push('_No active patterns yet. Capture corrections and run `rigor cluster` to seed._');
    return lines.join('\n') + '\n';
  }

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const impact = p.impact_score >= 0 ? `+${p.impact_score.toFixed(2)}` : p.impact_score.toFixed(2);
    lines.push(`## ${i + 1}. ${p.name}`);
    lines.push(
      `_size=${p.size}, injections=${p.injection_count}, impact=${impact}, languages=${p.languages.join(',')}_`
    );
    lines.push('');
    const desc = p.description.split('\n').slice(0, 6).join('\n').trim();
    lines.push(desc);
    lines.push('');
  }

  return lines.join('\n');
}
