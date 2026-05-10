export { HybridTfIdfProvider } from './tfidf.js';
export { OpenAIEmbeddingProvider } from './openai.js';

/**
 * Cosine similarity between two equal-length vectors.
 * Vectors are typically already L2-normalized (TF-IDF default and OpenAI
 * outputs both are), so this reduces to a dot product. We do the full
 * computation anyway to be safe against unnormalized inputs.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}
