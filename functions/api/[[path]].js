import { getAuth } from "../_lib/auth.js";

const MAX_BODY_BYTES = 180_000;
const MAX_REPORT_BODY_BYTES = 850_000;
const MAX_REPORT_BYTES = 600_000;
const DOMAIN_LIMIT = 16;
const ITEM_LIMIT = 10;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const REPORT_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const REPORT_SHARE_TTL_MS = 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TEAM_ROLES = new Set(["admin", "evaluator", "viewer"]);
const TEAM_MEMBER_STATUSES = new Set(["active", "disabled"]);

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return "";
  const requestOrigin = new URL(request.url).origin;
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin === requestOrigin || configured.includes(origin)) return origin;
  return "";
}

function responseHeaders(request, env, extra = {}) {
  const origin = allowedOrigin(request, env) || new URL(request.url).origin;
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    ...extra
  };
}

function withSecurityHeaders(request, env, response) {
  const headers = new Headers(response.headers);
  const standard = responseHeaders(request, env);
  ["Cache-Control", "X-Content-Type-Options", "Referrer-Policy", "Access-Control-Allow-Origin", "Access-Control-Allow-Credentials", "Vary"]
    .forEach((name) => headers.set(name, standard[name]));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function originIsAllowed(request, env) {
  return !request.headers.get("Origin") || Boolean(allowedOrigin(request, env));
}

function json(request, env, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(request, env, extra)
  });
}

function cleanString(value, max = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function cleanArray(value, maxItems = 12, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => cleanString(item, maxLength)).filter(Boolean);
}

function cleanDate(value) {
  const text = cleanString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function cleanScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
}

function cleanImpact(value) {
  const impact = Number(value);
  return Number.isInteger(impact) && impact >= 0 && impact <= 3 ? impact : 0;
}

function scrubSensitiveText(value, identityValues = []) {
  let text = cleanString(value, 1200);
  const sourceValues = Array.isArray(identityValues) ? identityValues : [identityValues];
  const studentIdentity = cleanString(sourceValues[0], 120);
  const values = sourceValues
    .slice(1)
    .map((item) => cleanString(item, 120))
    .filter((item) => item.length >= 2)
    .sort((a, b) => b.length - a.length);
  values.forEach((identity) => { text = text.split(identity).join("[已去除身份信息]"); });
  if (studentIdentity.length >= 2) text = text.split(studentIdentity).join("该学生");
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[已去除邮箱]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[已去除手机号]")
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[已去除证件号]");
}

function normalizeTeamStudentCode(value) {
  const code = cleanString(value, 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) return "";
  if (!/[A-Z]/.test(code) || !/\d/.test(code)) return "";
  return code;
}

async function parseBody(request, maxBytes = MAX_BODY_BYTES) {
  const announcedLength = Number(request.headers.get("Content-Length") || 0);
  if (announcedLength > maxBytes) throw new Error("payload_too_large");
  const raw = await request.text();
  if (raw.length > maxBytes) throw new Error("payload_too_large");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error("invalid_json");
  }
}

function validSessionId(value) {
  const id = cleanString(value, 80);
  return /^[A-Za-z0-9-]{8,80}$/.test(id) ? id : "";
}

function cleanReportFilename(value) {
  let filename = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 120);
  if (!filename) filename = "感觉统合功能评估报告.docx";
  if (!filename.toLowerCase().endsWith(".docx")) filename += ".docx";
  return filename;
}

function validReportBase64(value) {
  const encoded = typeof value === "string" ? value : "";
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const byteLength = (encoded.length * 3) / 4 - padding;
  if (byteLength < 100 || byteLength > MAX_REPORT_BYTES || !encoded.startsWith("UEsDB")) return null;
  return { encoded, byteLength };
}

function createReportToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function reportPathMatch(path) {
  return path.match(/^\/api\/reports\/shared\/([a-f0-9]{48})(\/download)?$/);
}

async function removeExpiredReports(env) {
  await env.DB.prepare("DELETE FROM shared_reports WHERE datetime(expires_at) <= datetime('now')").run();
}

