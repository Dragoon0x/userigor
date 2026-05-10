import { randomUUID } from 'node:crypto';
import type { Agent, Correction } from '../types.js';
import { detectLanguage, diffLines } from './diff.js';

export interface CaptureInput {
  /** AI's original output (before any user edits). */
  before: string;
  /** Final committed text. */
  after: string;
  repo: string;
  file_path: string;
  agent: Agent;
  task_description?: string | null;
  /** Optional: when AI emitted the suggestion. Used to compute velocity. */
  ai_emitted_at?: number;
  /** Optional: when the user committed. Defaults to now. */
  committed_at?: number;
  /** Optional: lines edited after the user clicked accept but before commit. */
  edit_after_accept_lines?: number;
}

/**
 * Build a Correction from a before/after pair. Returns null if the texts
 * are identical (no correction to capture).
 */
export function buildCorrection(input: CaptureInput): Correction | null {
  if (input.before === input.after) return null;
  const stats = diffLines(input.before, input.after);
  if (stats.size === 0) return null;
  const now = input.committed_at ?? Date.now();
  const velocity =
    input.ai_emitted_at != null
      ? Math.max(0, Math.round((now - input.ai_emitted_at) / 1000))
      : null;
  const editAfterAccept = input.edit_after_accept_lines ?? 0;
  const acceptedFirstTry = stats.size === 0 || (editAfterAccept === 0 && stats.size === 0);
  return {
    id: randomUUID(),
    created_at: now,
    repo: input.repo,
    file_path: input.file_path,
    language: detectLanguage(input.file_path),
    before: input.before,
    after: input.after,
    diff: stats.unified,
    diff_size: stats.size,
    task_description: input.task_description ?? null,
    agent: input.agent,
    embedding: null,
    cluster_id: null,
    status: 'captured',
    accepted_first_try: acceptedFirstTry,
    edit_after_accept_lines: editAfterAccept,
    correction_velocity_seconds: velocity
  };
}

/**
 * Build a textual "summary" of a correction for embedding. The choice of
 * what to include is a quality lever:
 *
 * - task_description gives task-level context
 * - diff captures the actual change (positive signal for clustering)
 * - file path hints (filename, language) help cluster by domain
 *
 * We do NOT embed the full before/after texts — those are stored for
 * display, not similarity. Embedding a 2000-line file as one vector
 * dilutes the signal.
 */
export function correctionEmbedText(c: Correction): string {
  const parts = [
    c.task_description ? `task: ${c.task_description}` : '',
    `lang: ${c.language}`,
    `file: ${c.file_path.split('/').pop() ?? c.file_path}`,
    `diff:\n${truncate(c.diff, 2000)}`
  ].filter(Boolean);
  return parts.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n[…truncated]';
}
