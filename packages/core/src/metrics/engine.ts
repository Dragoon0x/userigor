import type {
  Agent,
  Correction,
  Metric,
  MetricName,
  Store
} from '../types.js';

export interface MetricsOptions {
  /** Window start (ms epoch). Defaults to 30 days ago. */
  since?: number;
  /** Window end. Defaults to now. */
  until?: number;
  /** Agent filter. */
  agent?: Agent;
  /** Repo filter. */
  repo?: string;
}

export interface MetricsSnapshot {
  window_start: number;
  window_end: number;
  agent: Agent | null;
  repo: string | null;
  sample_size: number;
  first_try_acceptance: number;
  edit_after_accept: number;
  revert_rate: number;
  correction_velocity: number;
  drift_distance: number;
  pattern_coverage: number;
}

/**
 * Compute the full set of metrics for a window. These are the metrics that
 * make userigor honest about whether it's working:
 *
 * first_try_acceptance:
 *   Fraction of AI outputs accepted with zero edits. Higher is better.
 *   This is the headline metric. Pro-workflow can't measure this — it has
 *   no notion of an AI suggestion vs a final commit.
 *
 * edit_after_accept:
 *   Average lines edited after the user clicked accept. Lower is better.
 *   Captures "I accepted but then had to fix it."
 *
 * revert_rate:
 *   Fraction of AI-attributed commits reverted within 7 days. Lower is
 *   better. Catches the "looked good, broke later" failure mode.
 *
 * correction_velocity:
 *   Median seconds from AI emission to final commit. Lower is better
 *   (less time spent correcting).
 *
 * drift_distance:
 *   Mean diff size of corrections in the window. Lower means the AI's
 *   output is closer to what shipped.
 *
 * pattern_coverage:
 *   Fraction of corrections that fall into a known pattern cluster.
 *   Higher means the system is recognizing recurring problems.
 */
export function computeMetrics(store: Store, options: MetricsOptions = {}): MetricsSnapshot {
  const until = options.until ?? Date.now();
  const since = options.since ?? until - 30 * 24 * 60 * 60 * 1000;
  const corrections = store.listCorrections({
    repo: options.repo,
    agent: options.agent,
    since
  }).filter((c) => c.created_at <= until);

  const sample = corrections.length;
  const fta = sample === 0 ? 0 : corrections.filter((c) => c.accepted_first_try).length / sample;
  const eaa = sample === 0
    ? 0
    : corrections.reduce((acc, c) => acc + c.edit_after_accept_lines, 0) / sample;
  const velocities = corrections
    .map((c) => c.correction_velocity_seconds)
    .filter((v): v is number => v != null);
  const cv = velocities.length === 0 ? 0 : median(velocities);
  const drift = sample === 0
    ? 0
    : corrections.reduce((acc, c) => acc + c.diff_size, 0) / sample;
  const inCluster = corrections.filter((c) => c.cluster_id != null).length;
  const coverage = sample === 0 ? 0 : inCluster / sample;
  const revertRate = computeRevertRate(corrections);

  return {
    window_start: since,
    window_end: until,
    agent: options.agent ?? null,
    repo: options.repo ?? null,
    sample_size: sample,
    first_try_acceptance: round(fta, 4),
    edit_after_accept: round(eaa, 2),
    revert_rate: round(revertRate, 4),
    correction_velocity: Math.round(cv),
    drift_distance: round(drift, 2),
    pattern_coverage: round(coverage, 4)
  };
}

/**
 * Persist a metrics snapshot to the store as individual Metric rows.
 * Useful for time-series dashboards.
 */
export function persistSnapshot(store: Store, snap: MetricsSnapshot): void {
  const names: MetricName[] = [
    'first_try_acceptance',
    'edit_after_accept',
    'revert_rate',
    'correction_velocity',
    'drift_distance',
    'pattern_coverage'
  ];
  for (const name of names) {
    const metric: Metric = {
      name,
      value: snap[name],
      window_start: snap.window_start,
      window_end: snap.window_end,
      agent: snap.agent,
      repo: snap.repo,
      sample_size: snap.sample_size
    };
    store.insertMetric(metric);
  }
}

/**
 * Time-series for a metric. Returns one snapshot per bucket.
 */
export function timeSeries(
  store: Store,
  name: MetricName,
  opts: { since: number; until?: number; bucketMs?: number; agent?: Agent; repo?: string } = {
    since: 0
  }
): { window_end: number; value: number; sample_size: number }[] {
  const bucket = opts.bucketMs ?? 24 * 60 * 60 * 1000;
  const until = opts.until ?? Date.now();
  const out: { window_end: number; value: number; sample_size: number }[] = [];
  for (let t = opts.since + bucket; t <= until; t += bucket) {
    const snap = computeMetrics(store, {
      since: t - bucket,
      until: t,
      agent: opts.agent,
      repo: opts.repo
    });
    out.push({ window_end: t, value: snap[name], sample_size: snap.sample_size });
  }
  return out;
}