async function handleCreateReportShare(request, env) {
  const body = await parseBody(request, MAX_REPORT_BODY_BYTES);
  if (body.consent !== true) return json(request, env, { error: "请先确认已获得报告分享授权" }, 400);

  const sessionId = validSessionId(body.sessionId);
  if (!sessionId) return json(request, env, { error: "无效的匿名会话" }, 400);
  if (cleanString(body.mimeType, 120) !== DOCX_MIME) {
    return json(request, env, { error: "仅支持本工具生成的 Word 评估报告" }, 415);
  }

  const report = validReportBase64(body.fileBase64);
  if (!report) return json(request, env, { error: "报告文件无效或超过600KB" }, 400);

  await removeExpiredReports(env);
  const rate = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM shared_reports
    WHERE source_session_id = ? AND created_at >= datetime('now', '-1 hour')
  `).bind(sessionId).first();
  if (Number(rate?.count || 0) >= 10) {
    return json(request, env, { error: "临时链接生成过于频繁，请一小时后再试" }, 429);
  }

  const token = createReportToken();
  const filename = cleanReportFilename(body.filename);
  const expiresAt = new Date(Date.now() + REPORT_SHARE_TTL_MS).toISOString();
  await env.DB.prepare(`
    INSERT INTO shared_reports (
      token, filename, mime_type, file_base64, source_session_id, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
  `).bind(token, filename, DOCX_MIME, report.encoded, sessionId, expiresAt).run();

  const shareUrl = new URL(`/shared-report?token=${token}`, request.url).toString();
  return json(request, env, { ok: true, shareUrl, expiresAt });
}

async function findSharedReport(env, token, includeFile = false) {
  if (!REPORT_TOKEN_PATTERN.test(token)) return null;
  await removeExpiredReports(env);
  const columns = includeFile
    ? "filename, mime_type, file_base64, expires_at"
    : "filename, mime_type, expires_at";
  return env.DB.prepare(`
    SELECT ${columns}
    FROM shared_reports
    WHERE token = ? AND datetime(expires_at) > datetime('now')
  `).bind(token).first();
}

async function handleSharedReportInfo(request, env, token) {
  const report = await findSharedReport(env, token);
  if (!report) return json(request, env, { error: "报告链接不存在或已过期" }, 404);
  return json(request, env, {
    filename: report.filename,
    expiresAt: report.expires_at
  });
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
  return `attachment; filename="assessment-report.docx"; filename*=UTF-8''${encoded}`;
}

async function handleSharedReportDownload(request, env, token) {
  const report = await findSharedReport(env, token, true);
  if (!report) return json(request, env, { error: "报告链接不存在或已过期" }, 404);
  const validFile = validReportBase64(report.file_base64);
  if (!validFile) return json(request, env, { error: "报告文件已损坏，请联系发送人重新生成" }, 410);
  return new Response(decodeBase64(validFile.encoded), {
    headers: responseHeaders(request, env, {
      "Content-Type": report.mime_type || DOCX_MIME,
      "Content-Disposition": contentDisposition(report.filename),
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Length": String(validFile.byteLength),
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    })
  });
}

function normalizeRecord(rawRecord, deidentified) {
  const raw = rawRecord && typeof rawRecord === "object" ? rawRecord : {};
  const studentName = cleanString(raw.studentName, 80);
  const studentCode = cleanString(raw.studentCode, 60);
  const identityValues = [studentName, raw.className, raw.organizationName, raw.evaluator, raw.reviewer];
  const domains = {};

  Object.entries(raw.domains || {}).slice(0, DOMAIN_LIMIT).forEach(([domainId, domain]) => {
    const safeDomainId = cleanString(domainId, 50);
    if (!safeDomainId || !domain || typeof domain !== "object") return;
    const items = {};
    Object.entries(domain.items || {}).slice(0, ITEM_LIMIT).forEach(([itemId, score]) => {
      const safeItemId = cleanString(itemId, 60);
      if (safeItemId) items[safeItemId] = cleanScore(score);
    });
    domains[safeDomainId] = {
      items,
      impact: cleanImpact(domain.impact),
      support: cleanString(domain.support, 60),
      note: deidentified ? scrubSensitiveText(domain.note, identityValues) : cleanString(domain.note, 1200)
    };
  });

  return {
    id: cleanString(raw.id, 80) || crypto.randomUUID(),
    studentName: deidentified ? "" : studentName,
    studentCode,
    gender: cleanString(raw.gender, 20),
    age: cleanString(raw.age, 40),
    className: deidentified ? "" : cleanString(raw.className, 80),
    organizationName: deidentified ? "" : cleanString(raw.organizationName, 120),
    primaryNeed: cleanString(raw.primaryNeed, 100),
    assessmentDate: cleanDate(raw.assessmentDate),
    evaluator: deidentified ? "" : cleanString(raw.evaluator, 80),
    reviewer: deidentified ? "" : cleanString(raw.reviewer, 80),
    setting: cleanString(raw.setting, 80),
    cooperation: cleanString(raw.cooperation, 80),
    communicationMode: cleanString(raw.communicationMode, 100),
    mobility: cleanString(raw.mobility, 100),
    observationSources: cleanArray(raw.observationSources, 8, 80),
    background: deidentified ? "" : cleanString(raw.background, 1500),
    medicalPrecautions: deidentified ? "" : cleanString(raw.medicalPrecautions, 1000),
    domains,
    updatedAt: new Date().toISOString()
  };
}

function normalizeAnalysis(rawAnalysis, identityValues = []) {
  const raw = rawAnalysis && typeof rawAnalysis === "object" ? rawAnalysis : {};
  const cleanAnalysisString = (value, max) => scrubSensitiveText(cleanString(value, max), identityValues).slice(0, max);
  const cleanAnalysisArray = (value, maxItems, maxLength) => {
    if (!Array.isArray(value)) return [];
    return value.slice(0, maxItems).map((item) => cleanAnalysisString(item, maxLength)).filter(Boolean);
  };
  const domainScores = {};
  Object.entries(raw.domainScores || {}).slice(0, DOMAIN_LIMIT).forEach(([id, item]) => {
    if (!item || typeof item !== "object") return;
    const safeId = cleanString(id, 50);
    const score = Number(item.score);
    if (!safeId || !Number.isFinite(score)) return;
    domainScores[safeId] = {
      title: cleanString(item.title, 100),
      score: Math.max(1, Math.min(5, Number(score.toFixed(2)))),
      impact: cleanImpact(item.impact),
      answered: Math.max(0, Math.min(ITEM_LIMIT, Number(item.answered) || 0)),
      support: cleanString(item.support, 60),
      priority: Number.isFinite(Number(item.priority)) ? Math.max(0, Math.min(20, Number(Number(item.priority).toFixed(2)))) : null
    };
  });

  const average = Number(raw.average);
  return {
    average: Number.isFinite(average) ? Math.max(1, Math.min(5, Number(average.toFixed(2)))) : null,
    coverage: Math.max(0, Math.min(100, Number(raw.coverage) || 0)),
    methodVersion: cleanString(raw.methodVersion, 80),
    level: cleanString(raw.level, 60),
    confidence: cleanString(raw.confidence, 40),
    summary: cleanAnalysisString(raw.summary, 1000),
    basis: cleanAnalysisArray(raw.basis, 10, 600),
    alerts: cleanAnalysisArray(raw.alerts, 10, 700),
    strengths: cleanAnalysisArray(raw.strengths, 10, 600),
    needs: cleanAnalysisArray(raw.needs, 10, 700),
    goals: cleanAnalysisArray(raw.goals, 10, 800),
    strategies: cleanAnalysisArray(raw.strategies, 12, 800),
    domainScores
  };
}

async function hashesEqual(left, right) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}

async function isAdmin(request, env) {
  const provided = request.headers.get("X-Admin-Key") || "";
  return hashesEqual(provided, String(env.ADMIN_TOKEN || ""));
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return json(request, env, { error: "后台尚未配置管理密钥" }, 503);
  if (!(await isAdmin(request, env))) return json(request, env, { error: "管理密钥无效" }, 401);
  return null;
}

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(value) {
  const email = cleanString(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
}

function maskEmail(value) {
  const [name, domain] = String(value || "").split("@");
  if (!name || !domain) return "已指定邮箱";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}

function createInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function roleLabel(role) {
  return { admin: "部门管理员", evaluator: "评估成员", viewer: "只读成员" }[role] || role;
}

async function teamIdentity(request, env) {
  const auth = getAuth(request, env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return { auth, denied: json(request, env, { error: "请先登录团队工作台" }, 401) };

  const member = await env.DB.prepare(`
    SELECT user_id, email, display_name, role, status, created_at, last_active_at
    FROM team_members
    WHERE user_id = ?
  `).bind(session.user.id).first();
  if (!member || member.status !== "active") {
    return { auth, denied: json(request, env, { error: "账号未加入本部门或已停用" }, 403) };
  }

  if (!member.last_active_at || Date.now() - new Date(`${member.last_active_at.replace(" ", "T")}Z`).getTime() > 5 * 60 * 1000) {
    await env.DB.prepare("UPDATE team_members SET last_active_at = datetime('now') WHERE user_id = ?").bind(member.user_id).run();
  }
  return { auth, session, member };
}

function requireRole(request, env, identity, roles) {
  if (identity.denied) return identity.denied;
  if (!roles.includes(identity.member.role)) {
    return json(request, env, { error: "当前账号没有执行此操作的权限" }, 403);
  }
  return null;
}

function auditStatement(env, userId, action, targetType, targetId = null, metadata = {}) {
  return env.DB.prepare(`
    INSERT INTO team_audit_logs (user_id, action, target_type, target_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(userId || null, action, targetType, targetId || null, JSON.stringify(metadata));
}

async function authPost(auth, request, pathname, body = {}) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  const headers = new Headers({ "Content-Type": "application/json" });
  ["Cookie", "Origin", "User-Agent"].forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  return auth.handler(new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }));
}

