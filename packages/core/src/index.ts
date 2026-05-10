/**
 * @userigor/core
 *
 * Telemetry-driven AI coding loop. Capture corrections from git history,
 * cluster them into patterns, inject patterns as context before generation,
 * measure outcomes to validate that injection actually helped.
 *
 *   import { Rigor } from '@userigor/core';
 *   const rigor = new Rigor({ dbPath: '~/.rigor/data.db' });
 *   rigor.init();
 *   await rigor.capture({ before, after, repo, file_path, agent });
 *   await rigor.embedPending();
 *   rigor.cluster();
 *   const result = await rigor.inject('Add a login form');
 */

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

import { buildCorrection, correctionEmbedText } from './capture/index.js';
import type { CaptureInput } from './capture/index.js';
import { SqliteStore } from './store/index.js';
import { HybridTfIdfProvider } from './embed/index.js';
import { clusterCorrections } from './cluster/index.js';
import type { ClusterOptions, ClusterResult } from './cluster/index.js';
import { injectContext } from './inject/index.js';
import type { InjectOptions } from './inject/index.js';
import {
  computeMetrics,
  persistSnapshot,
  prunePatterns
} from './metrics/index.js';
import type { MetricsOptions, MetricsSnapshot } from './metrics/index.js';
import type {
  Correction,
  EmbeddingProvider,
  InjectionResult,
  Pattern,
  Store
} from './types.js';

export interface RigorOptions {
  /** Path to SQLite db. Defaults to ~/.rigor/data.db. */
  dbPath?: string;
  /** Custom store. Bypasses dbPath. */
  store?: Store;
  /** Embedding provider. Defaults to HybridTfIdfProvider(256). */
  embedder?: EmbeddingProvider;
}

export class Rigor {
  readonly store: Store;
  readonly embedder: EmbeddingProvider;
  private dbPath: string;

  constructor(opts: RigorOptions = {}) {
    this.dbPath = opts.dbPath ?? defaultDbPath();
    if (opts.store) {
      this.store = opts.store;
    } else {
      ensureDirFor(this.dbPath);
      this.store = new SqliteStore(this.dbPath);
    }
    this.embedder = opts.embedder ?? new HybridTfIdfProvider(256);
  }

  init(): void {
    if (typeof (this.store as { init?: () => void }).init === 'function') {
      (this.store as { init: () => void }).init();
    }
    // If using TF-IDF and we have a corpus, fit it now.
    if (this.embedder instanceof HybridTfIdfProvider) {
      const corpus = this.store
        .listCorrections({})
        .map((c) => correctionEmbedText(c));
      if (corpus.length > 0) this.embedder.fit(corpus);
    }
  }

  close(): void {
    this.store.close();
  }

  // -------------------- Capture --------------------

  /**
   * Capture a correction. Embeds and stores it. Returns the correction ID
   * or null if before === after.
   */
  async capture(input: CaptureInput): Promise<string | null> {
    const correction = buildCorrection(input);
    if (!correction) return null;
    this.store.insertCorrection(correction);
    await this.embedCorrection(correction.id);
    return correction.id;
  }

  /** Embed all corrections that don't yet have an embedding. */
  async embedPending(): Promise<number> {
    const pending = this.store.listCorrections({ status: 'captured' });
    if (pending.length === 0) return 0;
    if (this.embedder instanceof HybridTfIdfProvider && !this.embedder.isFitted()) {
      const corpus = this.store
        .listCorrections({})
        .map((c) => correctionEmbedText(c));
      this.embedder.fit(corpus);
    }
    for (const c of pending) {
      const text = correctionEmbedText(c);
      const vec = await this.embedder.embed(text);
      this.store.updateCorrectionEmbedding(c.id, vec);
    }
    return pending.length;
  }

  private async embedCorrection(id: string): Promise<void> {
    const c = this.store.getCorrection(id);
    if (!c) return;
    if (this.embedder instanceof HybridTfIdfProvider && !this.embedder.isFitted()) {
      const corpus = this.store
        .listCorrections({})
        .map((x) => correctionEmbedText(x));
      if (corpus.length >= 5) this.embedder.fit(corpus);
    }
    const text = correctionEmbedText(c);
    const vec = await this.embedder.embed(text);
    this.store.updateCorrectionEmbedding(id, vec);
  }

  // -------------------- Cluster --------------------

  cluster(opts?: ClusterOptions): ClusterResult {
    return clusterCorrections(this.store, opts);
  }

  // -------------------- Inject --------------------

  async inject(prompt: string, opts?: InjectOptions): Promise<InjectionResult> {
    return injectContext(this.store, this.embedder, prompt, opts);
  }

  // -------------------- Metrics --------------------

  metrics(opts?: MetricsOptions): MetricsSnapshot {
    return computeMetrics(this.store, opts);
  }

  snapshotMetrics(opts?: MetricsOptions): MetricsSnapshot {
    const snap = this.metrics(opts);
    persistSnapshot(this.store, snap);
    return snap;
  }

  prune(): { retired: number; deleted: number; updated: number } {
    return prunePatterns(this.store);
  }

  // -------------------- Convenience --------------------

  listCorrections(): Correction[] {
    return this.store.listCorrections({});
  }

  listPatterns(): Pattern[] {
    return this.store.listPatterns({});
  }
}

function defaultDbPath(): string {
  return resolve(homedir(), '.rigor', 'data.db');
}

function ensureDirFor(path: string): void {
  const dir = path.split('/').slice(0, -1).join('/');
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Re-exports
export type {
  Agent,
  Correction,
  CorrectionFilter,
  CorrectionStatus,
  EmbeddingProvider,
  Injection,
  InjectionResult,
  Metric,
  MetricFilter,
  MetricName,
  Pattern,
  PatternFilter,
  PatternStatus,
  Session,
  SessionFilter,
  Store
} from './types.js';

export { SqliteStore } from './store/index.js';
export { HybridTfIdfProvider, OpenAIEmbeddingProvider, cosineSimilarity } from './embed/index.js';
export { clusterCorrections } from './cluster/index.js';
export type { ClusterOptions, ClusterResult } from './cluster/index.js';
export {
  computeMetrics,
  persistSnapshot,
  timeSeries,
  computePatternImpact,
  prunePatterns
} from './metrics/index.js';
export type { MetricsOptions, MetricsSnapshot } from './metrics/index.js';
export { injectContext } from './inject/index.js';
export type { InjectOptions } from './inject/index.js';
export { buildCorrection, correctionEmbedText, GitClient, diffLines, detectLanguage } from './capture/index.js';
export type { CaptureInput, GitCommit, DiffStats } from './capture/index.js';
