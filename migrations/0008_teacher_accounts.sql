ALTER TABLE team_members ADD COLUMN primary_module TEXT NOT NULL DEFAULT 'all'
  CHECK (primary_module IN ('all', 'si', 'ot', 'st', 'pt'));

ALTER TABLE team_members ADD COLUMN module_access TEXT NOT NULL DEFAULT 'si,ot,st,pt';

ALTER TABLE team_members ADD COLUMN assignment_note TEXT NOT NULL DEFAULT '';

ALTER TABLE team_members ADD COLUMN password_change_required INTEGER NOT NULL DEFAULT 0
  CHECK (password_change_required IN (0, 1));

ALTER TABLE team_members ADD COLUMN password_changed_at TEXT;

ALTER TABLE team_members ADD COLUMN password_reset_at TEXT;

CREATE INDEX IF NOT EXISTS idx_team_members_module
  ON team_members(status, primary_module, role);

PRAGMA optimize;