async function handleTeamLogin(request, env) {
  const body = await parseBody(request, 12_000);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return json(request, env, { error: "邮箱或密码不正确" }, 401);

  const emailHash = await sha256Hex(email);
  await env.DB.prepare("DELETE FROM team_login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM team_login_attempts
    WHERE email_hash = ? AND succeeded = 0 AND attempted_at >= datetime('now', '-15 minutes')
  `).bind(emailHash).first();
  if (Number(recent?.count || 0) >= 8) {
    return json(request, env, { error: "尝试次数过多，请15分钟后再试" }, 429);
  }

  const member = await env.DB.prepare("SELECT user_id, status FROM team_members WHERE email = ?").bind(email).first();
  if (!member || member.status !== "active") {
    await env.DB.prepare("INSERT INTO team_login_attempts (email_hash, succeeded) VALUES (?, 0)").bind(emailHash).run();
    return json(request, env, { error: "邮箱或密码不正确" }, 401);
  }

  const auth = getAuth(request, env);
  const authResponse = await authPost(auth, request, "/api/auth/sign-in/email", {
    email,
    password,
    rememberMe: false
  });
  if (!authResponse.ok) {
    await env.DB.prepare("INSERT INTO team_login_attempts (email_hash, succeeded) VALUES (?, 0)").bind(emailHash).run();
    return json(request, env, { error: "邮箱或密码不正确" }, authResponse.status === 429 ? 429 : 401);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM team_login_attempts WHERE email_hash = ?").bind(emailHash),
    env.DB.prepare("UPDATE team_members SET last_active_at = datetime('now') WHERE user_id = ?").bind(member.user_id),
    auditStatement(env, member.user_id, "member.login", "member", member.user_id)
  ]);
  return withSecurityHeaders(request, env, authResponse);
}

async function findInvite(env, rawToken) {
  if (!INVITE_TOKEN_PATTERN.test(rawToken)) return null;
  const tokenHash = await sha256Hex(rawToken);
  return env.DB.prepare(`
    SELECT id, email, role, expires_at, used_at, revoked_at
    FROM team_invites
    WHERE token_hash = ?
  `).bind(tokenHash).first();
}

function inviteIsActive(invite) {
  return Boolean(invite && !invite.used_at && !invite.revoked_at && new Date(invite.expires_at).getTime() > Date.now());
}

async function handleInviteInfo(request, env, rawToken) {
  const invite = await findInvite(env, rawToken);
  if (!inviteIsActive(invite)) return json(request, env, { error: "邀请链接无效、已使用或已过期" }, 404);
  return json(request, env, {
    emailHint: maskEmail(invite.email),
    role: invite.role,
    roleLabel: roleLabel(invite.role),
    expiresAt: invite.expires_at,
    teamName: cleanString(env.TEAM_NAME, 100) || "本校康复评估部门"
  });
}

async function handleTeamRegister(request, env) {
  const body = await parseBody(request, 16_000);
  const rawToken = cleanString(body.inviteToken, 80);
  const invite = await findInvite(env, rawToken);
  if (!inviteIsActive(invite)) return json(request, env, { error: "邀请链接无效、已使用或已过期" }, 404);

  const email = normalizeEmail(body.email);
  const displayName = cleanString(body.displayName, 40);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || email !== invite.email) return json(request, env, { error: "请输入邀请中指定的邮箱" }, 400);
  if (displayName.length < 2) return json(request, env, { error: "姓名或工作称呼至少填写2个字符" }, 400);
  if (password.length < 12 || password.length > 128) return json(request, env, { error: "密码需为12至128个字符" }, 400);

  const existingMember = await env.DB.prepare("SELECT user_id FROM team_members WHERE email = ?").bind(email).first();
  if (existingMember) return json(request, env, { error: "该邮箱已加入部门，请直接登录" }, 409);

  const auth = getAuth(request, env);
  let user = await env.DB.prepare('SELECT id, email FROM "user" WHERE email = ?').bind(email).first();
  let loginResponse = null;

  if (!user) {
    try {
      const created = await auth.api.signUpEmail({ body: { email, password, name: displayName } });
      user = created?.user || null;
    } catch {
      return json(request, env, { error: "账号创建失败，请检查邮箱和密码后重试" }, 400);
    }
  } else {
    loginResponse = await authPost(auth, request, "/api/auth/sign-in/email", { email, password, rememberMe: false });
    if (!loginResponse.ok) return json(request, env, { error: "该邮箱已有账号，输入的密码不正确" }, 409);
  }
  if (!user?.id) return json(request, env, { error: "账号创建失败，请稍后重试" }, 500);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO team_members (user_id, email, display_name, role, status, created_at, last_active_at)
      VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).bind(user.id, email, displayName, invite.role),
    env.DB.prepare(`
      UPDATE team_invites
      SET used_by_user_id = ?, used_at = datetime('now')
      WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
    `).bind(user.id, invite.id),
    auditStatement(env, user.id, "invite.accept", "invite", invite.id, { role: invite.role })
  ]);

  if (!loginResponse) {
    loginResponse = await authPost(auth, request, "/api/auth/sign-in/email", { email, password, rememberMe: false });
  }
  if (!loginResponse.ok) return json(request, env, { ok: true, loginRequired: true }, 201);
  return withSecurityHeaders(request, env, loginResponse);
}

async function createTeamInvite(request, env, { email, role, createdByUserId = null }) {
  const rawToken = createInviteToken();
  const tokenHash = await sha256Hex(rawToken);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE team_invites SET revoked_at = datetime('now')
      WHERE email = ? AND used_at IS NULL AND revoked_at IS NULL
    `).bind(email),
    env.DB.prepare(`
      INSERT INTO team_invites (id, token_hash, email, role, created_by_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, tokenHash, email, role, createdByUserId, expiresAt),
    auditStatement(env, createdByUserId, "invite.create", "invite", id, { role })
  ]);

  const inviteUrl = new URL(`/team.html?invite=${encodeURIComponent(rawToken)}`, request.url).toString();
  return { id, email, role, roleLabel: roleLabel(role), inviteUrl, expiresAt };
}

async function handleAdminBootstrapInvite(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const memberCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM team_members").first();
  if (Number(memberCount?.count || 0) > 0) {
    return json(request, env, { error: "团队已建立，请由团队管理员在工作台中邀请成员" }, 409);
  }
  const body = await parseBody(request, 8_000);
  const email = normalizeEmail(body.email);
  if (!email) return json(request, env, { error: "请输入有效邮箱" }, 400);
  const invite = await createTeamInvite(request, env, { email, role: "admin" });
  return json(request, env, { ok: true, invite }, 201);
}

async function handleCreateTeamInvite(request, env) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  const body = await parseBody(request, 8_000);
  const email = normalizeEmail(body.email);
  const role = cleanString(body.role, 20);
  if (!email) return json(request, env, { error: "请输入有效邮箱" }, 400);
  if (!TEAM_ROLES.has(role)) return json(request, env, { error: "成员角色无效" }, 400);
  const existing = await env.DB.prepare("SELECT user_id FROM team_members WHERE email = ?").bind(email).first();
  if (existing) return json(request, env, { error: "该邮箱已经是部门成员" }, 409);

  const pending = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM team_invites
    WHERE created_by_user_id = ? AND created_at >= datetime('now', '-1 day')
  `).bind(identity.member.user_id).first();
  if (Number(pending?.count || 0) >= 30) return json(request, env, { error: "今日邀请数量已达上限" }, 429);

  const invite = await createTeamInvite(request, env, {
    email,
    role,
    createdByUserId: identity.member.user_id
  });
  return json(request, env, { ok: true, invite }, 201);
}

