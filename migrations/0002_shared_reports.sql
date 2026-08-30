CREATE TABLE IF NOT EXISTS shared_reports (
  token TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_base64 TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_reports_expires
ON shared_reports(expires_at);

CREATE INDEX IF NOT EXISTS idx_shared_reports_session_created
ON shared_reports(source_session_id, created_at DESC);

PRAGMA optimize;
