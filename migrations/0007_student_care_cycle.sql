CREATE TABLE IF NOT EXISTS team_goals (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES team_students (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  baseline_level INTEGER NOT NULL CHECK (baseline_level BETWEEN 1 AND 5),
  target_level INTEGER NOT NULL CHECK (target_level BETWEEN 1 AND 5),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'routine')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'paused', 'archived')),
  start_date TEXT NOT NULL,
  review_date TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  updated_by_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_intervention_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES team_students (id) ON DELETE CASCADE,
  goal_id TEXT REFERENCES team_goals (id) ON DELETE SET NULL,
  session_date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 480),
  setting TEXT NOT NULL CHECK (setting IN ('classroom', 'therapy', 'daily_living', 'home', 'community')),
  observer_type TEXT NOT NULL CHECK (observer_type IN ('therapist', 'teacher', 'family', 'multidisciplinary')),
  support_level INTEGER NOT NULL CHECK (support_level BETWEEN 1 AND 5),
  response_level TEXT NOT NULL CHECK (response_level IN ('limited', 'emerging', 'stable', 'generalized')),
  note TEXT NOT NULL,
  next_step TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_goals_student_status
  ON team_goals(student_id, status, review_date, priority);

CREATE INDEX IF NOT EXISTS idx_team_interventions_student_date
  ON team_intervention_logs(student_id, session_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_interventions_goal
  ON team_intervention_logs(goal_id, session_date DESC);

PRAGMA optimize;
