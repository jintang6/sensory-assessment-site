-- Better Auth core tables generated for Better Auth 1.7.2 with the D1 dialect.
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "issuer" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_uidx" ON "account" ("issuer", "accountId");

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'evaluator', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT
);

CREATE TABLE IF NOT EXISTS team_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'evaluator', 'viewer')),
  created_by_user_id TEXT,
  expires_at TEXT NOT NULL,
  used_by_user_id TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS team_assessments (
  id TEXT PRIMARY KEY,
  client_record_id TEXT NOT NULL UNIQUE,
  student_code TEXT NOT NULL,
  age_text TEXT,
  gender TEXT,
  primary_need TEXT,
  assessment_date TEXT,
  overall_score REAL,
  coverage INTEGER NOT NULL DEFAULT 0,
  assessment_json TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  updated_by_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  deleted_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS team_assessment_versions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES team_assessments (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  assessment_json TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  changed_by_user_id TEXT NOT NULL REFERENCES team_members (user_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (assessment_id, version)
);

CREATE TABLE IF NOT EXISTS team_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status, role);
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_invites_expiry ON team_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_team_assessments_updated ON team_assessments(deleted_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_assessments_student_code ON team_assessments(student_code);
CREATE INDEX IF NOT EXISTS idx_team_versions_assessment ON team_assessment_versions(assessment_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_team_audit_created ON team_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_login_hash_time ON team_login_attempts(email_hash, attempted_at DESC);

PRAGMA optimize;
