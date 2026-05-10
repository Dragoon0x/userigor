/**
 * SQLite schema for userigor.
 *
 * Vectors are stored as Float32 BLOBs. We compute cosine similarity in
 * application code rather than relying on sqlite-vec, which keeps the
 * binary footprint small and avoids native compile issues.
 *
 * For collections under ~50k corrections this is more than fast enough.
 * Above that, swap the store for a vec-aware backend.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  repo TEXT NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  before_text TEXT NOT NULL,
  after_text TEXT NOT NULL,
  diff TEXT NOT NULL,
  diff_size INTEGER NOT NULL,
  task_description TEXT,
  agent TEXT NOT NULL,
  embedding BLOB,
  embedding_provider TEXT,
  cluster_id TEXT,
  status TEXT NOT NULL,
  accepted_first_try INTEGER NOT NULL,
  edit_after_accept_lines INTEGER NOT NULL,
  correction_velocity_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_corr_repo ON corrections(repo);
CREATE INDEX IF NOT EXISTS idx_corr_agent ON corrections(agent);
CREATE INDEX IF NOT EXISTS idx_corr_cluster ON corrections(cluster_id);
CREATE INDEX IF NOT EXISTS idx_corr_status ON corrections(status);
CREATE INDEX IF NOT EXISTS idx_corr_created ON corrections(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS corrections_fts USING fts5(
  task_description,
  diff,
  before_text,
  after_text,
  content='corrections',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS corrections_ai AFTER INSERT ON corrections BEGIN
  INSERT INTO corrections_fts(rowid, task_description, diff, before_text, after_text)
  VALUES (new.rowid, new.task_description, new.diff, new.before_text, new.after_text);
END;

CREATE TRIGGER IF NOT EXISTS corrections_ad AFTER DELETE ON corrections BEGIN
  INSERT INTO corrections_fts(corrections_fts, rowid, task_description, diff, before_text, after_text)
  VALUES('delete', old.rowid, old.task_description, old.diff, old.before_text, old.after_text);
END;

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  member_correction_ids TEXT NOT NULL,
  size INTEGER NOT NULL,
  density REAL NOT NULL,
  centroid BLOB NOT NULL,
  status TEXT NOT NULL,
  injection_count INTEGER NOT NULL DEFAULT 0,
  impact_score REAL NOT NULL DEFAULT 0,
  repos TEXT NOT NULL,
  languages TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_pat_status ON patterns(status);
CREATE INDEX IF NOT EXISTS idx_pat_size ON patterns(size);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  agent TEXT NOT NULL,
  repo TEXT NOT NULL,
  task_description TEXT,
  injected_pattern_ids TEXT NOT NULL,
  correction_ids TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sess_agent ON sessions(agent);
CREATE INDEX IF NOT EXISTS idx_sess_repo ON sessions(repo);
CREATE INDEX IF NOT EXISTS idx_sess_started ON sessions(started_at);

CREATE TABLE IF NOT EXISTS injections (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  pattern_ids TEXT NOT NULL,
  prompt_before TEXT NOT NULL,
  prompt_after TEXT NOT NULL,
  tokens_added INTEGER NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inj_session ON injections(session_id);
CREATE INDEX IF NOT EXISTS idx_inj_ts ON injections(timestamp);

CREATE TABLE IF NOT EXISTS metrics (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  agent TEXT,
  repo TEXT,
  sample_size INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_met_name ON metrics(name);
CREATE INDEX IF NOT EXISTS idx_met_window ON metrics(window_start, window_end);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '1');
`;
