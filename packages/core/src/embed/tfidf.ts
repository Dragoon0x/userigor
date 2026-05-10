import type { EmbeddingProvider } from '../types.js';

/**
 * Hybrid TF-IDF + character n-gram embedding.
 *
 * This is the default provider. It produces fixed-dimensional dense vectors
 * by hashing word and character n-gram tokens into D-sized buckets and
 * weighting them by TF-IDF on the corpus.
 *
 * Two-pass design:
 *   pass 1 (corpus build): observe documents, compute IDF per token bucket
 *   pass 2 (embed): hash tokens, weight by TF * IDF, L2-normalize
 *
 * Why this default over BM25/FTS5:
 * - Captures morphological similarity (stemming-free) via char n-grams
 * - Produces dense vectors compatible with the rest of the engine
 * - Zero native deps, pure JS, deterministic
 * - Significantly stronger than keyword search for clustering correction
 *   text where words like "rename", "renamed", "renaming" should cluster
 *
 * For better quality, swap with a neural provider via the EmbeddingProvider
 * interface. The store, cluster engine, and inject engine treat all
 * providers identically.
 */
export class HybridTfIdfProvider implements EmbeddingProvider {
  readonly id = 'tfidf-ngram-v1';
  readonly dimensions: number;
  private idf: Float32Array;
  private corpusSize = 0;
  private documentFrequencies: Uint32Array;
  private fitted = false;

  constructor(dimensions = 256) {
    if (dimensions < 64) throw new Error('dimensions must be >= 64');
    this.dimensions = dimensions;
    this.idf = new Float32Array(dimensions);
    this.documentFrequencies = new Uint32Array(dimensions);
    // Default uniform IDF until fit() is called.
    this.idf.fill(1.0);
  }

  /**
   * Build the IDF vector from a corpus. Recommended before bulk-embedding
   * a backlog. New corrections after fit are still embeddable but won't
   * influence IDF until fit is re-run.
   */
  fit(documents: string[]): void {
    this.documentFrequencies = new Uint32Array(this.dimensions);
    this.corpusSize = documents.length;
    for (const doc of documents) {
      const seen = new Set<number>();
      for (const bucket of tokenize(doc, this.dimensions)) {
        seen.add(bucket);
      }
      for (const bucket of seen) this.documentFrequencies[bucket]++;
    }
    for (let i = 0; i < this.dimensions; i++) {
      const df = this.documentFrequencies[i] || 0.5; // smoothing
      this.idf[i] = Math.log((this.corpusSize + 1) / df) + 1;
    }
    this.fitted = true;
  }

  isFitted(): boolean {
    return this.fitted;
  }

  async embed(text: string): Promise<number[]> {
    return this.embedSync(text);
  }

  embedSync(text: string): number[] {
    const tf = new Float32Array(this.dimensions);
    let total = 0;
    for (const bucket of tokenize(text, this.dimensions)) {
      tf[bucket]++;
      total++;
    }
    if (total === 0) return new Array(this.dimensions).fill(0);
    const out = new Float32Array(this.dimensions);
    let mag2 = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const v = (tf[i] / total) * this.idf[i];
      out[i] = v;
      mag2 += v * v;
    }
    const mag = Math.sqrt(mag2) || 1;
    for (let i = 0; i < this.dimensions; i++) out[i] /= mag;
    return Array.from(out);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedSync(t));
  }

  /**
   * Serialize the fitted state so it can be persisted alongside the store.
   * Without this, the IDF vector is lost across processes.
   */
  toJSON(): { id: string; dimensions: number; corpusSize: number; df: number[] } {
    return {
      id: this.id,
      dimensions: this.dimensions,
      corpusSize: this.corpusSize,
      df: Array.from(this.documentFrequencies)
    };
  }

  static fromJSON(data: ReturnType<HybridTfIdfProvider['toJSON']>): HybridTfIdfProvider {
    const p = new HybridTfIdfProvider(data.dimensions);
    p.corpusSize = data.corpusSize;
    p.documentFrequencies = new Uint32Array(data.df);
    for (let i = 0; i < p.dimensions; i++) {
      const df = p.documentFrequencies[i] || 0.5;
      p.idf[i] = Math.log((p.corpusSize + 1) / df) + 1;
    }
    p.fitted = true;
    return p;
  }
}

/**
 * Tokenize text into hashed bucket indices.
 * Combines word tokens and 3-4 char n-grams for morphological signal.
 */
function* tokenize(text: string, dim: number): Generator<number> {
  const lower = text.toLowerCase();
  // Word tokens
  const words = lower.split(/[^a-z0-9_]+/).filter(Boolean);
  for (const w of words) {
    if (w.length < 2) continue;
    yield hashToken('w:' + w, dim);
  }
  // Char n-grams (3 and 4) on padded words
  for (const w of words) {
    if (w.length < 3) continue;
    const padded = ' ' + w + ' ';
    for (let i = 0; i + 3 <= padded.length; i++) {
      yield hashToken('g3:' + padded.slice(i, i + 3), dim);
    }
    if (padded.length >= 4) {
      for (let i = 0; i + 4 <= padded.length; i++) {
        yield hashToken('g4:' + padded.slice(i, i + 4), dim);
      }
    }
  }
}

/**
 * 32-bit FNV-1a hash, modulo dimensions.
 */
function hashToken(token: string, dim: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Convert to unsigned and mod
  return (h >>> 0) % dim;
}
