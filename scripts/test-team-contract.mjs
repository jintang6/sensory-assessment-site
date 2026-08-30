import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, inviteMigration, reservationMigration, rosterMigration, api, auth, index, app, team, admin] = await Promise.all([
  read("migrations/0003_team_collaboration.sql"),
  read("migrations/0004_invitation_codes.sql"),
  read("migrations/0005_invite_reservations.sql"),
  read("migrations/0006_team_student_roster.sql"),
  read("functions/api/[[path]].js"),
  read("functions/_lib/auth.js"),
  read("index.html"),
  read("app.js"),
  read("team.html"),
  read("admin.html")
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

const inviteTable = inviteMigration.match(/CREATE TABLE team_invites\s*\(([\s\S]*?)\n\);/i)?.[1] || "";
assert(inviteTable.includes("code_hash TEXT NOT NULL UNIQUE"), "invites must store only an invitation code hash");
assert(inviteTable.includes("code_hint TEXT NOT NULL"), "pending invitations need a non-secret code hint");
assert(!inviteTable.match(/\n\s+(email|code|token)\s+TEXT/i), "invites must not store recipient email or raw codes");
assert(reservationMigration.includes("reservation_id TEXT"), "single-use invitation reservation is missing");
assert(migration.includes("team_assessment_versions"), "assessment version table is missing");
assert(migration.includes("team_audit_logs"), "team audit table is missing");
assert(migration.includes('"issuer" TEXT NOT NULL'), "Better Auth 1.7 account issuer column is missing");
assert(rosterMigration.includes("CREATE TABLE IF NOT EXISTS team_students"), "restricted team roster table is missing");
assert(rosterMigration.includes("student_name TEXT NOT NULL"), "team roster must store the authorized student name");
assert(rosterMigration.includes("class_name TEXT NOT NULL"), "team roster must store the authorized class name");
assert(rosterMigration.includes("REFERENCES team_members (user_id)"), "team roster changes must be attributable to a member");

assert(auth.includes("disableIpTracking: true"), "authentication IP tracking must stay disabled");
assert(auth.includes("minPasswordLength: 12"), "minimum team password length must stay at 12");
assert(auth.includes("autoSignIn: false"), "public sign-up must not auto-create a session");

assert(api.includes("匿名云同步已停用，请登录团队工作台使用邀请制协作"), "legacy anonymous cloud writes must stay disabled");
assert(api.includes("normalizeRecord(body.record, true)"), "team writes must be deidentified on the server");
assert(api.includes("normalizeTeamStudentCode(record.studentCode)"), "team student codes must use the internal code format");
assert(api.includes("该团队档案已被管理员删除，不能通过自动同步恢复"), "deleted records must not be restored by stale auto-sync");
assert(api.includes("[已去除手机号]"), "free-text phone redaction is missing");
assert(api.includes('path === "/api/team/register"'), "invitation registration endpoint is missing");
assert(api.includes('path === "/api/team/invite-code"'), "invitation code verification endpoint is missing");
assert(api.includes("INVITE_CODE_PATTERN"), "strong invitation code validation is missing");
assert(api.includes("reserveInvite(env, invite.id)"), "concurrent invitation use must be reserved atomically");
assert(!api.includes("inviteUrl"), "invitation codes must not be placed in URLs");
assert(!api.includes('path.startsWith("/api/team/invites/")'), "invitation codes must not be accepted in URL paths");
assert(!api.includes('path === "/api/auth/sign-up/email"'), "public Better Auth sign-up must not be routed");
assert(api.includes("team_assessment_versions"), "team sync must persist a version snapshot");
assert(api.includes("LEFT JOIN team_students student"), "team assessment views must resolve authorized roster identity separately");
assert(api.includes('privacyMode: "restricted_roster"'), "team privacy mode must disclose the restricted roster");
assert(api.includes("async function ensureTeamRosterSchema"), "team roster needs a safe runtime migration fallback");
assert(api.includes('path === "/api/admin/team/roster/import"'), "protected roster import endpoint is missing");
assert(api.includes("async function handleAdminTeamRosterImport"), "admin roster import handler is missing");

assert(!index.includes('value="full"'), "the full-record sync option must not return to the assessment UI");
assert(app.includes('/api/team/assessments'), "assessment sync must target the authenticated team endpoint");
assert(app.includes('credentials: "include"'), "team requests must send the secure session cookie");
assert(team.includes('id="registerPrivacyConfirm"'), "invite registration privacy confirmation is missing");
assert(team.includes('id="registerInviteCode"'), "invitation code registration field is missing");
assert(team.includes('id="inviteCodeOutput"'), "admin invitation code output is missing");
assert(!team.includes('id="inviteEmail"'), "team admins must not enter a recipient email when inviting");
assert(admin.includes('id="bootstrapInviteCode"'), "bootstrap invitation code output is missing");
assert(!admin.includes('id="bootstrapAdminEmail"'), "bootstrap must not require the first admin email");
assert(team.includes('value="viewer"'), "read-only team role is missing from the UI");

process.stdout.write("team privacy and authorization contract passed\n");
