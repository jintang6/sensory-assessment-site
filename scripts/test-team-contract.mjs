import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, inviteMigration, reservationMigration, rosterMigration, careMigration, teacherMigration, feedbackMigration, api, auth, middleware, routes, wrangler, index, app, team, teamJs, reportDocx, admin, adminJs] = await Promise.all([
  read("migrations/0003_team_collaboration.sql"),
  read("migrations/0004_invitation_codes.sql"),
  read("migrations/0005_invite_reservations.sql"),
  read("migrations/0006_team_student_roster.sql"),
  read("migrations/0007_student_care_cycle.sql"),
  read("migrations/0008_teacher_accounts.sql"),
  read("migrations/0009_feedback_and_analytics.sql"),
  read("functions/api/[[path]].js"),
  read("functions/_lib/auth.js"),
  read("functions/_middleware.js"),
  read("_routes.json"),
  read("wrangler.toml"),
  read("index.html"),
  read("app.js"),
  read("team.html"),
  read("team.js"),
  read("report-docx.js"),
  read("admin.html"),
  read("admin.js")
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
assert(assessmentTable.includes("deleted_at TEXT") && assessmentTable.includes("deleted_by_user_id TEXT"), "assessment soft-delete fields are missing");
assert(migration.includes("team_audit_logs"), "team audit table is missing");
assert(migration.includes('"issuer" TEXT NOT NULL'), "Better Auth 1.7 account issuer column is missing");
assert(rosterMigration.includes("CREATE TABLE IF NOT EXISTS team_students"), "restricted team roster table is missing");
assert(rosterMigration.includes("student_name TEXT NOT NULL"), "team roster must store the authorized student name");
assert(rosterMigration.includes("class_name TEXT NOT NULL"), "team roster must store the authorized class name");
assert(rosterMigration.includes("REFERENCES team_members (user_id)"), "team roster changes must be attributable to a member");

const goalTable = careMigration.match(/CREATE TABLE IF NOT EXISTS team_goals\s*\(([\s\S]*?)\n\);/i)?.[1] || "";
const interventionTable = careMigration.match(/CREATE TABLE IF NOT EXISTS team_intervention_logs\s*\(([\s\S]*?)\n\);/i)?.[1] || "";
assert(goalTable.includes("student_id TEXT NOT NULL REFERENCES team_students"), "goals must link to the restricted student roster by id");
assert(interventionTable.includes("student_id TEXT NOT NULL REFERENCES team_students"), "interventions must link to the restricted student roster by id");
assert(interventionTable.includes("goal_id TEXT REFERENCES team_goals"), "interventions must optionally link to a rehabilitation goal");
assert(!goalTable.includes("student_name") && !goalTable.includes("class_name"), "goal records must not duplicate roster identity");
assert(!interventionTable.includes("student_name") && !interventionTable.includes("class_name"), "intervention records must not duplicate roster identity");
assert(teacherMigration.includes("primary_module") && teacherMigration.includes("module_access"), "teacher accounts need professional module assignments");
assert(teacherMigration.includes("password_change_required"), "teacher accounts need a first-login password-change flag");
assert(feedbackMigration.includes("CREATE TABLE IF NOT EXISTS team_feedback"), "team feedback storage is missing");
assert(feedbackMigration.includes("region_name") && feedbackMigration.includes("city_name"), "coarse traffic region fields are missing");

assert(auth.includes("disableIpTracking: true"), "authentication IP tracking must stay disabled");
assert(auth.includes("minPasswordLength: 12"), "minimum team password length must stay at 12");
assert(auth.includes("autoSignIn: false"), "public sign-up must not auto-create a session");

assert(api.includes("匿名云同步已停用，请登录团队工作台使用邀请制协作"), "legacy anonymous cloud writes must stay disabled");
assert(api.includes("normalizeRecord(body.record, true)"), "team writes must be deidentified on the server");
assert(api.includes("const DOMAIN_LIMIT = 64"), "the server must accept the complete 47-domain multidisciplinary catalog");
assert(api.includes("professionalAssessors"), "professional module assessors must be preserved in restricted team records");
assert(api.includes("courseRecommendations"), "course routing recommendations must be normalized on the server");
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
assert(api.includes("reviewRequired") && api.includes("previousEvaluator"), "same-module reassessment must preserve a visible review trail");
assert(api.includes("contributors"), "each professional module must preserve all contributing evaluators");
assert(api.includes("WHERE student_code = ? AND deleted_at IS NULL"), "different therapists must merge into the same student cloud record");
assert(api.includes("identity.member.display_name"), "the server must attribute submissions to the signed-in evaluator");
assert(api.includes("handleResetTeamMemberPassword") && api.includes("hashPassword"), "administrator password reset is missing");
assert(api.includes("password_change_required = 1"), "reset passwords must force a first-login change");
assert(api.includes("handleTeamFeedback") && api.includes("handleResolveTeamFeedback"), "feedback submit and administration endpoints are missing");
assert(api.includes("async function requireSuperAdmin") && api.includes("isSuperAdminMember"), "super-administrator authorization is missing");
assert(api.match(/async function handleAdminSummary[\s\S]*?requireSuperAdmin/), "analytics summary must require the super administrator");
assert(api.match(/async function handleAdminRecord[\s\S]*?requireSuperAdmin/), "data-backend record access must require the super administrator");
assert(api.match(/async function handleAdminExport[\s\S]*?requireSuperAdmin/), "data-backend export must require the super administrator");
assert(api.includes("isSuperAdmin: await isSuperAdminMember(identity.member, env)"), "team sessions must disclose super-administrator capability");
assert(api.includes("sha256Hex(normalizeEmail(member.email))"), "super-administrator email matching must use a one-way hash");
assert(wrangler.includes('SUPER_ADMIN_EMAIL_HASHES = "bdba69a3d2e77c700cb1f837f5e8731e3eee83f46900543d8a66b46b4772cbec"'), "the designated super-administrator hash is not configured");
assert(!wrangler.match(/SUPER_ADMIN_EMAILS?\s*=/), "the designated super-administrator email must not be exposed in public source");
assert(api.includes("const TRASH_RETENTION_DAYS = 30"), "assessment trash retention must remain 30 days");
assert(api.includes("purgeExpiredAssessments") && api.includes("assessment.trash_expired"), "expired assessment trash cleanup is missing");
assert(api.includes("handleAdminTrash") && api.includes("handleRestoreRecord") && api.includes("handlePermanentlyDeleteRecord"), "assessment recycle-bin lifecycle endpoints are incomplete");
assert(api.includes('path === "/api/admin/trash"') && api.includes("trashRestore") && api.includes("trashRecord"), "assessment recycle-bin routes are missing");
assert(api.includes("WHERE a.id = ? AND a.deleted_at IS NULL"), "active record views must exclude trashed assessments");
assert(api.includes("request.cf?.region") && api.includes("request.cf?.city"), "traffic analytics must use coarse Cloudflare location data");
assert(api.includes("LEFT JOIN team_students student"), "team assessment views must resolve authorized roster identity separately");
assert(api.includes('privacyMode: "restricted_roster"'), "team privacy mode must disclose the restricted roster");
assert(api.includes("async function ensureTeamRosterSchema"), "team roster needs a safe runtime migration fallback");
assert(api.includes('path === "/api/admin/team/roster/import"'), "protected roster import endpoint is missing");
assert(api.includes("async function handleAdminTeamRosterImport"), "admin roster import handler is missing");
assert(api.includes("async function ensureTeamCareSchema"), "student care data needs a safe runtime migration fallback");
assert(api.includes('path === "/api/admin/team/care/bootstrap"'), "protected care schema bootstrap endpoint is missing");
assert(api.includes("handleTeamStudentProfile"), "student rehabilitation profile endpoint is missing");
assert(api.includes("handleUpsertTeamStudent"), "student roster lifecycle endpoint is missing");
assert(api.includes("handleCreateTeamGoal"), "rehabilitation goal endpoint is missing");
assert(api.includes("handleCreateIntervention"), "intervention log endpoint is missing");
assert(api.includes('requireRole(request, env, identity, ["admin", "evaluator"])'), "care records must enforce evaluator permissions");
assert(api.includes("scrubSensitiveText(body.note, identityValues)"), "intervention notes must be scrubbed on the server");
assert(api.includes("scrubSensitiveText(body.successCriteria, identityValues)"), "goal criteria must be scrubbed on the server");
assert(api.includes('"student.archive"'), "student archive actions must be audited");
assert(api.includes('"goal.update"'), "goal changes must be audited");
assert(api.includes('"intervention.delete"'), "intervention deletions must be audited");

assert(!index.includes('value="full"'), "the full-record sync option must not return to the assessment UI");
assert(index.includes('id="appDrawer"') && index.includes('id="feedbackDialog"'), "account navigation drawer or feedback dialog is missing");
assert(index.includes('id="drawerAdminLink"'), "super-administrator drawer data-backend entry is missing");
assert(!index.includes('id="headerAdminLink"'), "homepage toolbar must not expose a separate data-backend button");
assert(app.includes("user.isSuperAdmin === true"), "assessment-page data-backend entry must be gated by super-administrator capability");
assert(app.includes('/api/team/assessments'), "assessment sync must target the authenticated team endpoint");
assert(app.includes("module: activeModulePage"), "assessment sync must identify the current professional module");
assert(app.includes("signedInEvaluator") && app.includes("teamSession?.user?.displayName"), "the evaluator must be filled from the login session");
assert(app.includes("cloudSettings.enabled = true"), "cloud backup must default to enabled after login");
assert(app.includes("scopedStorageKey"), "local drafts must be isolated by signed-in account");
assert(app.includes('credentials: "include"'), "team requests must send the secure session cookie");
assert(index.includes('data-module-link="ot"') && index.includes('data-module-link="st"') && index.includes('data-module-link="pt"'), "four professional assessment entry links are missing");
assert(app.includes("activeModulePage") && app.includes("professionalAssessors"), "professional page routing or assessor attribution is missing");
assert(team.includes('id="registerPrivacyConfirm"'), "invite registration privacy confirmation is missing");
assert(team.includes('id="forcedPasswordPanel"'), "first-login password change UI is missing");
assert(team.includes('id="passwordResetDialog"'), "administrator password reset result UI is missing");
assert(team.includes('id="teamDrawer"') && team.includes('id="teamMenuBtn"'), "team workbench brand drawer is missing");
assert(team.includes('id="teamDrawerAdminLink" hidden'), "team data-backend entry must be hidden by default");
assert(teamJs.includes('user?.isSuperAdmin !== true') && teamJs.includes("openTeamDrawer"), "team drawer must reveal the data backend only to the super administrator");
assert(team.includes('id="openTeamTrashBtn"') && team.includes('id="teamTrashDialog"'), "team administrators need a visible assessment recycle bin");
assert(team.includes('data-team-panel="feedback"'), "administrator feedback inbox is missing");
assert(team.includes('id="registerInviteCode"'), "invitation code registration field is missing");
assert(team.includes('id="inviteCodeOutput"'), "admin invitation code output is missing");
assert(!team.includes('id="inviteEmail"'), "team admins must not enter a recipient email when inviting");
assert(admin.includes('id="bootstrapInviteCode"'), "bootstrap invitation code output is missing");
assert(admin.includes('id="openRecycleBinBtn"') && admin.includes('id="adminTrashDialog"'), "admin assessment recycle bin is missing");
assert(admin.includes('id="adminDrawer"') && admin.includes('id="adminMenuBtn"'), "data-backend brand drawer is missing");
assert(adminJs.includes("openAdminDrawer") && adminJs.includes("loadAdminIdentity"), "data-backend drawer interaction or identity display is missing");
assert(adminJs.includes("deleteRecordFromTable") && adminJs.includes("handleTrashAction"), "admin delete, restore and permanent-delete controls are missing");
assert(!admin.includes('id="bootstrapAdminEmail"'), "bootstrap must not require the first admin email");
assert(team.includes('value="viewer"'), "read-only team role is missing from the UI");
assert(team.includes('id="studentProfileDialog"'), "student rehabilitation profile is missing from the team UI");
assert(team.includes('id="goalDialog"'), "goal editor is missing from the team UI");
assert(team.includes('id="interventionDialog"'), "intervention editor is missing from the team UI");
assert(team.includes("1 · 全程协助") && team.includes("5 · 独立稳定"), "the 1-to-5 support scale must be visible while recording");
assert(teamJs.includes("renderProfileTrend"), "reassessment trend rendering is missing");
assert(teamJs.includes("studentProgressFilename"), "student stage report export is missing from the team UI");
assert(teamJs.includes("deleteRecordFromTable") && teamJs.includes("handleTeamTrashAction"), "team assessment delete and restore controls are missing");
assert(reportDocx.includes("buildStudentProgressDocument"), "student stage DOCX generator is missing");
assert(reportDocx.includes("学生功能评估与康复支持报告"), "integrated multidisciplinary DOCX title is missing");
assert(middleware.includes("password_change_required") && middleware.includes("module_access"), "assessment pages must be gated by login, password and module permissions");
assert(routes.includes('"/index.html"') && routes.includes('"/ot/*"') && routes.includes('"/movement/*"'), "Cloudflare routes must apply the assessment login middleware");

process.stdout.write("team privacy and authorization contract passed\n");
