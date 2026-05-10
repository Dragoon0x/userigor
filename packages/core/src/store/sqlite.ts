import Database from 'better-sqlite3';
import type {
  Correction,
  CorrectionFilter,
  Injection,
  Metric,
  MetricFilter,
  Pattern,
  PatternFilter,
  Session,
  SessionFilter,
  Store,
  Agent
} from '../types.js';
import { SCHEMA_SQL } from './schema.js';

/**
 * SQLite-backed store. The default backend.
 *
 * Vector storage:
 * Embeddings are serialized to Float32Array buffers. This keeps storage
 * compact (4 bytes per dimension) and read/write cheap. Cosine similarity
 * is computed in JavaScript by the cluster engine.
 */
export class SqliteStore implements Store {
  private db: Database.Database;

  constructor(public readonly path: string) {
    this.db = new Database(path);
  }

  init(): void {
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  // -------------------- corrections --------------------

  insertCorrection(c: Correction): void {
    const stmt = this.db.prepare(`
      INSERT INTO corrections (
        id, created_at, repo, file_path, language,
        before_text, after_text, diff, diff_size,
        task_description, agent, embedding, embedding_provider,
        cluster_id, status, accepted_first_try,
        edit_after_accept_lines, correction_velocity_seconds
      ) VALUES (
        @id, @created_at, @repo, @file_path, @language,
        @before_text, @after_text, @diff, @diff_size,
        @task_description, @agent, @embedding, @embedding_provider,
        @cluster_id, @status, @accepted_first_try,
        @edit_after_accept_lines, @correction_velocity_seconds
      )
    `);
    stmt.run({
      id: c.id,
      created_at: c.created_at,
      repo: c.repo,
      file_path: c.file_path,
      language: c.language,
      before_text: c.before,
      after_text: c.after,
      diff: c.diff,
      diff_size: c.diff_size,
      task_description: c.task_description,
      agent: c.agent,
      embedding: c.embedding ? floatsToBuffer(c.embedding) : null,
      embedding_provider: null,
      cluster_id: c.cluster_id,
      status: c.status,
      accepted_first_try: c.accepted_first_try ? 1 : 0,
      edit_after_accept_lines: c.edit_after_accept_lines,
      correction_velocity_seconds: c.correction_velocity_seconds
    });
  }

  getCorrection(id: string): Correction | null {
    const row = this.db.prepare('SELECT * FROM corrections WHERE id = ?').get(id) as
      | CorrectionRow
      | undefined;
    return row ? rowToCorrection(row) : null;
  }

  listCorrections(filter: CorrectionFilter = {}): Correction[] {
    const { sql, params } = buildCorrectionQuery(filter);
    const rows = this.db.prepare(sql).all(...params) as CorrectionRow[];
    return rows.map(rowToCorrection);
  }

  updateCorrectionEmbedding(id: string, embedding: number[]): void {
    this.db
      .prepare(
        `UPDATE corrections SET embedding = ?, status = 'embedded' WHERE id = ?`
      )
      .run(floatsToBuffer(embedding), id);
  }

  updateCorrectionCluster(id: string, clusterId: string | null): void {
    const status = clusterId ? 'clustered' : 'orphan';
    this.db
      .prepare(`UPDATE corrections SET cluster_id = ?, status = ? WHERE id = ?`)
      .run(clusterId, status, id);
  }

  deleteCorrection(id: string): void {
    this.db.prepare('DELETE FROM corrections WHERE id = ?').run(id);
  }

  // -------------------- patterns --------------------

  insertPattern(p: Pattern): void {
    this.db
      .prepare(
        `INSERT INTO patterns (
          id, created_at, updated_at, name, description,
          member_correction_ids, size, density, centroid, status,
          injection_count, impact_score, repos, languages, notes
        ) VALUES (
          @id, @created_at, @updated_at, @name, @description,
          @member_correction_ids, @size, @density, @centroid, @status,
          @injection_count, @impact_score, @repos, @languages, @notes
        )`
      )
      .run({
        id: p.id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        name: p.name,
        description: p.description,
        member_correction_ids: JSON.stringify(p.member_correction_ids),
        size: p.size,
        density: p.density,
        centroid: floatsToBuffer(p.centroid),
        status: p.status,
        injection_count: p.injection_count,
        impact_score: p.impact_score,
        repos: JSON.stringify(p.repos),
        languages: JSON.stringify(p.languages),
        notes: p.notes
      });
  }

  getPattern(id: string): Pattern | null {
    const row = this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id) as
      | PatternRow
      | undefined;
    return row ? rowToPattern(row) : null;
  }

