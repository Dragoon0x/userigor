import { randomUUID } from 'node:crypto';
import type { Correction, Pattern, Store } from '../types.js';
import { cosineSimilarity } from '../embed/index.js';

export interface ClusterOptions {
  /** Minimum similarity to consider two corrections in the same cluster. */
  similarityThreshold?: number;
  /** Minimum points to form a cluster (DBSCAN-style minPts). */
  minClusterSize?: number;
  /** Optional repo filter. */
  repo?: string;
  /** Optional language filter. */
  language?: string;
}

export interface ClusterResult {
  clustersCreated: number;
  clustersUpdated: number;
  patternsCreated: Pattern[];
  orphans: number;
}

/**
 * Cluster corrections into patterns.
 *
 * Algorithm: a simplified DBSCAN over cosine similarity.
 *   1. Build similarity graph (edge if sim >= threshold).
 *   2. Find connected components with size >= minClusterSize.
 *   3. Each component becomes a Pattern with computed centroid and density.
 *   4. Corrections not in any qualifying component are marked as orphans
 *      (cluster_id = null, status = 'orphan').
 *
 * This is run periodically (e.g. nightly or after batch capture) rather
 * than on every insert, since clustering is O(n^2) over corrections.
 */
export function clusterCorrections(
  store: Store,
  options: ClusterOptions = {}
): ClusterResult {
  const threshold = options.similarityThreshold ?? 0.45;
  const minClusterSize = options.minClusterSize ?? 2;
  const corrections = store.listCorrections({
    repo: options.repo,
    language: options.language,
    status: 'embedded'
  });
  // Also include already-clustered corrections so we can recompute clusters
  // when the data has shifted.
  const clusteredCorrections = store.listCorrections({
    repo: options.repo,
    language: options.language,
    status: 'clustered'
  });
  const allCorrections = [...corrections, ...clusteredCorrections].filter(
    (c) => c.embedding && c.embedding.length > 0
  );

  if (allCorrections.length < minClusterSize) {
    return { clustersCreated: 0, clustersUpdated: 0, patternsCreated: [], orphans: allCorrections.length };
  }

  // Build adjacency: for each correction, neighbors with sim >= threshold.
  const n = allCorrections.length;
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(allCorrections[i].embedding!, allCorrections[j].embedding!);
      if (sim >= threshold) {
        neighbors[i].push(j);
        neighbors[j].push(i);
      }
    }
  }

  // Connected components via BFS.
  const visited = new Array(n).fill(false);
  const components: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const queue = [i];
    visited[i] = true;
    const comp: number[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      comp.push(u);
      for (const v of neighbors[u]) {
        if (!visited[v]) {
          visited[v] = true;
          queue.push(v);
        }
      }
    }
    components.push(comp);
  }

  // Drop existing patterns first (we're recomputing).
  // We preserve impact_score and injection_count by name match if possible.
  const oldPatterns = store.listPatterns({});
  const oldByName = new Map(oldPatterns.map((p) => [p.name, p]));
  for (const p of oldPatterns) store.deletePattern(p.id);

  // Reset cluster_id for all corrections so we can reassign cleanly.
  for (const c of allCorrections) store.updateCorrectionCluster(c.id, null);

  const created: Pattern[] = [];
  let orphans = 0;

  for (const comp of components) {
    if (comp.length < minClusterSize) {
      orphans += comp.length;
      continue;
    }
    const members = comp.map((idx) => allCorrections[idx]);
    const dim = members[0].embedding!.length;
    const centroid = new Array(dim).fill(0);
    for (const m of members) {
      for (let i = 0; i < dim; i++) centroid[i] += m.embedding![i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= members.length;
    // Density: average pairwise similarity inside the cluster.
    let pairCount = 0;
    let simSum = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        simSum += cosineSimilarity(members[i].embedding!, members[j].embedding!);
        pairCount++;
      }
    }
    const density = pairCount === 0 ? 1 : simSum / pairCount;
    const name = generatePatternName(members);
    const description = generatePatternDescription(members);
    const repos = Array.from(new Set(members.map((m) => m.repo)));
    const languages = Array.from(new Set(members.map((m) => m.language)));
    const previous = oldByName.get(name);
    const pattern: Pattern = {
      id: randomUUID(),
      created_at: previous?.created_at ?? Date.now(),
      updated_at: Date.now(),
      name,
      description,
      member_correction_ids: members.map((m) => m.id),
      size: members.length,
      density,
      centroid,
      status: members.length >= 3 ? 'active' : 'candidate',
      injection_count: previous?.injection_count ?? 0,
      impact_score: previous?.impact_score ?? 0,
      repos,
      languages,
      notes: previous?.notes ?? null
    };
    store.insertPattern(pattern);
    for (const m of members) store.updateCorrectionCluster(m.id, pattern.id);
    created.push(pattern);
  }

  return {
    clustersCreated: created.length,
    clustersUpdated: 0,
    patternsCreated: created,
    orphans
  };
}

/**
 * Generate a stub pattern name from members. This is intentionally
 * deterministic and doesn't require an LLM. Users can rename via the CLI
 * or dashboard. An optional LLM-based renamer can be plugged in later.
 */
function generatePatternName(members: Correction[]): string {
  const langs = new Set(members.map((m) => m.language));
  const lang = langs.size === 1 ? Array.from(langs)[0] : 'multi';
  // Find most common short words across diffs as a rough topic.
  const wordCount = new Map<string, number>();
  for (const m of members) {
    const words = m.diff
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && w.length <= 14 && !STOP_WORDS.has(w));
    for (const w of words) {
      wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
    }
  }
  const topWords = Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  const tag = topWords.length > 0 ? topWords.join('-') : 'pattern';
  return `${lang}:${tag}`;
}

function generatePatternDescription(members: Correction[]): string {
  const exampleTask = members.find((m) => m.task_description)?.task_description;
  const exampleDiff = members[0].diff.split('\n').slice(0, 6).join('\n');
  const repoCount = new Set(members.map((m) => m.repo)).size;
  const lines: string[] = [];
  lines.push(`Captured from ${members.length} corrections across ${repoCount} repo${repoCount === 1 ? '' : 's'}.`);
  if (exampleTask) lines.push(`Example task: ${exampleTask}`);
  lines.push('Example diff:');
  lines.push(exampleDiff);
  return lines.join('\n');
}

const STOP_WORDS = new Set([
  'this',
  'that',
  'with',
  'from',
  'have',
  'were',
  'they',
  'been',
  'will',
  'when',
  'what',
  'your',
  'into',
  'them',
  'than',
  'then',
  'some',
  'more',
  'such',
  'each',
  'over',
  'only',
  'also',
  'just',
  'like',
  'most',
  'because',
  'about',
  'after',
  'before',
  'where',
  'while',
  'which',
  'these',
  'those',
  'their',
  'there',
  'function',
  'return',
  'const',
  'import',
  'export',
  'class',
  'public',
  'private',
  'static',
  'value',
  'string'
]);
