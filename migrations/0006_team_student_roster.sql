CREATE TABLE IF NOT EXISTS team_students (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  grade_name TEXT NOT NULL DEFAULT '',
  school_year TEXT NOT NULL DEFAULT '',
  roster_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  updated_by_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_name, class_name, school_year)
);

CREATE INDEX IF NOT EXISTS idx_team_students_class_order
  ON team_students(status, school_year, class_name, roster_order, student_name);

CREATE INDEX IF NOT EXISTS idx_team_students_name
  ON team_students(student_name);

PRAGMA optimize;
