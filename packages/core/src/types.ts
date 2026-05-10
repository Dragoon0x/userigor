/**
 * userigor core types.
 *
 * The data model is built around a single insight: every correction is a
 * delta between what the AI produced and what shipped. That delta is the
 * unit of learning. Patterns are clusters of corrections. Outcomes are
 * downstream measurements that prove (or disprove) that injecting a pattern
 * helped.
 */

export type Agent =
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'gemini-cli'
  | 'copilot'
  | 'aider'
  | 'unknown';

export type CorrectionStatus = 'captured' | 'embedded' | 'clustered' | 'orphan';

export type PatternStatus = 'candidate' | 'active' | 'retired';

/**
 * A single captured correction. Created when a user-edited git commit
 * differs from the AI's last suggested output for the same file region.
 */
export interface Correction {
  id: string;
  created_at: number;
  repo: string;
  file_path: string;
  language: string;
  /** AI's original output. */
  before: string;
  /** Final committed text. */
  after: string;
  /** Unified-style diff for display. */
  diff: string;
  /** Number of changed lines (sum of additions and deletions). */
  diff_size: number;
  /** Optional task description supplied by the user. */
  task_description: string | null;
  agent: Agent;
  /** Vector representation. Length depends on provider. */
  embedding: number[] | null;
  cluster_id: string | null;
  status: CorrectionStatus;
  /** True if AI output was accepted with no edits. False if any edit. */
  accepted_first_try: boolean;
  /** Lines edited after acceptance, before commit. */
  edit_after_accept_lines: number;
  /** Seconds between AI output and final commit. */
  correction_velocity_seconds: number | null;
}

/**
 * A cluster of similar corrections. Patterns are the unit of learning that
 * gets injected into future prompts.
 */
export interface Pattern {
  id: string;
  created_at: number;
  updated_at: number;
  /** Short human-readable name. May start as a stub and improve over time. */
  name: string;
  /** Longer description, often LLM-generated. */
  description: string;
  /** IDs of corrections in this cluster. */
  member_correction_ids: string[];
  /** Cluster size. */
  size: number;
  /** Cluster density: average pairwise similarity inside the cluster. */
  density: number;
  /** Centroid embedding, recomputed when members change. */
  centroid: number[];
  status: PatternStatus;
  /** How many times this pattern has been injected as context. */
  injection_count: number;
  /** Causal evidence: avg FTA delta when this pattern was injected vs not. */
  impact_score: number;
  /** Repos where this pattern has been observed. */
  repos: string[];
  /** Languages this pattern applies to. */
  languages: string[];
  /** Author notes (optional, manually added). */
  notes: string | null;
}

/**
 * A coding session. One per agent invocation.
 */
export interface Session {
  id: string;
  started_at: number;
  ended_at: number | null;
  agent: Agent;
  repo: string;
  task_description: string | null;
  /** Patterns injected at start of session. */
  injected_pattern_ids: string[];
  /** Corrections captured during this session. */
  correction_ids: string[];
}

/**
 * A single injection event. Records what was injected so we can later
 * compute causal impact.
 */
export interface Injection {
  id: string;
  session_id: string | null;
  pattern_ids: string[];
  /** Original prompt before augmentation. */
  prompt_before: string;
  /** Augmented prompt with patterns inlined. */
  prompt_after: string;
  /** Tokens added (rough estimate). */
  tokens_added: number;
  timestamp: number;
}

/**
 * Computed metric over a time window.
 */
export interface Metric {
  name: MetricName;
  value: number;
  window_start: number;
  window_end: number;
  agent: Agent | null;
  repo: string | null;
  sample_size: number;
}

export type MetricName =
  | 'first_try_acceptance'
  | 'edit_after_accept'
  | 'revert_rate'
  | 'correction_velocity'
  | 'drift_distance'
  | 'pattern_coverage';

/**
 * Embedding provider contract. Pluggable so users can upgrade from the
 * built-in TF-IDF default to neural embeddings without changing storage.
 */
export interface EmbeddingProvider {
  /** Identifier stored alongside the vector (e.g. "tfidf-v1", "openai-3-small"). */
  readonly id: string;
  /** Vector dimensionality. May be variable for sparse providers. */
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Storage backend contract. Default is SQLite. Could be swapped for
 * LibSQL, Postgres, etc. without changing the engine.
 */
export interface Store {
  init(): Promise<void> | void;
  close(): void;

  // Corrections
  insertCorrection(correction: Correction): void;
  getCorrection(id: string): Correction | null;
  listCorrections(filter?: CorrectionFilter): Correction[];
  updateCorrectionEmbedding(id: string, embedding: number[]): void;
  updateCorrectionCluster(id: string, clusterId: string | null): void;
  deleteCorrection(id: string): void;

  // Patterns
  insertPattern(pattern: Pattern): void;
  getPattern(id: string): Pattern | null;
  listPatterns(filter?: PatternFilter): Pattern[];
  updatePattern(pattern: Pattern): void;
  deletePattern(id: string): void;

  // Sessions
  insertSession(session: Session): void;
  getSession(id: string): Session | null;
  updateSession(session: Session): void;
  listSessions(filter?: SessionFilter): Session[];

  // Injections
  insertInjection(injection: Injection): void;
  listInjections(sessionId?: string): Injection[];

  // Metrics
  insertMetric(metric: Metric): void;
  listMetrics(filter?: MetricFilter): Metric[];
}

export interface CorrectionFilter {
  repo?: string;
  agent?: Agent;
  language?: string;
  cluster_id?: string | null;
  status?: CorrectionStatus;
  since?: number;
  limit?: number;
}

export interface PatternFilter {
  status?: PatternStatus;
  language?: string;
  repo?: string;
  min_size?: number;
  limit?: number;
}

export interface SessionFilter {
  agent?: Agent;
  repo?: string;
  since?: number;
  limit?: number;
}

export interface MetricFilter {
  name?: MetricName;
  agent?: Agent | null;
  repo?: string | null;
  since?: number;
  until?: number;
}

/**
 * Pre-flight injection result. Returned by the inject engine.
 */
export interface InjectionResult {
  patterns: Pattern[];
  augmented_prompt: string;
  tokens_added: number;
  scores: { pattern_id: string; similarity: number; impact: number }[];
}