async function handleTeamSession(request, env) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  return json(request, env, {
    authenticated: true,
    user: {
      id: identity.member.user_id,
      email: identity.member.email,
      displayName: identity.member.display_name,
      role: identity.member.role,
      roleLabel: roleLabel(identity.member.role)
    },
    team: {
      name: cleanString(env.TEAM_NAME, 100) || "本校康复评估部门",
      privacyMode: "deidentified"
    }
  });
}

async function handleTeamLogout(request, env) {
  const auth = getAuth(request, env);
  const response = await authPost(auth, request, "/api/auth/sign-out");
  return withSecurityHeaders(request, env, response);
}

async function handleChangePassword(request, env) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  const body = await parseBody(request, 10_000);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || newPassword.length < 12 || newPassword.length > 128) {
    return json(request, env, { error: "新密码需为12至128个字符" }, 400);
  }
  const response = await authPost(identity.auth, request, "/api/auth/change-password", {
    currentPassword,
    newPassword,
    revokeOtherSessions: true
  });
  if (!response.ok) return json(request, env, { error: "当前密码不正确或新密码不符合要求" }, 400);
  await auditStatement(env, identity.member.user_id, "member.password_change", "member", identity.member.user_id).run();
  return withSecurityHeaders(request, env, response);
}

async function handleTeamSummary(request, env) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  const isTeamAdmin = identity.member.role === "admin";
  const [metrics, recordsResult, analysisResult, memberResult, inviteResult, auditResult] = await Promise.all([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL) AS total_records,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL AND date(updated_at) = date('now')) AS today_updates,
        (SELECT COUNT(*) FROM team_members WHERE status = 'active') AS active_members,
        (SELECT COUNT(*) FROM team_members WHERE status = 'active' AND last_active_at >= datetime('now', '-10 minutes')) AS online_members
    `).first(),
    env.DB.prepare(`
      SELECT a.id, a.client_record_id, a.student_code, a.age_text, a.gender, a.primary_need,
             a.assessment_date, a.overall_score, a.coverage, a.version, a.created_at, a.updated_at,
             owner.display_name AS owner_name, updater.display_name AS updated_by_name
      FROM team_assessments a
      LEFT JOIN team_members owner ON owner.user_id = a.owner_user_id
      LEFT JOIN team_members updater ON updater.user_id = a.updated_by_user_id
      WHERE a.deleted_at IS NULL
      ORDER BY a.updated_at DESC
      LIMIT 250
    `).all(),
    env.DB.prepare("SELECT analysis_json FROM team_assessments WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500").all(),
    isTeamAdmin
      ? env.DB.prepare("SELECT user_id, email, display_name, role, status, created_at, last_active_at FROM team_members ORDER BY status, created_at").all()
      : Promise.resolve({ results: [] }),
    isTeamAdmin
      ? env.DB.prepare(`
          SELECT id, email, role, expires_at, created_at
          FROM team_invites
          WHERE used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
          ORDER BY created_at DESC LIMIT 50
        `).all()
      : Promise.resolve({ results: [] }),
    isTeamAdmin
      ? env.DB.prepare("SELECT id, user_id, action, target_type, target_id, metadata_json, created_at FROM team_audit_logs ORDER BY created_at DESC LIMIT 40").all()
      : Promise.resolve({ results: [] })
  ]);

  return json(request, env, {
    generatedAt: new Date().toISOString(),
    team: { name: cleanString(env.TEAM_NAME, 100) || "本校康复评估部门", privacyMode: "deidentified" },
    currentUser: {
      id: identity.member.user_id,
      email: identity.member.email,
      displayName: identity.member.display_name,
      role: identity.member.role,
      roleLabel: roleLabel(identity.member.role)
    },
    metrics: metrics || {},
    records: recordsResult.results || [],
    domainAverages: aggregateDomains(analysisResult.results || []),
    members: memberResult.results || [],
    invites: (inviteResult.results || []).map((row) => ({ ...row, roleLabel: roleLabel(row.role) })),
    audit: (auditResult.results || []).map((row) => ({ ...row, metadata: parseJson(row.metadata_json), metadata_json: undefined })),
    privacy: {
      mode: "团队云端仅保存去标识化记录",
      excluded: ["学生姓名", "班级与学校", "评估人与复核人", "背景资料", "医疗注意事项"]
    }
  });
}

async function handleTeamRecord(request, env, id) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  const record = await env.DB.prepare(`
    SELECT a.id, a.client_record_id, a.student_code, a.version, a.assessment_json, a.analysis_json,
           a.created_at, a.updated_at, owner.display_name AS owner_name, updater.display_name AS updated_by_name
    FROM team_assessments a
    LEFT JOIN team_members owner ON owner.user_id = a.owner_user_id
    LEFT JOIN team_members updater ON updater.user_id = a.updated_by_user_id
    WHERE a.id = ? AND a.deleted_at IS NULL
  `).bind(cleanString(id, 80)).first();
  if (!record) return json(request, env, { error: "未找到团队评估记录" }, 404);
  const versions = await env.DB.prepare(`
    SELECT v.version, v.created_at, m.display_name AS changed_by_name
    FROM team_assessment_versions v
    LEFT JOIN team_members m ON m.user_id = v.changed_by_user_id
    WHERE v.assessment_id = ?
    ORDER BY v.version DESC LIMIT 30
  `).bind(record.id).all();
  await auditStatement(env, identity.member.user_id, "assessment.view", "assessment", record.id).run();
  return json(request, env, {
    ...record,
    student_label: record.student_code,
    is_deidentified: 1,
    assessment: parseJson(record.assessment_json),
    analysis: parseJson(record.analysis_json),
    assessment_json: undefined,
    analysis_json: undefined,
    versions: versions.results || []
  });
}

async function handleTeamAssessment(request, env) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin", "evaluator"]);
  if (denied) return denied;
  const body = await parseBody(request);
  if (body.consent !== true) return json(request, env, { error: "请先确认已获得去标识化云协作授权" }, 400);

  const identityValues = [
    body.record?.studentName,
    body.record?.className,
    body.record?.organizationName,
    body.record?.evaluator,
    body.record?.reviewer
  ];
  const record = normalizeRecord(body.record, true);
  record.studentCode = normalizeTeamStudentCode(record.studentCode);
  const analysis = normalizeAnalysis(body.analysis, identityValues);
  const clientRecordId = cleanString(record.id, 80);
  if (!clientRecordId || !record.studentCode) {
    return json(request, env, { error: "协作编号须为同时包含字母和数字的内部编码，如 KFB-027" }, 400);
  }
  if (Object.keys(record.domains).length < 3) return json(request, env, { error: "评估内容不足，至少完成3个领域" }, 400);

  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM team_audit_logs
    WHERE user_id = ? AND action = 'assessment.sync' AND created_at >= datetime('now', '-1 hour')
  `).bind(identity.member.user_id).first();
  if (Number(recent?.count || 0) >= 100) return json(request, env, { error: "同步过于频繁，请稍后再试" }, 429);

  const existing = await env.DB.prepare(`
    SELECT id, version, owner_user_id, deleted_at FROM team_assessments WHERE client_record_id = ?
  `).bind(clientRecordId).first();
  if (existing?.deleted_at) return json(request, env, { error: "该团队档案已被管理员删除，不能通过自动同步恢复" }, 409);
  const assessmentId = existing?.id || crypto.randomUUID();
  const version = Number(existing?.version || 0) + 1;
  const assessmentJson = JSON.stringify(record);
  const analysisJson = JSON.stringify(analysis);
  const statements = [
    env.DB.prepare(`
      INSERT INTO team_assessments (
        id, client_record_id, student_code, age_text, gender, primary_need, assessment_date,
        overall_score, coverage, assessment_json, analysis_json, owner_user_id,
        updated_by_user_id, version, created_at, updated_at, deleted_at, deleted_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, NULL)
      ON CONFLICT(client_record_id) DO UPDATE SET
        student_code = excluded.student_code,
        age_text = excluded.age_text,
        gender = excluded.gender,
        primary_need = excluded.primary_need,
        assessment_date = excluded.assessment_date,
        overall_score = excluded.overall_score,
        coverage = excluded.coverage,
        assessment_json = excluded.assessment_json,
        analysis_json = excluded.analysis_json,
        updated_by_user_id = excluded.updated_by_user_id,
        version = excluded.version,
        updated_at = datetime('now'),
        deleted_at = NULL,
        deleted_by_user_id = NULL
    `).bind(
      assessmentId, clientRecordId, record.studentCode, record.age, record.gender,
      record.primaryNeed, record.assessmentDate, analysis.average, analysis.coverage,
      assessmentJson, analysisJson, existing?.owner_user_id || identity.member.user_id,
      identity.member.user_id, version
    ),
    env.DB.prepare(`
      INSERT INTO team_assessment_versions (
        id, assessment_id, version, assessment_json, analysis_json, changed_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(crypto.randomUUID(), assessmentId, version, assessmentJson, analysisJson, identity.member.user_id),
    auditStatement(env, identity.member.user_id, "assessment.sync", "assessment", assessmentId, { version })
  ];
  await env.DB.batch(statements);
  return json(request, env, {
    ok: true,
    assessmentId,
    clientRecordId,
    version,
    deidentified: true,
    syncedAt: new Date().toISOString()
  });
}

async function handleUpdateTeamMember(request, env, userId) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  const targetId = cleanString(userId, 80);
  const body = await parseBody(request, 8_000);
  const role = cleanString(body.role, 20);
  const status = cleanString(body.status, 20);
  if (!TEAM_ROLES.has(role) || !TEAM_MEMBER_STATUSES.has(status)) {
    return json(request, env, { error: "成员角色或状态无效" }, 400);
  }
  if (targetId === identity.member.user_id && (role !== "admin" || status !== "active")) {
    return json(request, env, { error: "不能停用或移除自己的管理员权限" }, 400);
  }
  const target = await env.DB.prepare("SELECT user_id, role, status FROM team_members WHERE user_id = ?").bind(targetId).first();
  if (!target) return json(request, env, { error: "未找到团队成员" }, 404);

  const statements = [
    env.DB.prepare("UPDATE team_members SET role = ?, status = ? WHERE user_id = ?").bind(role, status, targetId),
    auditStatement(env, identity.member.user_id, "member.update", "member", targetId, { role, status })
  ];
  if (status === "disabled") statements.push(env.DB.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(targetId));
  await env.DB.batch(statements);
  return json(request, env, { ok: true });
}

async function handleDeleteTeamRecord(request, env, id) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  const targetId = cleanString(id, 80);
  const result = await env.DB.prepare(`
    UPDATE team_assessments
    SET deleted_at = datetime('now'), deleted_by_user_id = ?, updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).bind(identity.member.user_id, targetId).run();
  if (!result.meta?.changes) return json(request, env, { error: "未找到团队评估记录" }, 404);
  await auditStatement(env, identity.member.user_id, "assessment.delete", "assessment", targetId).run();
  return json(request, env, { ok: true });
}

