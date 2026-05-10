import { randomUUID } from 'node:crypto';
import type {
  EmbeddingProvider,
  Injection,
  InjectionResult,
  Pattern,
  Store
} from '../types.js';
import { cosineSimilarity } from '../embed/index.js';

export interface InjectOptions {
  /** Max number of patterns to inject. */
  topK?: number;
  /** Minimum similarity to consider a pattern relevant. */
  minSimilarity?: number;
  /** Optional repo context for filtering. */
  repo?: string;
  /** Optional language context for filtering. */
  language?: string;
  /** Session ID to attribute the injection to. */
  sessionId?: string;
  /** Skip retired patterns (default true). */
  excludeRetired?: boolean;
  /** Persist the injection record (default true). */
  persist?: boolean;
}

/**
 * Inject relevant patterns into a prompt before the AI sees it.
 *
 * This is the moment of intervention. Pre-flight, we:
 *   1. Embed the user's prompt with the same provider used for storage.
 *   2. Score every active pattern by (similarity * (1 + impact_score)).
 *      Impact-weighted scoring promotes patterns that have proven they
 *      actually help, not just patterns that look textually similar.
 *   3. Inject the top K above threshold as a structured context block.
 *
 * The augmented prompt format is intentionally minimal and machine-friendly
 * so any agent (Claude Code, Cursor, Codex, custom MCP clients) can either
 * pass it through verbatim or strip it.
 */
export async function injectContext(
  store: Store,
  embedder: EmbeddingProvider,
  prompt: string,
  options: InjectOptions = {}
): Promise<InjectionResult> {
  const topK = options.topK ?? 3;
  const minSim = options.minSimilarity ?? 0.30;
  const promptEmbedding = await embedder.embed(prompt);
  const candidates = store.listPatterns({
    repo: options.repo,
    language: options.language,
    status: options.excludeRetired === false ? undefined : 'active'
  });
  const scored = candidates
    .map((p) => {
      const sim = p.centroid.length === promptEmbedding.length
        ? cosineSimilarity(promptEmbedding, p.centroid)
        : 0;
      // Patterns earn up to a 50% bonus from a strong impact score.
      // impact_score is bounded by definition (0..1 typical, can be slightly negative).
      const impactWeight = 1 + Math.max(0, Math.min(0.5, p.impact_score));
      return { pattern: p, similarity: sim, score: sim * impactWeight };
    })
    .filter((s) => s.similarity >= minSim)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const patterns = scored.map((s) => s.pattern);
  const augmented = buildAugmentedPrompt(prompt, patterns);
  const tokensAdded = roughTokenCount(augmented) - roughTokenCount(prompt);

  if (options.persist !== false && patterns.length > 0) {
    const injection: Injection = {
      id: randomUUID(),
      session_id: options.sessionId ?? null,
      pattern_ids: patterns.map((p) => p.id),
      prompt_before: prompt,
      prompt_after: augmented,
      tokens_added: tokensAdded,
      timestamp: Date.now()
    };
    store.insertInjection(injection);
    // Bump injection_count on each pattern.
    for (const p of patterns) {
      p.injection_count++;
      p.updated_at = Date.now();
      store.updatePattern(p);
    }
  }

  return {
    patterns,
    augmented_prompt: augmented,
    tokens_added: tokensAdded,
    scores: scored.map((s) => ({
      pattern_id: s.pattern.id,
      similarity: round(s.similarity, 4),
      impact: round(s.pattern.impact_score, 4)
    }))
  };
}

/**
 * Format pattern context for injection. Designed to be:
 *   - Machine-parseable (clear delimiter, JSON-ish structure)
 *   - Human-readable (the model can use it as natural-language guidance)
 *   - Cheap (no boilerplate, no decoration)
 */
function buildAugmentedPrompt(prompt: string, patterns: Pattern[]): string {
  if (patterns.length === 0) return prompt;
  const lines: string[] = [];
  lines.push('<rigor:context>');
  lines.push(
    'These patterns were learned from past corrections in this codebase.',
    'Apply them where relevant. Do not surface them in the response.',
    ''
  );
  for (const p of patterns) {
    lines.push(`- ${p.name} (size=${p.size}, impact=${p.impact_score >= 0 ? '+' : ''}${p.impact_score.toFixed(2)})`);
    const desc = p.description.split('\n').slice(0, 3).join(' ').slice(0, 200);
    lines.push(`  ${desc}`);
  }
  lines.push('</rigor:context>');
  lines.push('');
  lines.push(prompt);
  return lines.join('\n');
}

/**
 * Rough token estimate: ~4 chars per token. Good enough for the budgeting
 * decisions we make here (e.g. "did we add too much"). Real tokenization
 * is left to the agent.
 */
function roughTokenCount(s: string): number {
  return Math.ceil(s.length / 4);
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
