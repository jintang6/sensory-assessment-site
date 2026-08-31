ALTER TABLE visitor_sessions ADD COLUMN country_code TEXT NOT NULL DEFAULT '';
ALTER TABLE visitor_sessions ADD COLUMN region_name TEXT NOT NULL DEFAULT '';
ALTER TABLE visitor_sessions ADD COLUMN city_name TEXT NOT NULL DEFAULT '';

ALTER TABLE page_views ADD COLUMN country_code TEXT NOT NULL DEFAULT '';
ALTER TABLE page_views ADD COLUMN region_name TEXT NOT NULL DEFAULT '';
ALTER TABLE page_views ADD COLUMN city_name TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS team_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES team_members (user_id),
  category TEXT NOT NULL CHECK (category IN ('suggestion', 'content', 'bug', 'workflow', 'other')),
  content TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by_user_id TEXT REFERENCES team_members (user_id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_feedback_status_created
  ON team_feedback(status, created_at DESC);

PRAGMA optimize;