async function handleVisit(request, env, heartbeatOnly = false) {
  const body = await parseBody(request);
  const sessionId = validSessionId(body.sessionId);
  if (!sessionId) return json(request, env, { error: "无效的匿名会话" }, 400);
  const path = cleanString(body.path, 160) || "/";
  const deviceType = ["desktop", "tablet", "mobile"].includes(body.deviceType) ? body.deviceType : "unknown";

  const statements = [
    env.DB.prepare(`
      INSERT INTO visitor_sessions (session_id, first_seen, last_seen, entry_path, device_type)
      VALUES (?, datetime('now'), datetime('now'), ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        last_seen = datetime('now'),
        device_type = excluded.device_type
    `).bind(sessionId, path, deviceType)
  ];

  if (!heartbeatOnly) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO page_views (session_id, path, device_type, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(sessionId, path, deviceType)
    );
  }

  await env.DB.batch(statements);
  return json(request, env, { ok: true });
}

async function handleAssessment(request, env) {
  const body = await parseBody(request);
  if (body.consent !== true) return json(request, env, { error: "未确认云端同步授权" }, 400);

  const deidentified = true;
  const studentName = cleanString(body.record?.studentName, 80);
  const record = normalizeRecord(body.record, deidentified);
  const analysis = normalizeAnalysis(body.analysis, studentName);
  const sessionId = validSessionId(body.sessionId);
  const clientRecordId = cleanString(record.id, 80);

  if (!clientRecordId) return json(request, env, { error: "档案标识无效" }, 400);
  if (!record.studentCode) return json(request, env, { error: "云端同步必须填写学生编号" }, 400);
  if (Object.keys(record.domains).length < 3) {
    return json(request, env, { error: "评估内容不足，至少完成3个领域" }, 400);
  }

  if (sessionId) {
    const rate = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM assessment_records
      WHERE source_session_id = ? AND updated_at >= datetime('now', '-1 hour')
    `).bind(sessionId).first();
    if (Number(rate?.count || 0) > 30) return json(request, env, { error: "同步过于频繁，请稍后再试" }, 429);
  }

  const serverId = crypto.randomUUID();
  const studentLabel = deidentified
    ? (record.studentCode || "匿名学生")
    : (record.studentName || record.studentCode || "未命名学生");

  await env.DB.prepare(`
    INSERT INTO assessment_records (
      id, client_record_id, student_label, student_code, is_deidentified,
      age_text, gender, class_name, primary_need, assessment_date, evaluator,
      setting, cooperation, overall_score, coverage, assessment_json,
      analysis_json, source_session_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(client_record_id) DO UPDATE SET
      student_label = excluded.student_label,
      student_code = excluded.student_code,
      is_deidentified = excluded.is_deidentified,
      age_text = excluded.age_text,
      gender = excluded.gender,
      class_name = excluded.class_name,
      primary_need = excluded.primary_need,
      assessment_date = excluded.assessment_date,
      evaluator = excluded.evaluator,
      setting = excluded.setting,
      cooperation = excluded.cooperation,
      overall_score = excluded.overall_score,
      coverage = excluded.coverage,
      assessment_json = excluded.assessment_json,
      analysis_json = excluded.analysis_json,
      source_session_id = excluded.source_session_id,
      updated_at = datetime('now')
  `).bind(
    serverId,
    clientRecordId,
    studentLabel,
    record.studentCode,
    deidentified ? 1 : 0,
    record.age,
    record.gender,
    record.className,
    record.primaryNeed,
    record.assessmentDate,
    record.evaluator,
    record.setting,
    record.cooperation,
    analysis.average,
    analysis.coverage,
    JSON.stringify(record),
    JSON.stringify(analysis),
    sessionId || null
  ).run();

  return json(request, env, {
    ok: true,
    clientRecordId,
    deidentified,
    syncedAt: new Date().toISOString()
  });
}

function aggregateDomains(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    try {
      const analysis = JSON.parse(row.analysis_json || "{}");
      Object.entries(analysis.domainScores || {}).forEach(([id, item]) => {
        if (!item || !Number.isFinite(Number(item.score))) return;
        const current = totals.get(id) || { id, title: cleanString(item.title, 100) || id, total: 0, count: 0 };
        current.total += Number(item.score);
        current.count += 1;
        totals.set(id, current);
      });
    } catch {
      // Ignore malformed historical rows while preserving the rest of the dashboard.
    }
  });
  return Array.from(totals.values())
    .map((item) => ({ id: item.id, title: item.title, score: Number((item.total / item.count).toFixed(2)), count: item.count }))
    .sort((a, b) => a.score - b.score);
}

async function handleAdminSummary(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  const [metrics, trafficResult, recordResult, analysisResult] = await Promise.all([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM page_views) AS total_views,
        (SELECT COUNT(DISTINCT session_id) FROM page_views) AS total_sessions,
        (SELECT COUNT(*) FROM page_views WHERE date(created_at) = date('now')) AS today_views,
        (SELECT COUNT(*) FROM visitor_sessions WHERE last_seen >= datetime('now', '-2 minutes')) AS active_now,
        (SELECT COUNT(*) FROM assessment_records) AS total_assessments,
        (SELECT COUNT(*) FROM assessment_records WHERE date(created_at) = date('now')) AS today_assessments,
        (SELECT COUNT(*) FROM team_members WHERE status = 'active') AS team_member_count,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL) AS team_record_count
    `).first(),
    env.DB.prepare(`
      SELECT substr(created_at, 1, 10) AS day,
             COUNT(*) AS views,
             COUNT(DISTINCT session_id) AS sessions
      FROM page_views
      WHERE created_at >= datetime('now', '-13 days')
      GROUP BY substr(created_at, 1, 10)
      ORDER BY day ASC
    `).all(),
    env.DB.prepare(`
      SELECT id, student_label, student_code, is_deidentified, age_text, gender,
             class_name, primary_need, assessment_date, evaluator, setting,
             overall_score, coverage, created_at, updated_at
      FROM assessment_records
      ORDER BY updated_at DESC
      LIMIT 100
    `).all(),
    env.DB.prepare(`
      SELECT analysis_json
      FROM assessment_records
      ORDER BY updated_at DESC
      LIMIT 500
    `).all()
  ]);

  return json(request, env, {
    generatedAt: new Date().toISOString(),
    metrics: metrics || {},
    traffic: trafficResult.results || [],
    domainAverages: aggregateDomains(analysisResult.results || []),
    records: recordResult.results || [],
    privacy: {
      visitorData: "仅记录匿名会话、访问时间、页面路径和设备类别，不保存IP地址",
      assessmentData: "仅包含使用者主动授权同步的评估记录"
    }
  });
}

