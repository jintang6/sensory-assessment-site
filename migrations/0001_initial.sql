CREATE TABLE IF NOT EXISTS visitor_sessions (
  session_id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  entry_path TEXT NOT NULL DEFAULT '/',
  device_type TEXT NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  device_type TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessment_records (
  id TEXT PRIMARY KEY,
  client_record_id TEXT NOT NULL,
  student_label TEXT NOT NULL,
  student_code TEXT,
  is_deidentified INTEGER NOT NULL DEFAULT 1,
  age_text TEXT,
  gender TEXT,
  class_name TEXT,
  primary_need TEXT,
  assessment_date TEXT,
  evaluator TEXT,
  setting TEXT,
  cooperation TEXT,
  overall_score REAL,
  coverage INTEGER NOT NULL DEFAULT 0,
  assessment_json TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  source_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_records_client_record_id
ON assessment_records(client_record_id);

CREATE INDEX IF NOT EXISTS idx_assessment_records_created_at
ON assessment_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessment_records_assessment_date
ON assessment_records(assessment_date DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at
ON page_views(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_session_created
ON page_views(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_seen
ON visitor_sessions(last_seen DESC);

PRAGMA optimize;
