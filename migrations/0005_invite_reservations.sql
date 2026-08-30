ALTER TABLE team_invites ADD COLUMN reservation_id TEXT;
ALTER TABLE team_invites ADD COLUMN reserved_at TEXT;

PRAGMA optimize;