async function handleAdminRecord(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const record = await env.DB.prepare(`
    SELECT id, student_label, student_code, is_deidentified, assessment_json,
           analysis_json, created_at, updated_at
    FROM assessment_records
    WHERE id = ?
  `).bind(cleanString(id, 80)).first();
  if (!record) return json(request, env, { error: "未找到评估记录" }, 404);
  return json(request, env, {
    ...record,
    assessment: JSON.parse(record.assessment_json || "{}"),
    analysis: JSON.parse(record.analysis_json || "{}"),
    assessment_json: undefined,
    analysis_json: undefined
  });
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function handleAdminExport(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT student_label, student_code, is_deidentified, age_text, gender,
           class_name, primary_need, assessment_date, evaluator, setting,
           overall_score, coverage, assessment_json, created_at, updated_at
    FROM assessment_records
    ORDER BY updated_at DESC
  `).all();
  const header = ["学生标识", "学生编号", "去标识化", "年龄", "性别", "班级", "机构/学校", "主要发展需要", "评估日期", "评估人", "复核人", "情境", "总分", "完成度", "首次同步", "最后更新"];
  const rows = (result.results || []).map((row) => {
    const assessment = JSON.parse(row.assessment_json || "{}");
    return [
      row.student_label, row.student_code, row.is_deidentified ? "是" : "否",
      row.age_text, row.gender, row.class_name, assessment.organizationName, row.primary_need, row.assessment_date,
      row.evaluator, assessment.reviewer, row.setting, row.overall_score, `${row.coverage}%`, row.created_at, row.updated_at
    ];
  });
  const csv = "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: responseHeaders(request, env, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sensory-assessment-cloud-${new Date().toISOString().slice(0, 10)}.csv"`
    })
  });
}