  listPatterns(filter: PatternFilter = {}): Pattern[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.min_size != null) {
      conditions.push('size >= ?');
      params.push(filter.min_size);
    }
    let sql = 'SELECT * FROM patterns';
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY impact_score DESC, size DESC';
    if (filter.limit) sql += ' LIMIT ' + filter.limit;
    const rows = this.db.prepare(sql).all(...params) as PatternRow[];
    let results = rows.map(rowToPattern);
    if (filter.repo) results = results.filter((p) => p.repos.includes(filter.repo!));
    if (filter.language)
      results = results.filter((p) => p.languages.includes(filter.language!));
    return results;
  }

  updatePattern(p: Pattern): void {
    this.db
      .prepare(
        `UPDATE patterns SET
          updated_at = @updated_at, name = @name, description = @description,
          member_correction_ids = @member_correction_ids, size = @size,
          density = @density, centroid = @centroid, status = @status,
          injection_count = @injection_count, impact_score = @impact_score,
          repos = @repos, languages = @languages, notes = @notes
        WHERE id = @id`
      )
      .run({
        id: p.id,
        updated_at: p.updated_at,
        name: p.name,
        description: p.description,
        member_correction_ids: JSON.stringify(p.member_correction_ids),
        size: p.size,
        density: p.density,
        centroid: floatsToBuffer(p.centroid),
        status: p.status,
        injection_count: p.injection_count,
        impact_score: p.impact_score,
        repos: JSON.stringify(p.repos),
        languages: JSON.stringify(p.languages),
        notes: p.notes
      });
  }

  deletePattern(id: string): void {
    this.db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
  }

  // -------------------- sessions --------------------

  insertSession(s: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, started_at, ended_at, agent, repo, task_description, injected_pattern_ids, correction_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        s.id,
        s.started_at,
        s.ended_at,
        s.agent,
        s.repo,
        s.task_description,
        JSON.stringify(s.injected_pattern_ids),
        JSON.stringify(s.correction_ids)
      );
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;
    return row ? rowToSession(row) : null;
  }

  updateSession(s: Session): void {
    this.db
      .prepare(
        `UPDATE sessions SET
          ended_at = ?, task_description = ?,
          injected_pattern_ids = ?, correction_ids = ?
         WHERE id = ?`
      )
      .run(
        s.ended_at,
        s.task_description,
        JSON.stringify(s.injected_pattern_ids),
        JSON.stringify(s.correction_ids),
        s.id
      );
  }

  listSessions(filter: SessionFilter = {}): Session[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.agent) {
      conditions.push('agent = ?');
      params.push(filter.agent);
    }
    if (filter.repo) {
      conditions.push('repo = ?');
      params.push(filter.repo);
    }
    if (filter.since != null) {
      conditions.push('started_at >= ?');
      params.push(filter.since);
    }
    let sql = 'SELECT * FROM sessions';
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY started_at DESC';
    if (filter.limit) sql += ' LIMIT ' + filter.limit;
    const rows = this.db.prepare(sql).all(...params) as SessionRow[];
    return rows.map(rowToSession);
  }

  // -------------------- injections --------------------

  insertInjection(i: Injection): void {
    this.db
      .prepare(
        `INSERT INTO injections (id, session_id, pattern_ids, prompt_before, prompt_after, tokens_added, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        i.id,
        i.session_id,
        JSON.stringify(i.pattern_ids),
        i.prompt_before,
        i.prompt_after,
        i.tokens_added,
        i.timestamp
      );
  }

  listInjections(sessionId?: string): Injection[] {
    const sql = sessionId
      ? 'SELECT * FROM injections WHERE session_id = ? ORDER BY timestamp DESC'
      : 'SELECT * FROM injections ORDER BY timestamp DESC';
    const rows = (sessionId
      ? this.db.prepare(sql).all(sessionId)
      : this.db.prepare(sql).all()) as InjectionRow[];
    return rows.map(rowToInjection);
  }

  // -------------------- metrics --------------------

  insertMetric(m: Metric): void {
    this.db
      .prepare(
        `INSERT INTO metrics (name, value, window_start, window_end, agent, repo, sample_size)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(m.name, m.value, m.window_start, m.window_end, m.agent, m.repo, m.sample_size);
  }

  listMetrics(filter: MetricFilter = {}): Metric[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.name) {
      conditions.push('name = ?');
      params.push(filter.name);
    }
    if (filter.agent !== undefined) {
      if (filter.agent === null) conditions.push('agent IS NULL');
      else {
        conditions.push('agent = ?');
        params.push(filter.agent);
      }
    }
    if (filter.repo !== undefined) {
      if (filter.repo === null) conditions.push('repo IS NULL');
      else {
        conditions.push('repo = ?');
        params.push(filter.repo);
      }
    }
    if (filter.since != null) {
      conditions.push('window_end >= ?');
      params.push(filter.since);
    }
    if (filter.until != null) {
      conditions.push('window_start <= ?');
      params.push(filter.until);
    }
    let sql = 'SELECT * FROM metrics';
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY window_end DESC';
    const rows = this.db.prepare(sql).all(...params) as MetricRow[];
    return rows.map(rowToMetric);
  }
}