/**
 * Compute impact: did corrections that received pattern injection have
 * higher first-try acceptance than those that didn't?
 *
 * This is the causal evidence layer. Patterns with low or negative impact
 * get retired automatically by `prunePatterns`.
 */
export function computePatternImpact(
  store: Store,
  patternId: string
): { with_injection_fta: number; without_injection_fta: number; delta: number; sample_with: number; sample_without: number } {
  const injections = store.listInjections().filter((i) => i.pattern_ids.includes(patternId));
  const sessionIds = new Set(injections.map((i) => i.session_id).filter((id): id is string => id != null));
  const allSessions = store.listSessions({ limit: 10000 });
  const correctionsWithInjection: Correction[] = [];
  const correctionsWithoutInjection: Correction[] = [];
  for (const session of allSessions) {
    const wasInjected = sessionIds.has(session.id);
    for (const cid of session.correction_ids) {
      const c = store.getCorrection(cid);
      if (!c) continue;
      if (wasInjected) correctionsWithInjection.push(c);
      else correctionsWithoutInjection.push(c);
    }
  }
  const ftaWith = correctionsWithInjection.length === 0
    ? 0
    : correctionsWithInjection.filter((c) => c.accepted_first_try).length /
      correctionsWithInjection.length;
  const ftaWithout = correctionsWithoutInjection.length === 0
    ? 0
    : correctionsWithoutInjection.filter((c) => c.accepted_first_try).length /
      correctionsWithoutInjection.length;
  return {
    with_injection_fta: round(ftaWith, 4),
    without_injection_fta: round(ftaWithout, 4),
    delta: round(ftaWith - ftaWithout, 4),
    sample_with: correctionsWithInjection.length,
    sample_without: correctionsWithoutInjection.length
  };
}

/**
 * Prune patterns that aren't pulling their weight.
 *
 * Rules:
 *   - Patterns with status='candidate' and age > 14 days and size < 3 → retire
 *   - Patterns with injection_count > 20 and impact_score < threshold → retire
 *   - Patterns with status='retired' and age > 90 days → delete
 */
export function prunePatterns(
  store: Store,
  opts: { impactThreshold?: number; now?: number } = {}
): { retired: number; deleted: number; updated: number } {
  const impactThreshold = opts.impactThreshold ?? 0.02;
  const now = opts.now ?? Date.now();
  const day = 24 * 60 * 60 * 1000;
  let retired = 0;
  let deleted = 0;
  let updated = 0;

  const patterns = store.listPatterns({});
  for (const p of patterns) {
    const ageDays = (now - p.created_at) / day;
    // Recompute impact for patterns with enough injections.
    if (p.injection_count >= 5) {
      const impact = computePatternImpact(store, p.id);
      if (impact.delta !== p.impact_score) {
        p.impact_score = impact.delta;
        updated++;
      }
    }
    if (
      p.status === 'candidate' &&
      ageDays > 14 &&
      p.size < 3
    ) {
      p.status = 'retired';
      store.updatePattern(p);
      retired++;
      continue;
    }
    if (
      p.injection_count >= 20 &&
      p.impact_score < impactThreshold
    ) {
      p.status = 'retired';
      store.updatePattern(p);
      retired++;
      continue;
    }
    if (p.status === 'retired' && ageDays > 90) {
      store.deletePattern(p.id);
      deleted++;
      continue;
    }
    if (updated > 0) store.updatePattern(p);
  }
  return { retired, deleted, updated };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function computeRevertRate(corrections: Correction[]): number {
  // Heuristic: a correction is "reverted" if a later correction at the
  // same file_path inverts most of its diff_size within 7 days.
  if (corrections.length === 0) return 0;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  let reverts = 0;
  for (let i = 0; i < corrections.length; i++) {
    const c = corrections[i];
    for (let j = i + 1; j < corrections.length; j++) {
      const later = corrections[j];
      if (later.created_at - c.created_at > sevenDays) break;
      if (later.file_path === c.file_path && later.diff_size >= c.diff_size * 0.6) {
        // Cheap heuristic: if the later diff swaps the texts back we count it.
        if (later.before === c.after && later.after === c.before) {
          reverts++;
          break;
        }
      }
    }
  }
  return reverts / corrections.length;
}
