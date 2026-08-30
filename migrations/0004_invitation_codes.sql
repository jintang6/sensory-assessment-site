DROP INDEX IF EXISTS idx_team_invites_email;
DROP INDEX IF EXISTS idx_team_invites_expiry;

ALTER TABLE team_invites RENAME TO team_invites_email_legacy;

CREATE TABLE team_invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'evaluator', 'viewer')),
  created_by_user_id TEXT,
  expires_at TEXT NOT NULL,
  used_by_user_id TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

INSERT INTO team_invites (
  id,
  code_hash,
  code_hint,
  role,
  created_by_user_id,
  expires_at,
  used_by_user_id,
  used_at,
  created_at,
  revoked_at
)
SELECT
  id,
  token_hash,
  substr(token_hash, -4),
  role,
  created_by_user_id,
  expires_at,
  used_by_user_id,
  used_at,
  created_at,
  COALESCE(revoked_at, datetime('now'))
FROM team_invites_email_legacy;

DROP TABLE team_invites_email_legacy;

CREATE INDEX IF NOT EXISTS idx_team_invites_expiry ON team_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_team_invites_creator ON team_invites(created_by_user_id, created_at DESC);

PRAGMA optimize;
