import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, api, auth, index, app, team] = await Promise.all([
  read("migrations/0003_team_collaboration.sql"),
  read("functions/api/[[path]].js"),
  read("functions/_lib/auth.js"),
  read("index.html"),
  read("app.js"),
  read("team.html")
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const assessmentTable = migration.match(/CREATE TABLE IF NOT EXISTS team_assessments\s*\(([\s\S]*?)\n\);/i)?.[1] || "";
assert(assessmentTable, "team_assessments schema is missing");
[
  "student_name",
  "class_name",
  "organization",
  "evaluator",
  "reviewer",
  "background",
  "medical"
].forEach((field) => assert(!assessmentTable.toLowerCase().includes(field), `team_assessments must not contain ${field}`));

assert(migration.includes("token_hash TEXT NOT NULL UNIQUE"), "invites must store only a token hash");
assert(!migration.match(/\n\s+token TEXT[^_]/i), "raw invite tokens must not be stored");
assert(migration.includes("team_assessment_versions"), "assessment version table is missing");
assert(migration.includes("team_audit_logs"), "team audit table is missing");
assert(migration.includes('"issuer" TEXT NOT NULL'), "Better Auth 1.7 account issuer column is missing");

assert(auth.includes("disableIpTracking: true"), "authentication IP tracking must stay disabled");
assert(auth.includes("minPasswordLength: 12"), "minimum team password length must stay at 12");
assert(auth.includes("autoSignIn: false"), "public sign-up must not auto-create a session");

assert(api.includes("匿名云同步已停用，请登录团队工作台使用邀请制协作"), "legacy anonymous cloud writes must stay disabled");
assert(api.includes("normalizeRecord(body.record, true)"), "team writes must be deidentified on the server");
assert(api.includes("normalizeTeamStudentCode(record.studentCode)"), "team student codes must use the internal code format");
assert(api.includes("该团队档案已被管理员删除，不能通过自动同步恢复"), "deleted records must not be restored by stale auto-sync");
assert(api.includes("[已去除手机号]"), "free-text phone redaction is missing");
assert(api.includes('path === "/api/team/register"'), "invitation registration endpoint is missing");
assert(!api.includes('path === "/api/auth/sign-up/email"'), "public Better Auth sign-up must not be routed");
assert(api.includes("team_assessment_versions"), "team sync must persist a version snapshot");

assert(!index.includes('value="full"'), "the full-record sync option must not return to the assessment UI");
assert(app.includes('/api/team/assessments'), "assessment sync must target the authenticated team endpoint");
assert(app.includes('credentials: "include"'), "team requests must send the secure session cookie");
assert(team.includes('id="registerPrivacyConfirm"'), "invite registration privacy confirmation is missing");
assert(team.includes('value="viewer"'), "read-only team role is missing from the UI");

process.stdout.write("team privacy and authorization contract passed\n");