// -------------------- helpers --------------------

function floatsToBuffer(arr: number[]): Buffer {
  const f32 = new Float32Array(arr);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

function bufferToFloats(buf: Buffer | null): number[] | null {
  if (!buf) return null;
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(f32);
}

interface CorrectionRow {
  id: string;
  created_at: number;
  repo: string;
  file_path: string;
  language: string;
  before_text: string;
  after_text: string;
  diff: string;
  diff_size: number;
  task_description: string | null;
  agent: string;
  embedding: Buffer | null;
  embedding_provider: string | null;
  cluster_id: string | null;
  status: string;
  accepted_first_try: number;
  edit_after_accept_lines: number;
  correction_velocity_seconds: number | null;
}

interface PatternRow {
  id: string;
  created_at: number;
  updated_at: number;
  name: string;
  description: string;
  member_correction_ids: string;
  size: number;
  density: number;
  centroid: Buffer;
  status: string;
  injection_count: number;
  impact_score: number;
  repos: string;
  languages: string;
  notes: string | null;
}

interface SessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  agent: string;
  repo: string;
  task_description: string | null;
  injected_pattern_ids: string;
  correction_ids: string;
}

interface InjectionRow {
  id: string;
  session_id: string | null;
  pattern_ids: string;
  prompt_before: string;
  prompt_after: string;
  tokens_added: number;
  timestamp: number;
}

interface MetricRow {
  rowid: number;
  name: string;
  value: number;
  window_start: number;
  window_end: number;
  agent: string | null;
  repo: string | null;
  sample_size: number;
}

function rowToCorrection(r: CorrectionRow): Correction {
  return {
    id: r.id,
    created_at: r.created_at,
    repo: r.repo,
    file_path: r.file_path,
    language: r.language,
    before: r.before_text,
    after: r.after_text,
    diff: r.diff,
    diff_size: r.diff_size,
    task_description: r.task_description,
    agent: r.agent as Agent,
    embedding: bufferToFloats(r.embedding),
    cluster_id: r.cluster_id,
    status: r.status as Correction['status'],
    accepted_first_try: r.accepted_first_try === 1,
    edit_after_accept_lines: r.edit_after_accept_lines,
    correction_velocity_seconds: r.correction_velocity_seconds
  };
}

function rowToPattern(r: PatternRow): Pattern {
  return {
    id: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    name: r.name,
    description: r.description,
    member_correction_ids: JSON.parse(r.member_correction_ids),
    size: r.size,
    density: r.density,
    centroid: bufferToFloats(r.centroid) ?? [],
    status: r.status as Pattern['status'],
    injection_count: r.injection_count,
    impact_score: r.impact_score,
    repos: JSON.parse(r.repos),
    languages: JSON.parse(r.languages),
    notes: r.notes
  };
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    agent: r.agent as Agent,
    repo: r.repo,
    task_description: r.task_description,
    injected_pattern_ids: JSON.parse(r.injected_pattern_ids),
    correction_ids: JSON.parse(r.correction_ids)
  };
}

function rowToInjection(r: InjectionRow): Injection {
  return {
    id: r.id,
    session_id: r.session_id,
    pattern_ids: JSON.parse(r.pattern_ids),
    prompt_before: r.prompt_before,
    prompt_after: r.prompt_after,
    tokens_added: r.tokens_added,
    timestamp: r.timestamp
  };
}

function rowToMetric(r: MetricRow): Metric {
  return {
    name: r.name as Metric['name'],
    value: r.value,
    window_start: r.window_start,
    window_end: r.window_end,
    agent: r.agent as Agent | null,
    repo: r.repo,
    sample_size: r.sample_size
  };
}

function buildCorrectionQuery(f: CorrectionFilter): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (f.repo) {
    conditions.push('repo = ?');
    params.push(f.repo);
  }
  if (f.agent) {
    conditions.push('agent = ?');
    params.push(f.agent);
  }
  if (f.language) {
    conditions.push('language = ?');
    params.push(f.language);
  }
  if (f.cluster_id !== undefined) {
    if (f.cluster_id === null) conditions.push('cluster_id IS NULL');
    else {
      conditions.push('cluster_id = ?');
      params.push(f.cluster_id);
    }
  }
  if (f.status) {
    conditions.push('status = ?');
    params.push(f.status);
  }
  if (f.since != null) {
    conditions.push('created_at >= ?');
    params.push(f.since);
  }
  let sql = 'SELECT * FROM corrections';
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  if (f.limit) sql += ' LIMIT ' + f.limit;
  return { sql, params };
}