async function handleDeleteRecord(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const result = await env.DB.prepare("DELETE FROM assessment_records WHERE id = ?").bind(cleanString(id, 80)).run();
  if (!result.meta?.changes) return json(request, env, { error: "未找到评估记录" }, 404);
  return json(request, env, { ok: true });
}

function routePath(request) {
  return new URL(request.url).pathname.replace(/\/+$/, "") || "/";
}

export function onRequestOptions(context) {
  if (!originIsAllowed(context.request, context.env)) {
    return json(context.request, context.env, { error: "不允许的请求来源" }, 403);
  }
  return new Response(null, { status: 204, headers: responseHeaders(context.request, context.env) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!originIsAllowed(request, env)) return json(request, env, { error: "不允许的请求来源" }, 403);
  const path = routePath(request);
  try {
    if (path === "/api/team/login") return handleTeamLogin(request, env);
    if (path === "/api/team/register") return handleTeamRegister(request, env);
    if (path === "/api/team/logout") return handleTeamLogout(request, env);
    if (path === "/api/team/change-password") return handleChangePassword(request, env);
    if (path === "/api/team/assessments") return handleTeamAssessment(request, env);
    if (path === "/api/team/invites") return handleCreateTeamInvite(request, env);
    if (path === "/api/admin/team/invites") return handleAdminBootstrapInvite(request, env);
    if (path.startsWith("/api/team/members/")) return handleUpdateTeamMember(request, env, path.split("/").pop());
    if (path === "/api/analytics/visit") return handleVisit(request, env, false);
    if (path === "/api/analytics/heartbeat") return handleVisit(request, env, true);
    if (path === "/api/assessments") {
      return json(request, env, { error: "匿名云同步已停用，请登录团队工作台使用邀请制协作" }, 410);
    }
    if (path === "/api/reports/share") return handleCreateReportShare(request, env);
    return json(request, env, { error: "接口不存在" }, 404);
  } catch (error) {
    if (error.message === "payload_too_large") return json(request, env, { error: "提交内容过大" }, 413);
    if (error.message === "invalid_json") return json(request, env, { error: "提交内容格式错误" }, 400);
    if (error.message === "auth_not_configured") return json(request, env, { error: "团队认证尚未配置" }, 503);
    return json(request, env, { error: "服务暂时不可用" }, 500);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!originIsAllowed(request, env)) return json(request, env, { error: "不允许的请求来源" }, 403);
  const path = routePath(request);
  try {
    if (path === "/api/team/session") return handleTeamSession(request, env);
    if (path === "/api/team/summary") return handleTeamSummary(request, env);
    if (path.startsWith("/api/team/invites/")) return handleInviteInfo(request, env, path.split("/").pop());
    if (path.startsWith("/api/team/records/")) return handleTeamRecord(request, env, path.split("/").pop());
    const sharedReport = reportPathMatch(path);
    if (sharedReport) {
      return sharedReport[2]
        ? handleSharedReportDownload(request, env, sharedReport[1])
        : handleSharedReportInfo(request, env, sharedReport[1]);
    }
    if (path === "/api/admin/summary") return handleAdminSummary(request, env);
    if (path === "/api/admin/export") return handleAdminExport(request, env);
    if (path.startsWith("/api/admin/records/")) return handleAdminRecord(request, env, path.split("/").pop());
    return json(request, env, { error: "接口不存在" }, 404);
  } catch (error) {
    if (error.message === "auth_not_configured") return json(request, env, { error: "团队认证尚未配置" }, 503);
    return json(request, env, { error: "服务暂时不可用" }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!originIsAllowed(request, env)) return json(request, env, { error: "不允许的请求来源" }, 403);
  const path = routePath(request);
  try {
    if (path.startsWith("/api/team/records/")) return handleDeleteTeamRecord(request, env, path.split("/").pop());
    if (path.startsWith("/api/admin/records/")) return handleDeleteRecord(request, env, path.split("/").pop());
    return json(request, env, { error: "接口不存在" }, 404);
  } catch (error) {
    if (error.message === "auth_not_configured") return json(request, env, { error: "团队认证尚未配置" }, 503);
    return json(request, env, { error: "服务暂时不可用" }, 500);
  }
}
