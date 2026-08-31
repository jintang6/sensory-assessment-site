import { getAuth } from "../_lib/auth.js";
import { hashPassword } from "better-auth/crypto";

const MAX_BODY_BYTES = 180_000;
const MAX_REPORT_BODY_BYTES = 850_000;
const MAX_REPORT_BYTES = 600_000;
const DOMAIN_LIMIT = 64;
const ITEM_LIMIT = 10;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const REPORT_TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const REPORT_SHARE_TTL_MS = 24 * 60 * 60 * 1000;
const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INVITE_CODE_PATTERN = /^KFB[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/;
const TEAM_ROLES = new Set(["admin", "evaluator", "viewer"]);
const TEAM_MEMBER_STATUSES = new Set(["active", "disabled"]);
const GOAL_PRIORITIES = new Set(["high", "medium", "routine"]);
const GOAL_STATUSES = new Set(["active", "achieved", "paused", "archived"]);
const INTERVENTION_SETTINGS = new Set(["classroom", "therapy", "daily_living", "home", "community"]);
const OBSERVER_TYPES = new Set(["therapist", "teacher", "family", "multidisciplinary"]);
const RESPONSE_LEVELS = new Set(["limited", "emerging", "stable", "generalized"]);
const PROFESSIONAL_MODULE_IDS = ["si", "ot", "st", "pt"];
const PROFESSIONAL_MODULE_SET = new Set(PROFESSIONAL_MODULE_IDS);
const FEEDBACK_CATEGORIES = new Set(["suggestion", "content", "bug", "workflow", "other"]);
let teamRosterSchemaReady = false;
let teamCareSchemaReady = false;

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

function shanghaiDate(offsetDays = 0) {
  return new Date(Date.now() + (8 * 60 * 60 * 1000) + offsetDays * 86400000).toISOString().slice(0, 10);
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
  if (!filename) filename = "学生功能评估与康复支持报告.docx";
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
  const professionalAssessors = {};

  PROFESSIONAL_MODULE_IDS.forEach((moduleId) => {
    const assessor = raw.professionalAssessors?.[moduleId];
    if (!assessor || typeof assessor !== "object") return;
    professionalAssessors[moduleId] = {
      evaluator: cleanString(assessor.evaluator, 80),
      assessmentDate: cleanDate(assessor.assessmentDate),
      contributors: cleanArray(assessor.contributors, 12, 80),
      lastUpdatedAt: cleanString(assessor.lastUpdatedAt, 40)
    };
  });

  Object.entries(raw.domains || {}).slice(0, DOMAIN_LIMIT).forEach(([domainId, domain]) => {
    const safeDomainId = cleanString(domainId, 50);
    if (!safeDomainId || !domain || typeof domain !== "object") return;
    const items = {};
    Object.entries(domain.items || {}).slice(0, ITEM_LIMIT).forEach(([itemId, score]) => {
      const safeItemId = cleanString(itemId, 60);
      if (safeItemId) items[safeItemId] = cleanScore(score);
    });
    domains[safeDomainId] = {
      professional: PROFESSIONAL_MODULE_IDS.includes(cleanString(domain.professional, 10)) ? cleanString(domain.professional, 10) : "",
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
    professionalAssessors,
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
      professional: PROFESSIONAL_MODULE_IDS.includes(cleanString(item.professional, 10)) ? cleanString(item.professional, 10) : "",
      score: Math.max(1, Math.min(5, Number(score.toFixed(2)))),
      impact: cleanImpact(item.impact),
      answered: Math.max(0, Math.min(ITEM_LIMIT, Number(item.answered) || 0)),
      support: cleanString(item.support, 60),
      priority: Number.isFinite(Number(item.priority)) ? Math.max(0, Math.min(20, Number(Number(item.priority).toFixed(2)))) : null
    };
  });

  const courseRecommendations = Array.isArray(raw.courseRecommendations)
    ? raw.courseRecommendations.slice(0, 2).map((item) => ({
        courseId: cleanString(item?.courseId, 20),
        title: cleanAnalysisString(item?.title, 100),
        rank: Math.max(1, Math.min(2, Number(item?.rank) || 1)),
        priorityLabel: cleanAnalysisString(item?.priorityLabel, 30),
        needIndex: Number.isFinite(Number(item?.needIndex)) ? Math.max(0, Math.min(20, Number(Number(item.needIndex).toFixed(2)))) : null,
        rationale: cleanAnalysisString(item?.rationale, 500),
        focus: cleanAnalysisString(item?.focus, 300),
        decisionNote: cleanAnalysisString(item?.decisionNote, 400)
      })).filter((item) => item.courseId && item.title)
    : [];
  const moduleReadiness = {};
  PROFESSIONAL_MODULE_IDS.forEach((moduleId) => {
    const item = raw.moduleReadiness?.[moduleId];
    if (!item || typeof item !== "object") return;
    moduleReadiness[moduleId] = {
      label: cleanString(item.label, 60),
      validDomainCount: Math.max(0, Math.min(DOMAIN_LIMIT, Number(item.validDomainCount) || 0)),
      totalDomainCount: Math.max(0, Math.min(DOMAIN_LIMIT, Number(item.totalDomainCount) || 0)),
      answeredItems: Math.max(0, Math.min(DOMAIN_LIMIT * ITEM_LIMIT, Number(item.answeredItems) || 0)),
      totalItems: Math.max(0, Math.min(DOMAIN_LIMIT * ITEM_LIMIT, Number(item.totalItems) || 0)),
      coverage: Math.max(0, Math.min(100, Number(item.coverage) || 0)),
      ready: item.ready === true,
      evaluator: cleanString(item.evaluator, 80),
      assessmentDate: cleanDate(item.assessmentDate)
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
    courseRecommendations,
    courseRecommendationNotes: cleanAnalysisArray(raw.courseRecommendationNotes, 6, 500),
    moduleReadiness,
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
  if (env.ADMIN_TOKEN && await isAdmin(request, env)) return null;
  try {
    const auth = getAuth(request, env);
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) {
      const member = await env.DB.prepare(`
        SELECT role, status, password_change_required
        FROM team_members WHERE user_id = ?
      `).bind(session.user.id).first();
      if (member?.status === "active" && member.role === "admin" && Number(member.password_change_required) !== 1) return null;
    }
  } catch {
    // The management key remains available for bootstrap and recovery.
  }
  return json(request, env, { error: "请使用部门管理员账号登录，或输入有效管理密钥" }, 401);
}

function superAdminEmailHashes(env) {
  return String(env.SUPER_ADMIN_EMAIL_HASHES || "")
    .split(",")
    .map((hash) => cleanString(hash, 64).toLowerCase())
    .filter((hash) => /^[a-f0-9]{64}$/.test(hash))
    .filter(Boolean);
}

async function isSuperAdminMember(member, env) {
  if (member?.status !== "active"
    || member.role !== "admin"
    || Number(member.password_change_required) === 1) return false;
  const emailHash = await sha256Hex(normalizeEmail(member.email));
  return superAdminEmailHashes(env).includes(emailHash);
}

async function requireSuperAdmin(request, env) {
  if (env.ADMIN_TOKEN && await isAdmin(request, env)) return null;
  let signedIn = false;
  try {
    const auth = getAuth(request, env);
    const session = await auth.api.getSession({ headers: request.headers });
    signedIn = Boolean(session?.user?.id);
    if (session?.user?.id) {
      const member = await env.DB.prepare(`
        SELECT email, role, status, password_change_required
        FROM team_members WHERE user_id = ?
      `).bind(session.user.id).first();
      if (await isSuperAdminMember(member, env)) return null;
    }
  } catch {
    // The management key remains available for bootstrap and recovery.
  }
  return json(request, env, {
    error: signedIn ? "仅超级管理员可以进入运营与数据后台" : "请使用超级管理员账号登录，或输入有效管理密钥"
  }, signedIn ? 403 : 401);
}

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(value) {
  const email = cleanString(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
}

function normalizeInviteCode(value) {
  const compact = cleanString(value, 40).toUpperCase().replace(/[\s-]+/g, "");
  return INVITE_CODE_PATTERN.test(compact) ? compact : "";
}

function formatInviteCode(value) {
  const compact = normalizeInviteCode(value);
  if (!compact) return "";
  return `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7, 11)}-${compact.slice(11, 15)}`;
}

function createInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const random = Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte & 31]).join("");
  return `KFB${random}`;
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

function moduleLabel(moduleId) {
  return { all: "全专业", si: "感觉统合 SI", ot: "作业治疗 OT", st: "言语语言 ST", pt: "运动功能 PT" }[moduleId] || "未分组";
}

function memberModules(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => PROFESSIONAL_MODULE_SET.has(item));
}

async function teamIdentity(request, env, { allowPasswordChange = false } = {}) {
  const auth = getAuth(request, env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return { auth, denied: json(request, env, { error: "请先登录团队工作台" }, 401) };

  const member = await env.DB.prepare(`
    SELECT user_id, email, display_name, role, status, primary_module, module_access,
           assignment_note, password_change_required, password_changed_at,
           password_reset_at, created_at, last_active_at
    FROM team_members
    WHERE user_id = ?
  `).bind(session.user.id).first();
  if (!member || member.status !== "active") {
    return { auth, denied: json(request, env, { error: "账号未加入本部门或已停用" }, 403) };
  }
  if (!allowPasswordChange && Number(member.password_change_required) === 1) {
    return { auth, session, member, denied: json(request, env, { error: "首次登录必须先修改初始密码", passwordChangeRequired: true }, 428) };
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

function sqliteTimestamp(value) {
  const text = cleanString(value, 40);
  if (!text) return null;
  const date = new Date(text.includes("T") ? text : `${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function trashRetention(record) {
  const deletedAt = sqliteTimestamp(record.deleted_at);
  const expiresAt = deletedAt ? new Date(deletedAt.getTime() + TRASH_RETENTION_MS) : null;
  return {
    ...record,
    expires_at: expiresAt?.toISOString() || "",
    days_remaining: expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : 0
  };
}

async function purgeExpiredAssessments(env) {
  const expired = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM team_assessments
    WHERE deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime('now', '-${TRASH_RETENTION_DAYS} days')
  `).first();
  if (!Number(expired?.count || 0)) return 0;
  const results = await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM team_assessment_versions
      WHERE assessment_id IN (
        SELECT id FROM team_assessments
        WHERE deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime('now', '-${TRASH_RETENTION_DAYS} days')
      )
    `),
    env.DB.prepare(`
      DELETE FROM team_assessments
      WHERE deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime('now', '-${TRASH_RETENTION_DAYS} days')
    `)
  ]);
  const purged = Number(results[1]?.meta?.changes || 0);
  if (purged) {
    await auditStatement(env, null, "assessment.trash_expired", "assessment_batch", null, {
      count: purged,
      retentionDays: TRASH_RETENTION_DAYS
    }).run();
  }
  return purged;
}

async function maintainAssessmentTrash(path, env) {
  if (path.startsWith("/api/team/") || path.startsWith("/api/admin/")) {
    await purgeExpiredAssessments(env);
  }
}

async function signedInAdminUserId(request, env) {
  try {
    const auth = getAuth(request, env);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return null;
    const member = await env.DB.prepare(`
      SELECT user_id FROM team_members
      WHERE user_id = ? AND role = 'admin' AND status = 'active'
    `).bind(session.user.id).first();
    return member?.user_id || null;
  } catch {
    return null;
  }
}

async function ensureTeamRosterSchema(env) {
  if (teamRosterSchemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`
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
      )
    `),
    env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_team_students_class_order
      ON team_students(status, school_year, class_name, roster_order, student_name)
    `),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_team_students_name ON team_students(student_name)")
  ]);
  teamRosterSchemaReady = true;
}

async function ensureTeamCareSchema(env) {
  if (teamCareSchemaReady) return;
  await ensureTeamRosterSchema(env);
  await env.DB.batch([
    env.DB.prepare(`
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
      )
    `),
    env.DB.prepare(`
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
      )
    `),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_team_goals_student_status ON team_goals(student_id, status, review_date, priority)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_team_interventions_student_date ON team_intervention_logs(student_id, session_date DESC, created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_team_interventions_goal ON team_intervention_logs(goal_id, session_date DESC)")
  ]);
  teamCareSchemaReady = true;
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

async function findInvite(env, rawCode) {
  const inviteCode = normalizeInviteCode(rawCode);
  if (!inviteCode) return null;
  const codeHash = await sha256Hex(inviteCode);
  return env.DB.prepare(`
    SELECT id, code_hint, role, expires_at, used_at, revoked_at, reservation_id, reserved_at
    FROM team_invites
    WHERE code_hash = ?
  `).bind(codeHash).first();
}

function inviteIsActive(invite) {
  if (!invite || invite.used_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) return false;
  if (!invite.reservation_id || !invite.reserved_at) return true;
  const reservedAt = new Date(`${String(invite.reserved_at).replace(" ", "T")}Z`).getTime();
  return !Number.isFinite(reservedAt) || Date.now() - reservedAt >= 10 * 60 * 1000;
}

async function reserveInvite(env, inviteId) {
  const reservationId = crypto.randomUUID();
  const result = await env.DB.prepare(`
    UPDATE team_invites
    SET reservation_id = ?, reserved_at = datetime('now')
    WHERE id = ?
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
      AND (reservation_id IS NULL OR reserved_at IS NULL OR reserved_at < datetime('now', '-10 minutes'))
  `).bind(reservationId, inviteId).run();
  return result.meta?.changes === 1 ? reservationId : "";
}

async function releaseInviteReservation(env, inviteId, reservationId) {
  if (!reservationId) return;
  await env.DB.prepare(`
    UPDATE team_invites
    SET reservation_id = NULL, reserved_at = NULL
    WHERE id = ? AND reservation_id = ? AND used_at IS NULL
  `).bind(inviteId, reservationId).run();
}

async function handleInviteInfo(request, env) {
  const body = await parseBody(request, 4_000);
  const invite = await findInvite(env, body.inviteCode);
  if (!inviteIsActive(invite)) return json(request, env, { error: "邀请码无效、已使用或已过期" }, 404);
  return json(request, env, {
    role: invite.role,
    roleLabel: roleLabel(invite.role),
    expiresAt: invite.expires_at,
    teamName: cleanString(env.TEAM_NAME, 100) || "本校康复评估部门"
  });
}

async function handleTeamRegister(request, env) {
  const body = await parseBody(request, 16_000);
  const invite = await findInvite(env, body.inviteCode);
  if (!inviteIsActive(invite)) return json(request, env, { error: "邀请码无效、已使用或已过期" }, 404);

  const email = normalizeEmail(body.email);
  const displayName = cleanString(body.displayName, 40);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email) return json(request, env, { error: "请输入有效的工作邮箱" }, 400);
  if (displayName.length < 2) return json(request, env, { error: "姓名或工作称呼至少填写2个字符" }, 400);
  if (password.length < 12 || password.length > 128) return json(request, env, { error: "密码需为12至128个字符" }, 400);

  const existingMember = await env.DB.prepare("SELECT user_id FROM team_members WHERE email = ?").bind(email).first();
  if (existingMember) return json(request, env, { error: "该邮箱已加入部门，请直接登录" }, 409);

  const auth = getAuth(request, env);
  const reservationId = await reserveInvite(env, invite.id);
  if (!reservationId) return json(request, env, { error: "邀请码正在被使用或已失效，请重新确认" }, 409);

  let user = await env.DB.prepare('SELECT id, email FROM "user" WHERE email = ?').bind(email).first();
  let loginResponse = null;

  if (!user) {
    try {
      const created = await auth.api.signUpEmail({ body: { email, password, name: displayName } });
      user = created?.user || null;
    } catch {
      await releaseInviteReservation(env, invite.id, reservationId);
      return json(request, env, { error: "账号创建失败，请检查邮箱和密码后重试" }, 400);
    }
  } else {
    loginResponse = await authPost(auth, request, "/api/auth/sign-in/email", { email, password, rememberMe: false });
    if (!loginResponse.ok) {
      await releaseInviteReservation(env, invite.id, reservationId);
      return json(request, env, { error: "该邮箱已有账号，输入的密码不正确" }, 409);
    }
  }
  if (!user?.id) {
    await releaseInviteReservation(env, invite.id, reservationId);
    return json(request, env, { error: "账号创建失败，请稍后重试" }, 500);
  }

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO team_members (
          user_id, email, display_name, role, status, primary_module, module_access,
          assignment_note, created_at, last_active_at
        )
        SELECT ?, ?, ?, role, 'active',
               CASE WHEN role = 'evaluator' THEN 'si' ELSE 'all' END,
               CASE WHEN role = 'evaluator' THEN 'si' ELSE 'si,ot,st,pt' END,
               CASE WHEN role = 'evaluator' THEN '新账号暂归感觉统合组，请管理员确认专业分组。' ELSE '' END,
               datetime('now'), datetime('now')
        FROM team_invites
        WHERE id = ? AND reservation_id = ? AND used_at IS NULL AND revoked_at IS NULL
      `).bind(user.id, email, displayName, invite.id, reservationId),
      env.DB.prepare(`
        INSERT INTO team_audit_logs (user_id, action, target_type, target_id, metadata_json, created_at)
        SELECT ?, 'invite.accept', 'invite', id, ?, datetime('now')
        FROM team_invites
        WHERE id = ? AND reservation_id = ? AND used_at IS NULL AND revoked_at IS NULL
      `).bind(user.id, JSON.stringify({ role: invite.role }), invite.id, reservationId),
      env.DB.prepare(`
        UPDATE team_invites
        SET used_by_user_id = ?, used_at = datetime('now'), reservation_id = NULL, reserved_at = NULL
        WHERE id = ? AND reservation_id = ? AND used_at IS NULL AND revoked_at IS NULL
      `).bind(user.id, invite.id, reservationId)
    ]);
    if (results[0]?.meta?.changes !== 1 || results[2]?.meta?.changes !== 1) {
      await releaseInviteReservation(env, invite.id, reservationId);
      return json(request, env, { error: "邀请码已被其他成员使用" }, 409);
    }
  } catch {
    await releaseInviteReservation(env, invite.id, reservationId);
    return json(request, env, { error: "该邮箱已加入部门或邀请码已被使用" }, 409);
  }

  if (!loginResponse) {
    loginResponse = await authPost(auth, request, "/api/auth/sign-in/email", { email, password, rememberMe: false });
  }
  if (!loginResponse.ok) return json(request, env, { ok: true, loginRequired: true }, 201);
  return withSecurityHeaders(request, env, loginResponse);
}

async function createTeamInvite(env, { role, createdByUserId = null }) {
  const normalizedCode = createInviteCode();
  const displayCode = formatInviteCode(normalizedCode);
  const codeHash = await sha256Hex(normalizedCode);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO team_invites (id, code_hash, code_hint, role, created_by_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, codeHash, displayCode.slice(-4), role, createdByUserId, expiresAt),
    auditStatement(env, createdByUserId, "invite.create", "invite", id, { role })
  ]);

  return { id, code: displayCode, role, roleLabel: roleLabel(role), expiresAt };
}

async function handleAdminBootstrapInvite(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const memberCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM team_members").first();
  if (Number(memberCount?.count || 0) > 0) {
    return json(request, env, { error: "团队已建立，请由团队管理员在工作台中邀请成员" }, 409);
  }
  await env.DB.prepare(`
    UPDATE team_invites SET revoked_at = datetime('now')
    WHERE created_by_user_id IS NULL AND used_at IS NULL AND revoked_at IS NULL
  `).run();
  const invite = await createTeamInvite(env, { role: "admin" });
  return json(request, env, { ok: true, invite }, 201);
}

async function handleAdminTeamRosterImport(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const body = await parseBody(request, 80_000);
  if (!Array.isArray(body.students) || !body.students.length || body.students.length > 200) {
    return json(request, env, { error: "学生名单须包含1至200人" }, 400);
  }

  await ensureTeamRosterSchema(env);
  const administrator = await env.DB.prepare(`
    SELECT user_id FROM team_members
    WHERE role = 'admin' AND status = 'active'
    ORDER BY created_at
    LIMIT 1
  `).first();
  if (!administrator?.user_id) return json(request, env, { error: "团队尚未建立管理员账号" }, 409);

  const seenCodes = new Set();
  const seenStudents = new Set();
  const students = [];
  for (let index = 0; index < body.students.length; index += 1) {
    const raw = body.students[index] && typeof body.students[index] === "object" ? body.students[index] : {};
    const studentCode = normalizeTeamStudentCode(raw.studentCode);
    const studentName = cleanString(raw.studentName, 40);
    const className = cleanString(raw.className, 40);
    const gradeName = cleanString(raw.gradeName, 30);
    const schoolYear = cleanString(raw.schoolYear, 20);
    const rosterOrder = Number(raw.rosterOrder);
    const studentKey = `${studentName}\u0000${className}\u0000${schoolYear}`;
    if (!studentCode || studentName.length < 2 || className.length < 2 || !/^\d{4}-\d{4}$/.test(schoolYear)
      || !Number.isInteger(rosterOrder) || rosterOrder < 0 || rosterOrder > 999) {
      return json(request, env, { error: `第${index + 1}名学生的姓名、班级、学年、序号或协作编号无效` }, 400);
    }
    if (seenCodes.has(studentCode) || seenStudents.has(studentKey)) {
      return json(request, env, { error: `第${index + 1}名学生与名单内其他记录重复` }, 400);
    }
    seenCodes.add(studentCode);
    seenStudents.add(studentKey);
    students.push({
      id: crypto.randomUUID(),
      studentCode,
      studentName,
      className,
      gradeName,
      schoolYear,
      rosterOrder
    });
  }

  const source = cleanString(body.source, 80) || "authorized_admin_import";
  const classNames = [...new Set(students.map((student) => student.className))];
  const statements = students.map((student) => env.DB.prepare(`
    INSERT INTO team_students (
      id, student_code, student_name, class_name, grade_name, school_year, roster_order,
      status, created_by_user_id, updated_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(student_code) DO UPDATE SET
      student_name = excluded.student_name,
      class_name = excluded.class_name,
      grade_name = excluded.grade_name,
      school_year = excluded.school_year,
      roster_order = excluded.roster_order,
      status = 'active',
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = datetime('now')
  `).bind(
    student.id, student.studentCode, student.studentName, student.className,
    student.gradeName, student.schoolYear, student.rosterOrder,
    administrator.user_id, administrator.user_id
  ));
  statements.push(auditStatement(env, administrator.user_id, "student.roster_import", "student_roster", null, {
    count: students.length,
    classes: classNames,
    schoolYear: students[0].schoolYear,
    source
  }));
  await env.DB.batch(statements);

  const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM team_students WHERE status = 'active'").first();
  const classResult = await env.DB.prepare(`
    SELECT class_name, COUNT(*) AS count
    FROM team_students
    WHERE status = 'active'
    GROUP BY class_name
    ORDER BY class_name
  `).all();
  return json(request, env, {
    ok: true,
    imported: students.length,
    activeStudents: Number(total?.count || 0),
    classes: classResult.results || []
  }, 201);
}

async function handleCreateTeamInvite(request, env) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  const body = await parseBody(request, 8_000);
  const role = cleanString(body.role, 20);
  if (!TEAM_ROLES.has(role)) return json(request, env, { error: "成员角色无效" }, 400);

  const pending = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM team_invites
    WHERE created_by_user_id = ? AND created_at >= datetime('now', '-1 day')
  `).bind(identity.member.user_id).first();
  if (Number(pending?.count || 0) >= 30) return json(request, env, { error: "今日邀请数量已达上限" }, 429);

  const invite = await createTeamInvite(env, {
    role,
    createdByUserId: identity.member.user_id
  });
  return json(request, env, { ok: true, invite }, 201);
}

async function handleTeamSession(request, env) {
  const identity = await teamIdentity(request, env, { allowPasswordChange: true });
  if (identity.denied) return identity.denied;
  return json(request, env, {
    authenticated: true,
    user: {
      id: identity.member.user_id,
      email: identity.member.email,
      displayName: identity.member.display_name,
      role: identity.member.role,
      roleLabel: roleLabel(identity.member.role),
      primaryModule: identity.member.primary_module,
      primaryModuleLabel: moduleLabel(identity.member.primary_module),
      moduleAccess: memberModules(identity.member.module_access),
      assignmentNote: identity.member.assignment_note,
      isSuperAdmin: await isSuperAdminMember(identity.member, env),
      passwordChangeRequired: Number(identity.member.password_change_required) === 1
    },
    team: {
      name: cleanString(env.TEAM_NAME, 100) || "本校康复评估部门",
      privacyMode: "restricted_roster"
    }
  });
}

async function handleTeamLogout(request, env) {
  const auth = getAuth(request, env);
  const response = await authPost(auth, request, "/api/auth/sign-out");
  return withSecurityHeaders(request, env, response);
}

async function handleChangePassword(request, env) {
  const identity = await teamIdentity(request, env, { allowPasswordChange: true });
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
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE team_members
      SET password_change_required = 0, password_changed_at = datetime('now')
      WHERE user_id = ?
    `).bind(identity.member.user_id),
    auditStatement(env, identity.member.user_id, "member.password_change", "member", identity.member.user_id)
  ]);
  return withSecurityHeaders(request, env, response);
}

function temporaryPassword() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%"];
  const randomCharacter = (alphabet) => alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length];
  const characters = groups.map(randomCharacter);
  const alphabet = groups.join("");
  while (characters.length < 18) characters.push(randomCharacter(alphabet));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.getRandomValues(new Uint8Array(1))[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

async function handleResetTeamMemberPassword(request, env, userId) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  const targetId = cleanString(userId, 80);
  if (targetId === identity.member.user_id) {
    return json(request, env, { error: "请在账号设置中修改自己的密码" }, 400);
  }
  const target = await env.DB.prepare(`
    SELECT user_id, email, display_name
    FROM team_members
    WHERE user_id = ?
  `).bind(targetId).first();
  if (!target) return json(request, env, { error: "未找到团队成员" }, 404);

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const passwordUpdate = env.DB.prepare(`
    UPDATE account
    SET password = ?, updatedAt = datetime('now')
    WHERE userId = ? AND providerId = 'credential'
  `).bind(passwordHash, targetId);
  const results = await env.DB.batch([
    passwordUpdate,
    env.DB.prepare(`
      UPDATE team_members
      SET password_change_required = 1, password_reset_at = datetime('now')
      WHERE user_id = ?
    `).bind(targetId),
    env.DB.prepare('DELETE FROM "session" WHERE "userId" = ?').bind(targetId),
    auditStatement(env, identity.member.user_id, "member.password_reset", "member", targetId)
  ]);
  if (results[0]?.meta?.changes !== 1) {
    return json(request, env, { error: "该账号没有可重置的密码凭据" }, 409);
  }
  return json(request, env, {
    ok: true,
    userId: targetId,
    displayName: target.display_name,
    email: target.email,
    temporaryPassword: password,
    passwordChangeRequired: true
  });
}

async function handleTeamSummary(request, env) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  await ensureTeamCareSchema(env);
  const isTeamAdmin = identity.member.role === "admin";
  const [metrics, studentResult, recordsResult, analysisResult, memberResult, inviteResult, auditResult, feedbackResult] = await Promise.all([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM team_students WHERE status = 'active') AS total_students,
        (SELECT COUNT(DISTINCT class_name) FROM team_students WHERE status = 'active') AS class_count,
        (SELECT COUNT(*) FROM team_students student
          WHERE student.status = 'active' AND EXISTS (
            SELECT 1 FROM team_assessments assessment
            WHERE assessment.student_code = student.student_code AND assessment.deleted_at IS NULL
          )) AS assessed_students,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL) AS total_records,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL AND date(updated_at) = date('now')) AS today_updates,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NOT NULL) AS trash_records,
        (SELECT COUNT(*) FROM team_members WHERE status = 'active') AS active_members,
        (SELECT COUNT(*) FROM team_members WHERE status = 'active' AND last_active_at >= datetime('now', '-10 minutes')) AS online_members,
        (SELECT COUNT(*) FROM team_goals WHERE status = 'active') AS active_goals,
        (SELECT COUNT(*) FROM team_goals
          WHERE status = 'active' AND date(review_date) <= date('now', '+8 hours', '+7 days')) AS due_goals,
        (SELECT COUNT(*) FROM team_intervention_logs
          WHERE date(session_date) >= date('now', '+8 hours', 'start of month')) AS intervention_month
    `).first(),
    env.DB.prepare(`
      SELECT s.id, s.student_code, s.student_name, s.class_name, s.grade_name, s.school_year,
             s.roster_order, s.created_at, s.updated_at,
             a.id AS assessment_id, a.assessment_date, a.overall_score, a.coverage,
             a.updated_at AS assessment_updated_at,
             (SELECT COUNT(*) FROM team_goals goal
               WHERE goal.student_id = s.id AND goal.status = 'active') AS active_goal_count,
             (SELECT COUNT(*) FROM team_goals goal
               WHERE goal.student_id = s.id AND goal.status = 'active'
                 AND date(goal.review_date) <= date('now', '+8 hours', '+7 days')) AS due_goal_count,
             (SELECT MAX(log.session_date) FROM team_intervention_logs log
               WHERE log.student_id = s.id) AS last_intervention_date
      FROM team_students s
      LEFT JOIN team_assessments a ON a.id = (
        SELECT latest.id
        FROM team_assessments latest
        WHERE latest.student_code = s.student_code AND latest.deleted_at IS NULL
        ORDER BY datetime(latest.updated_at) DESC
        LIMIT 1
      )
      WHERE s.status = 'active'
      ORDER BY s.school_year DESC, s.class_name, s.roster_order, s.student_name
      LIMIT 500
    `).all(),
    env.DB.prepare(`
      SELECT a.id, a.client_record_id, a.student_code, a.age_text, a.gender, a.primary_need,
             a.assessment_date, a.overall_score, a.coverage, a.version, a.created_at, a.updated_at,
             student.student_name, student.class_name,
             owner.display_name AS owner_name, updater.display_name AS updated_by_name
      FROM team_assessments a
      LEFT JOIN team_students student ON student.student_code = a.student_code AND student.status = 'active'
      LEFT JOIN team_members owner ON owner.user_id = a.owner_user_id
      LEFT JOIN team_members updater ON updater.user_id = a.updated_by_user_id
      WHERE a.deleted_at IS NULL
      ORDER BY a.updated_at DESC
      LIMIT 250
    `).all(),
    env.DB.prepare("SELECT analysis_json FROM team_assessments WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500").all(),
    isTeamAdmin
      ? env.DB.prepare(`
          SELECT user_id, email, display_name, role, status, primary_module, module_access,
                 assignment_note, password_change_required, password_changed_at,
                 password_reset_at, created_at, last_active_at
          FROM team_members
          ORDER BY status, primary_module, created_at
        `).all()
      : Promise.resolve({ results: [] }),
    isTeamAdmin
      ? env.DB.prepare(`
          SELECT id, code_hint, role, expires_at, created_at
          FROM team_invites
          WHERE used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
          ORDER BY created_at DESC LIMIT 50
        `).all()
      : Promise.resolve({ results: [] }),
    isTeamAdmin
      ? env.DB.prepare("SELECT id, user_id, action, target_type, target_id, metadata_json, created_at FROM team_audit_logs ORDER BY created_at DESC LIMIT 40").all()
      : Promise.resolve({ results: [] }),
    isTeamAdmin
      ? env.DB.prepare(`
          SELECT feedback.id, feedback.user_id, feedback.category, feedback.content,
                 feedback.page_path, feedback.status, feedback.created_at,
                 feedback.resolved_at, member.display_name AS author_name
          FROM team_feedback feedback
          LEFT JOIN team_members member ON member.user_id = feedback.user_id
          ORDER BY CASE feedback.status WHEN 'open' THEN 0 ELSE 1 END, feedback.created_at DESC
          LIMIT 200
        `).all()
      : Promise.resolve({ results: [] })
  ]);

  return json(request, env, {
    generatedAt: new Date().toISOString(),
    team: { name: cleanString(env.TEAM_NAME, 100) || "本校康复评估部门", privacyMode: "restricted_roster" },
    currentUser: {
      id: identity.member.user_id,
      email: identity.member.email,
      displayName: identity.member.display_name,
      role: identity.member.role,
      roleLabel: roleLabel(identity.member.role),
      primaryModule: identity.member.primary_module,
      primaryModuleLabel: moduleLabel(identity.member.primary_module),
      moduleAccess: memberModules(identity.member.module_access),
      assignmentNote: identity.member.assignment_note,
      isSuperAdmin: await isSuperAdminMember(identity.member, env)
    },
    metrics: metrics || {},
    students: studentResult.results || [],
    records: recordsResult.results || [],
    domainAverages: aggregateDomains(analysisResult.results || []),
    members: memberResult.results || [],
    invites: (inviteResult.results || []).map((row) => ({ ...row, roleLabel: roleLabel(row.role) })),
    audit: (auditResult.results || []).map((row) => ({ ...row, metadata: parseJson(row.metadata_json), metadata_json: undefined })),
    feedback: feedbackResult.results || [],
    privacy: {
      mode: "受限学生名单与去标识化评估分开保存",
      rosterFields: ["学生姓名", "班级", "内部协作编号"],
      excluded: ["学籍号", "联系方式", "家庭住址", "报告统筹人与复核人", "背景资料", "医疗注意事项"],
      teamOnly: ["专业模块主评人", "评估版本修改人"]
    }
  });
}

async function handleTeamRecord(request, env, id) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  await ensureTeamRosterSchema(env);
  const record = await env.DB.prepare(`
    SELECT a.id, a.client_record_id, a.student_code, a.version, a.assessment_json, a.analysis_json,
           a.created_at, a.updated_at, student.student_name, student.class_name,
           student.grade_name, student.school_year,
           owner.display_name AS owner_name, updater.display_name AS updated_by_name
    FROM team_assessments a
    LEFT JOIN team_students student ON student.student_code = a.student_code AND student.status = 'active'
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
  const assessment = parseJson(record.assessment_json);
  assessment.studentName = record.student_name || "";
  assessment.studentCode = record.student_code || assessment.studentCode || "";
  assessment.className = record.class_name || "";
  return json(request, env, {
    ...record,
    student_label: record.student_name || record.student_code,
    identity_scope: record.student_name ? "restricted_roster" : "deidentified",
    is_deidentified: record.student_name ? 0 : 1,
    assessment,
    analysis: parseJson(record.analysis_json),
    assessment_json: undefined,
    analysis_json: undefined,
    versions: versions.results || []
  });
}

function integerInRange(value, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function validSchoolYear(value) {
  const schoolYear = cleanString(value, 20);
  const match = schoolYear.match(/^(\d{4})-(\d{4})$/);
  return match && Number(match[2]) === Number(match[1]) + 1 ? schoolYear : "";
}

async function findActiveTeamStudent(env, id) {
  return env.DB.prepare(`
    SELECT id, student_code, student_name, class_name, grade_name, school_year,
           roster_order, status, created_at, updated_at
    FROM team_students
    WHERE id = ? AND status = 'active'
  `).bind(cleanString(id, 80)).first();
}

async function handleTeamStudentProfile(request, env, id) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  await ensureTeamCareSchema(env);
  const student = await findActiveTeamStudent(env, id);
  if (!student) return json(request, env, { error: "未找到在册学生" }, 404);

  const [assessmentResult, versionResult, goalResult, interventionResult] = await Promise.all([
    env.DB.prepare(`
      SELECT id, client_record_id, student_code, age_text, gender, primary_need,
             assessment_date, overall_score, coverage, version, assessment_json,
             analysis_json, created_at, updated_at
      FROM team_assessments
      WHERE student_code = ? AND deleted_at IS NULL
      ORDER BY date(assessment_date) DESC, datetime(updated_at) DESC
      LIMIT 60
    `).bind(student.student_code).all(),
    env.DB.prepare(`
      SELECT v.assessment_id, v.version, v.assessment_json, v.analysis_json, v.created_at,
             member.display_name AS changed_by_name
      FROM team_assessment_versions v
      JOIN team_assessments assessment ON assessment.id = v.assessment_id
      LEFT JOIN team_members member ON member.user_id = v.changed_by_user_id
      WHERE assessment.student_code = ? AND assessment.deleted_at IS NULL
      ORDER BY datetime(v.created_at), v.version
      LIMIT 160
    `).bind(student.student_code).all(),
    env.DB.prepare(`
      SELECT goal.*, creator.display_name AS created_by_name, updater.display_name AS updated_by_name
      FROM team_goals goal
      LEFT JOIN team_members creator ON creator.user_id = goal.created_by_user_id
      LEFT JOIN team_members updater ON updater.user_id = goal.updated_by_user_id
      WHERE goal.student_id = ? AND goal.status != 'archived'
      ORDER BY CASE goal.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
               date(goal.review_date), goal.priority, datetime(goal.updated_at) DESC
      LIMIT 100
    `).bind(student.id).all(),
    env.DB.prepare(`
      SELECT log.*, goal.title AS goal_title, member.display_name AS created_by_name
      FROM team_intervention_logs log
      LEFT JOIN team_goals goal ON goal.id = log.goal_id
      LEFT JOIN team_members member ON member.user_id = log.created_by_user_id
      WHERE log.student_id = ?
      ORDER BY date(log.session_date) DESC, datetime(log.created_at) DESC
      LIMIT 160
    `).bind(student.id).all()
  ]);

  const assessments = (assessmentResult.results || []).map((row) => ({
    ...row,
    assessment: {
      ...parseJson(row.assessment_json),
      studentName: student.student_name,
      studentCode: student.student_code,
      className: student.class_name
    },
    analysis: parseJson(row.analysis_json),
    assessment_json: undefined,
    analysis_json: undefined
  }));
  const rawAssessmentPoints = (versionResult.results || []).map((row) => {
    const assessment = parseJson(row.assessment_json);
    const analysis = parseJson(row.analysis_json);
    const domains = Object.fromEntries(Object.entries(analysis.domainScores || {}).map(([domainId, domain]) => [domainId, {
      title: cleanString(domain?.title || domainId, 100),
      score: Number(domain?.score) || 0
    }]));
    return {
      assessmentId: row.assessment_id,
      version: Number(row.version) || 1,
      assessmentDate: cleanDate(assessment.assessmentDate) || String(row.created_at || "").slice(0, 10),
      score: analysis.average == null ? null : Number(analysis.average),
      coverage: Number(analysis.coverage) || 0,
      domains,
      changedByName: row.changed_by_name || "",
      createdAt: row.created_at
    };
  });
  const assessmentPointMap = new Map();
  rawAssessmentPoints.forEach((point) => assessmentPointMap.set(`${point.assessmentId}:${point.assessmentDate}`, point));
  const assessmentPoints = [...assessmentPointMap.values()].sort((left, right) => String(left.assessmentDate).localeCompare(String(right.assessmentDate)) || Number(left.version) - Number(right.version));
  const goals = goalResult.results || [];
  const interventions = interventionResult.results || [];
  const today = shanghaiDate();
  const reminderLimit = shanghaiDate(7);
  const reminders = goals
    .filter((goal) => goal.status === "active" && goal.review_date <= reminderLimit)
    .map((goal) => ({
      goalId: goal.id,
      title: goal.title,
      reviewDate: goal.review_date,
      status: goal.review_date < today ? "overdue" : goal.review_date === today ? "today" : "upcoming"
    }));

  await auditStatement(env, identity.member.user_id, "student.profile_view", "student", student.id).run();
  return json(request, env, {
    generatedAt: new Date().toISOString(),
    student,
    currentUser: {
      id: identity.member.user_id,
      displayName: identity.member.display_name,
      role: identity.member.role,
      roleLabel: roleLabel(identity.member.role)
    },
    capabilities: {
      canEdit: ["admin", "evaluator"].includes(identity.member.role),
      canManageRoster: identity.member.role === "admin"
    },
    metrics: {
      assessmentCount: assessmentPoints.length || assessments.length,
      activeGoalCount: goals.filter((goal) => goal.status === "active").length,
      dueGoalCount: reminders.length,
      interventionCount: interventions.length,
      interventionMinutes: interventions.reduce((sum, row) => sum + (Number(row.duration_minutes) || 0), 0),
      lastInterventionDate: interventions[0]?.session_date || ""
    },
    latestAssessment: assessments[0] || null,
    assessments,
    assessmentPoints,
    goals,
    interventions,
    reminders
  });
}

async function handleUpsertTeamStudent(request, env) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  await ensureTeamCareSchema(env);
  const body = await parseBody(request, 16_000);
  const id = cleanString(body.id, 80);
  const studentCode = normalizeTeamStudentCode(body.studentCode);
  const studentName = cleanString(body.studentName, 40);
  const className = cleanString(body.className, 40);
  const gradeName = cleanString(body.gradeName, 30);
  const schoolYear = validSchoolYear(body.schoolYear);
  const rosterOrder = integerInRange(body.rosterOrder, 0, 999);
  if (!studentCode || studentName.length < 2 || className.length < 2 || !schoolYear || rosterOrder === null) {
    return json(request, env, { error: "请完整填写姓名、班级、连续学年、序号和同时含字母数字的协作编号" }, 400);
  }

  const duplicate = await env.DB.prepare(`
    SELECT id FROM team_students
    WHERE (student_code = ? OR (student_name = ? AND class_name = ? AND school_year = ?))
      AND (? = '' OR id != ?)
    LIMIT 1
  `).bind(studentCode, studentName, className, schoolYear, id, id).first();
  if (duplicate) return json(request, env, { error: "协作编号重复，或同一学年班级中已有同名学生" }, 409);

  if (id) {
    const existing = await findActiveTeamStudent(env, id);
    if (!existing) return json(request, env, { error: "未找到在册学生" }, 404);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE team_students
        SET student_code = ?, student_name = ?, class_name = ?, grade_name = ?, school_year = ?,
            roster_order = ?, updated_by_user_id = ?, updated_at = datetime('now')
        WHERE id = ? AND status = 'active'
      `).bind(studentCode, studentName, className, gradeName, schoolYear, rosterOrder, identity.member.user_id, id),
      env.DB.prepare("UPDATE team_assessments SET student_code = ? WHERE student_code = ?").bind(studentCode, existing.student_code),
      auditStatement(env, identity.member.user_id, "student.update", "student", id, {
        changedCode: studentCode !== existing.student_code,
        changedClass: className !== existing.class_name,
        changedSchoolYear: schoolYear !== existing.school_year
      })
    ]);
    return json(request, env, { ok: true, id, updated: true });
  }

  const studentId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO team_students (
        id, student_code, student_name, class_name, grade_name, school_year, roster_order,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))
    `).bind(studentId, studentCode, studentName, className, gradeName, schoolYear, rosterOrder, identity.member.user_id, identity.member.user_id),
    auditStatement(env, identity.member.user_id, "student.create", "student", studentId)
  ]);
  return json(request, env, { ok: true, id: studentId, created: true }, 201);
}

async function handleArchiveTeamStudent(request, env, id) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  await ensureTeamCareSchema(env);
  const student = await findActiveTeamStudent(env, id);
  if (!student) return json(request, env, { error: "未找到在册学生" }, 404);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE team_students
      SET status = 'archived', updated_by_user_id = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'active'
    `).bind(identity.member.user_id, student.id),
    env.DB.prepare(`
      UPDATE team_goals
      SET status = 'paused', updated_by_user_id = ?, updated_at = datetime('now')
      WHERE student_id = ? AND status = 'active'
    `).bind(identity.member.user_id, student.id),
    auditStatement(env, identity.member.user_id, "student.archive", "student", student.id)
  ]);
  return json(request, env, { ok: true });
}

function normalizeGoalInput(body, student) {
  const identityValues = [student.student_name, student.class_name];
  const title = scrubSensitiveText(body.title, identityValues).slice(0, 100);
  const successCriteria = scrubSensitiveText(body.successCriteria, identityValues).slice(0, 600);
  const baselineLevel = integerInRange(body.baselineLevel, 1, 5);
  const targetLevel = integerInRange(body.targetLevel, 1, 5);
  let progress = integerInRange(body.progress ?? 0, 0, 100);
  const priority = cleanString(body.priority, 20);
  const status = cleanString(body.status || "active", 20);
  const startDate = cleanDate(body.startDate);
  const reviewDate = cleanDate(body.reviewDate);
  if (title.length < 2 || successCriteria.length < 2 || baselineLevel === null || targetLevel === null
    || progress === null || !GOAL_PRIORITIES.has(priority) || !GOAL_STATUSES.has(status)
    || !startDate || !reviewDate || targetLevel < baselineLevel || reviewDate < startDate) return null;
  if (status === "achieved") progress = 100;
  return { title, successCriteria, baselineLevel, targetLevel, progress, priority, status, startDate, reviewDate };
}

async function handleCreateTeamGoal(request, env, studentId) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin", "evaluator"]);
  if (denied) return denied;
  await ensureTeamCareSchema(env);
  const student = await findActiveTeamStudent(env, studentId);
  if (!student) return json(request, env, { error: "未找到在册学生" }, 404);
  const body = await parseBody(request, 16_000);
  const goal = normalizeGoalInput(body, student);
  if (!goal) return json(request, env, { error: "请完整填写目标、达成标准、1至5级基线与目标、进度和有效复核日期" }, 400);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO team_goals (
        id, student_id, title, success_criteria, baseline_level, target_level, progress,
        priority, status, start_date, review_date, created_by_user_id, updated_by_user_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, student.id, goal.title, goal.successCriteria, goal.baselineLevel, goal.targetLevel,
      goal.progress, goal.priority, goal.status, goal.startDate, goal.reviewDate,
      identity.member.user_id, identity.member.user_id),
    auditStatement(env, identity.member.user_id, "goal.create", "goal", id, {
      studentId: student.id, priority: goal.priority, reviewDate: goal.reviewDate
    })
  ]);
  return json(request, env, { ok: true, id }, 201);
}

async function handleUpdateTeamGoal(request, env, id) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin", "evaluator"]);
  if (denied) return denied;
  await ensureTeamCareSchema(env);
  const existing = await env.DB.prepare(`
    SELECT goal.id, goal.student_id, student.student_name, student.class_name, student.status AS student_status
    FROM team_goals goal
    JOIN team_students student ON student.id = goal.student_id
    WHERE goal.id = ?
  `).bind(cleanString(id, 80)).first();
  if (!existing || existing.student_status !== "active") return json(request, env, { error: "未找到可编辑的康复目标" }, 404);
  const body = await parseBody(request, 16_000);
  const goal = normalizeGoalInput(body, existing);
  if (!goal) return json(request, env, { error: "请完整填写目标、达成标准、1至5级基线与目标、进度和有效复核日期" }, 400);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE team_goals
      SET title = ?, success_criteria = ?, baseline_level = ?, target_level = ?, progress = ?,
          priority = ?, status = ?, start_date = ?, review_date = ?, updated_by_user_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(goal.title, goal.successCriteria, goal.baselineLevel, goal.targetLevel, goal.progress,
      goal.priority, goal.status, goal.startDate, goal.reviewDate, identity.member.user_id, existing.id),
    auditStatement(env, identity.member.user_id, "goal.update", "goal", existing.id, {
      studentId: existing.student_id, status: goal.status, progress: goal.progress, reviewDate: goal.reviewDate
    })
  ]);
  return json(request, env, { ok: true });
}

async function handleCreateIntervention(request, env, studentId) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin", "evaluator"]);
  if (denied) return denied;
  await ensureTeamCareSchema(env);
  const student = await findActiveTeamStudent(env, studentId);
  if (!student) return json(request, env, { error: "未找到在册学生" }, 404);
  const body = await parseBody(request, 16_000);
  const sessionDate = cleanDate(body.sessionDate);
  const durationMinutes = integerInRange(body.durationMinutes, 1, 480);
  const setting = cleanString(body.setting, 30);
  const observerType = cleanString(body.observerType, 30);
  const supportLevel = integerInRange(body.supportLevel, 1, 5);
  const responseLevel = cleanString(body.responseLevel, 30);
  const goalId = cleanString(body.goalId, 80);
  const identityValues = [student.student_name, student.class_name];
  const note = scrubSensitiveText(body.note, identityValues).slice(0, 800);
  const nextStep = scrubSensitiveText(body.nextStep, identityValues).slice(0, 600);
  const today = shanghaiDate();
  if (!sessionDate || sessionDate > today || durationMinutes === null || !INTERVENTION_SETTINGS.has(setting)
    || !OBSERVER_TYPES.has(observerType) || supportLevel === null || !RESPONSE_LEVELS.has(responseLevel)
    || note.length < 2) {
    return json(request, env, { error: "请完整填写干预日期、时长、情境、资料来源、支持等级、反应表现和客观记录" }, 400);
  }
  if (goalId) {
    const linkedGoal = await env.DB.prepare("SELECT id FROM team_goals WHERE id = ? AND student_id = ? AND status != 'archived'")
      .bind(goalId, student.id).first();
    if (!linkedGoal) return json(request, env, { error: "所选康复目标与当前学生不匹配" }, 400);
  }
  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM team_audit_logs
    WHERE user_id = ? AND action = 'intervention.create' AND created_at >= datetime('now', '-1 day')
  `).bind(identity.member.user_id).first();
  if (Number(recent?.count || 0) >= 200) return json(request, env, { error: "今日干预记录数量已达上限" }, 429);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO team_intervention_logs (
        id, student_id, goal_id, session_date, duration_minutes, setting, observer_type,
        support_level, response_level, note, next_step, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, student.id, goalId || null, sessionDate, durationMinutes, setting, observerType,
      supportLevel, responseLevel, note, nextStep, identity.member.user_id),
    auditStatement(env, identity.member.user_id, "intervention.create", "intervention", id, {
      studentId: student.id, goalLinked: Boolean(goalId), sessionDate, observerType
    })
  ]);
  return json(request, env, { ok: true, id }, 201);
}

async function handleDeleteIntervention(request, env, id) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin", "evaluator"]);
  if (denied) return denied;
  await ensureTeamCareSchema(env);
  const targetId = cleanString(id, 80);
  const existing = await env.DB.prepare("SELECT id, student_id, session_date FROM team_intervention_logs WHERE id = ?").bind(targetId).first();
  if (!existing) return json(request, env, { error: "未找到干预记录" }, 404);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM team_intervention_logs WHERE id = ?").bind(targetId),
    auditStatement(env, identity.member.user_id, "intervention.delete", "intervention", targetId, {
      studentId: existing.student_id, sessionDate: existing.session_date
    })
  ]);
  return json(request, env, { ok: true });
}

async function handleAdminCareBootstrap(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  await ensureTeamCareSchema(env);
  return json(request, env, { ok: true, schema: "student_care_cycle", ready: true });
}

async function handleTeamAssessment(request, env) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin", "evaluator"]);
  if (denied) return denied;
  const body = await parseBody(request);
  if (body.consent !== true) return json(request, env, { error: "请先确认已获得去标识化云协作授权" }, 400);
  const activeModule = cleanString(body.module, 10);
  if (!PROFESSIONAL_MODULE_SET.has(activeModule)) {
    return json(request, env, { error: "缺少当前评估专业模块" }, 400);
  }
  if (identity.member.role !== "admin" && !memberModules(identity.member.module_access).includes(activeModule)) {
    return json(request, env, { error: `当前账号未获授权填写${moduleLabel(activeModule)}` }, 403);
  }

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
  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM team_audit_logs
    WHERE user_id = ? AND action = 'assessment.sync' AND created_at >= datetime('now', '-1 hour')
  `).bind(identity.member.user_id).first();
  if (Number(recent?.count || 0) >= 100) return json(request, env, { error: "同步过于频繁，请稍后再试" }, 429);

  let existing = await env.DB.prepare(`
    SELECT id, client_record_id, version, owner_user_id, updated_by_user_id,
           deleted_at, assessment_json, analysis_json
    FROM team_assessments WHERE client_record_id = ?
  `).bind(clientRecordId).first();
  if (!existing) {
    existing = await env.DB.prepare(`
      SELECT id, client_record_id, version, owner_user_id, updated_by_user_id,
             deleted_at, assessment_json, analysis_json
      FROM team_assessments
      WHERE student_code = ? AND deleted_at IS NULL
      ORDER BY datetime(updated_at) DESC
      LIMIT 1
    `).bind(record.studentCode).first();
  }
  if (existing?.deleted_at) return json(request, env, { error: "该团队档案已被管理员删除，不能通过自动同步恢复" }, 409);
  const existingRecord = parseJson(existing?.assessment_json, {});
  const existingAnalysis = parseJson(existing?.analysis_json, {});
  const previousAssessor = existingRecord.professionalAssessors?.[activeModule] || {};
  const contributors = Array.from(new Set([
    ...(Array.isArray(previousAssessor.contributors) ? previousAssessor.contributors : []),
    previousAssessor.evaluator,
    identity.member.display_name
  ].map((value) => cleanString(value, 80)).filter(Boolean)));
  const reviewRequired = Boolean(existing && previousAssessor.evaluator && previousAssessor.evaluator !== identity.member.display_name);
  const moduleDomains = Object.fromEntries(Object.entries(record.domains)
    .filter(([, domain]) => domain?.professional === activeModule));
  const mergedRecord = {
    ...existingRecord,
    ...record,
    professionalAssessors: {
      ...(existingRecord.professionalAssessors || {}),
      [activeModule]: {
        evaluator: identity.member.display_name,
        assessmentDate: record.assessmentDate,
        contributors,
        lastUpdatedAt: new Date().toISOString()
      }
    },
    domains: { ...(existingRecord.domains || {}), ...moduleDomains }
  };
  const moduleDomainScores = Object.fromEntries(Object.entries(analysis.domainScores || {})
    .filter(([, domain]) => domain?.professional === activeModule));
  const mergedAnalysis = {
    ...existingAnalysis,
    ...analysis,
    domainScores: { ...(existingAnalysis.domainScores || {}), ...moduleDomainScores },
    moduleReadiness: {
      ...(existingAnalysis.moduleReadiness || {}),
      ...(analysis.moduleReadiness?.[activeModule] ? { [activeModule]: analysis.moduleReadiness[activeModule] } : {})
    }
  };
  const assessmentId = existing?.id || crypto.randomUUID();
  const canonicalClientRecordId = existing?.client_record_id || clientRecordId;
  const version = Number(existing?.version || 0) + 1;
  const assessmentJson = JSON.stringify(mergedRecord);
  const analysisJson = JSON.stringify(mergedAnalysis);
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
      assessmentId, canonicalClientRecordId, record.studentCode, record.age, record.gender,
      record.primaryNeed, record.assessmentDate, analysis.average, analysis.coverage,
      assessmentJson, analysisJson, existing?.owner_user_id || identity.member.user_id,
      identity.member.user_id, version
    ),
    env.DB.prepare(`
      INSERT INTO team_assessment_versions (
        id, assessment_id, version, assessment_json, analysis_json, changed_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(crypto.randomUUID(), assessmentId, version, assessmentJson, analysisJson, identity.member.user_id),
    auditStatement(env, identity.member.user_id, "assessment.sync", "assessment", assessmentId, {
      version,
      module: activeModule,
      reviewRequired,
      previousEvaluator: reviewRequired ? previousAssessor.evaluator : ""
    })
  ];
  await env.DB.batch(statements);
  return json(request, env, {
    ok: true,
    assessmentId,
    clientRecordId: canonicalClientRecordId,
    version,
    module: activeModule,
    contributors,
    reviewRequired,
    reviewMessage: reviewRequired
      ? `${previousAssessor.evaluator}此前已填写本专业内容；本次已保留为新版本，请团队复核差异。`
      : "",
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
  const target = await env.DB.prepare("SELECT user_id, role, status, primary_module FROM team_members WHERE user_id = ?").bind(targetId).first();
  if (!target) return json(request, env, { error: "未找到团队成员" }, 404);

  const requestedModule = cleanString(body.primaryModule, 10);
  const primaryModule = role === "admin" || role === "viewer"
    ? "all"
    : PROFESSIONAL_MODULE_SET.has(requestedModule)
      ? requestedModule
      : PROFESSIONAL_MODULE_SET.has(target.primary_module) ? target.primary_module : "si";
  const moduleAccess = role !== "evaluator"
    ? "si,ot,st,pt"
    : primaryModule === "pt" ? "pt,ot" : primaryModule;
  const assignmentNote = role !== "evaluator"
    ? ""
    : primaryModule === "pt"
      ? "运动功能主评；仅评估有肢体运动障碍或移动功能需要的学生，完成后协助OT组。"
      : `${moduleLabel(primaryModule)}主评。`;

  const statements = [
    env.DB.prepare(`
      UPDATE team_members
      SET role = ?, status = ?, primary_module = ?, module_access = ?, assignment_note = ?
      WHERE user_id = ?
    `).bind(role, status, primaryModule, moduleAccess, assignmentNote, targetId),
    auditStatement(env, identity.member.user_id, "member.update", "member", targetId, {
      role, status, primaryModule, moduleAccess
    })
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
  await auditStatement(env, identity.member.user_id, "assessment.trash", "assessment", targetId, {
    retentionDays: TRASH_RETENTION_DAYS
  }).run();
  return json(request, env, { ok: true, status: "trashed", retentionDays: TRASH_RETENTION_DAYS });
}

async function handleTeamFeedback(request, env) {
  const identity = await teamIdentity(request, env);
  if (identity.denied) return identity.denied;
  const body = await parseBody(request, 12_000);
  const category = cleanString(body.category, 30);
  const content = cleanString(body.content, 2_000);
  const pagePath = cleanString(body.pagePath, 160) || "/";
  if (!FEEDBACK_CATEGORIES.has(category)) return json(request, env, { error: "请选择反馈类型" }, 400);
  if (content.length < 5) return json(request, env, { error: "请至少填写5个字的反馈内容" }, 400);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO team_feedback (id, user_id, category, content, page_path, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))
    `).bind(id, identity.member.user_id, category, content, pagePath),
    auditStatement(env, identity.member.user_id, "feedback.create", "feedback", id, { category })
  ]);
  return json(request, env, { ok: true, id, status: "open" }, 201);
}

async function handleResolveTeamFeedback(request, env, id) {
  const identity = await teamIdentity(request, env);
  const denied = requireRole(request, env, identity, ["admin"]);
  if (denied) return denied;
  const targetId = cleanString(id, 80);
  const body = await parseBody(request, 4_000);
  const status = body.status === "open" ? "open" : "resolved";
  const result = await env.DB.prepare(`
    UPDATE team_feedback
    SET status = ?, resolved_by_user_id = ?,
        resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(status, status === "resolved" ? identity.member.user_id : null, status, targetId).run();
  if (!result.meta?.changes) return json(request, env, { error: "未找到反馈" }, 404);
  await auditStatement(env, identity.member.user_id, "feedback.update", "feedback", targetId, { status }).run();
  return json(request, env, { ok: true, status });
}

async function handleAdminResolveFeedback(request, env, id) {
  const denied = await requireSuperAdmin(request, env);
  if (denied) return denied;
  const targetId = cleanString(id, 80);
  const body = await parseBody(request, 4_000);
  const status = body.status === "open" ? "open" : "resolved";
  const result = await env.DB.prepare(`
    UPDATE team_feedback
    SET status = ?, resolved_by_user_id = NULL,
        resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(status, status, targetId).run();
  if (!result.meta?.changes) return json(request, env, { error: "未找到反馈" }, 404);
  return json(request, env, { ok: true, status });
}

async function handleVisit(request, env, heartbeatOnly = false) {
  const body = await parseBody(request);
  const sessionId = validSessionId(body.sessionId);
  if (!sessionId) return json(request, env, { error: "无效的匿名会话" }, 400);
  const path = cleanString(body.path, 160) || "/";
  const deviceType = ["desktop", "tablet", "mobile"].includes(body.deviceType) ? body.deviceType : "unknown";
  const countryCode = cleanString(request.cf?.country, 8);
  const regionName = cleanString(request.cf?.region, 80);
  const cityName = cleanString(request.cf?.city, 80);

  const statements = [
    env.DB.prepare(`
      INSERT INTO visitor_sessions (
        session_id, first_seen, last_seen, entry_path, device_type,
        country_code, region_name, city_name
      )
      VALUES (?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        last_seen = datetime('now'),
        device_type = excluded.device_type,
        country_code = excluded.country_code,
        region_name = excluded.region_name,
        city_name = excluded.city_name
    `).bind(sessionId, path, deviceType, countryCode, regionName, cityName)
  ];

  if (!heartbeatOnly) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO page_views (
          session_id, path, device_type, country_code, region_name, city_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(sessionId, path, deviceType, countryCode, regionName, cityName)
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
  const denied = await requireSuperAdmin(request, env);
  if (denied) return denied;

  const [metrics, trafficResult, recordResult, analysisResult, deviceResult, regionResult, pathResult, feedbackResult] = await Promise.all([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM page_views) AS total_views,
        (SELECT COUNT(DISTINCT session_id) FROM page_views) AS total_sessions,
        (SELECT COUNT(*) FROM page_views WHERE date(created_at) = date('now')) AS today_views,
        (SELECT COUNT(DISTINCT session_id) FROM page_views WHERE date(created_at) = date('now')) AS today_sessions,
        (SELECT COUNT(*) FROM visitor_sessions WHERE last_seen >= datetime('now', '-2 minutes')) AS active_now,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL) AS total_assessments,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL AND date(updated_at) = date('now')) AS today_assessments,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NOT NULL) AS trash_records,
        (SELECT COUNT(*) FROM team_members WHERE status = 'active') AS team_member_count,
        (SELECT COUNT(*) FROM team_assessments WHERE deleted_at IS NULL) AS team_record_count,
        (SELECT COUNT(*) FROM team_feedback WHERE status = 'open') AS open_feedback_count
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
      SELECT assessment.id, assessment.student_code, assessment.age_text, assessment.gender,
             assessment.primary_need, assessment.assessment_date, assessment.overall_score,
             assessment.coverage, assessment.version, assessment.assessment_json,
             assessment.created_at, assessment.updated_at,
             student.student_name, student.class_name,
             updater.display_name AS updated_by_name
      FROM team_assessments assessment
      LEFT JOIN team_students student
        ON student.student_code = assessment.student_code AND student.status = 'active'
      LEFT JOIN team_members updater ON updater.user_id = assessment.updated_by_user_id
      WHERE assessment.deleted_at IS NULL
      ORDER BY assessment.updated_at DESC
      LIMIT 100
    `).all(),
    env.DB.prepare(`
      SELECT analysis_json
      FROM team_assessments
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 500
    `).all(),
    env.DB.prepare(`
      SELECT device_type AS label, COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
      FROM page_views
      GROUP BY device_type
      ORDER BY views DESC
    `).all(),
    env.DB.prepare(`
      SELECT COALESCE(NULLIF(city_name, ''), NULLIF(region_name, ''), NULLIF(country_code, ''), '未知地区') AS label,
             COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
      FROM page_views
      GROUP BY label
      ORDER BY sessions DESC, views DESC
      LIMIT 12
    `).all(),
    env.DB.prepare(`
      SELECT path AS label, COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
      FROM page_views
      GROUP BY path
      ORDER BY views DESC
      LIMIT 12
    `).all(),
    env.DB.prepare(`
      SELECT feedback.id, feedback.category, feedback.content, feedback.page_path,
             feedback.status, feedback.created_at, feedback.resolved_at,
             member.display_name AS author_name
      FROM team_feedback feedback
      LEFT JOIN team_members member ON member.user_id = feedback.user_id
      ORDER BY CASE feedback.status WHEN 'open' THEN 0 ELSE 1 END, feedback.created_at DESC
      LIMIT 100
    `).all()
  ]);

  const records = (recordResult.results || []).map((row) => {
    const assessment = parseJson(row.assessment_json, {});
    return {
      id: row.id,
      student_label: row.student_name || row.student_code,
      student_code: row.student_code,
      is_deidentified: 1,
      age_text: row.age_text,
      gender: row.gender,
      class_name: row.class_name || "",
      primary_need: row.primary_need,
      assessment_date: row.assessment_date,
      evaluator: assessment.professionalAssessors?.[assessment.activeModule]?.evaluator || row.updated_by_name || "",
      setting: assessment.setting || "",
      overall_score: row.overall_score,
      coverage: row.coverage,
      version: row.version,
      updated_by_name: row.updated_by_name,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  });

  return json(request, env, {
    generatedAt: new Date().toISOString(),
    metrics: metrics || {},
    traffic: trafficResult.results || [],
    devices: deviceResult.results || [],
    regions: regionResult.results || [],
    paths: pathResult.results || [],
    feedback: feedbackResult.results || [],
    domainAverages: aggregateDomains(analysisResult.results || []),
    records,
    privacy: {
      visitorData: "仅记录匿名会话、访问时间、页面、设备类别和Cloudflare粗粒度地区，不保存IP地址",
      assessmentData: "仅包含本部门登录成员自动同步的去标识化评估记录"
    }
  });
}

async function handleAdminRecord(request, env, id) {
  const denied = await requireSuperAdmin(request, env);
  if (denied) return denied;
  const record = await env.DB.prepare(`
    SELECT assessment.id, assessment.student_code, assessment.assessment_json,
           assessment.analysis_json, assessment.created_at, assessment.updated_at,
           student.student_name, student.class_name
    FROM team_assessments assessment
    LEFT JOIN team_students student ON student.student_code = assessment.student_code
    WHERE assessment.id = ? AND assessment.deleted_at IS NULL
  `).bind(cleanString(id, 80)).first();
  if (!record) return json(request, env, { error: "未找到评估记录" }, 404);
  return json(request, env, {
    ...record,
    student_label: record.student_name || record.student_code,
    is_deidentified: 1,
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
  const denied = await requireSuperAdmin(request, env);
  if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT assessment.student_code, assessment.age_text, assessment.gender,
           assessment.primary_need, assessment.assessment_date, assessment.overall_score,
           assessment.coverage, assessment.assessment_json, assessment.analysis_json,
           assessment.created_at, assessment.updated_at,
           student.student_name, student.class_name
    FROM team_assessments assessment
    LEFT JOIN team_students student ON student.student_code = assessment.student_code
    WHERE assessment.deleted_at IS NULL
    ORDER BY assessment.updated_at DESC
  `).all();
  const header = ["学生标识", "学生编号", "去标识化", "年龄", "性别", "班级", "机构/学校", "主要发展需要", "评估日期", "报告统筹人", "复核人", "情境", "功能观察均分", "完成度", "SI主评人", "OT主评人", "ST主评人", "PT主评人", "个训课建议", "首次同步", "最后更新"];
  const rows = (result.results || []).map((row) => {
    const assessment = JSON.parse(row.assessment_json || "{}");
    const analysis = JSON.parse(row.analysis_json || "{}");
    return [
      row.student_name || row.student_code, row.student_code, "是",
      row.age_text, row.gender, row.class_name, assessment.organizationName, row.primary_need, row.assessment_date,
      assessment.evaluator, assessment.reviewer, assessment.setting, row.overall_score, `${row.coverage}%`,
      assessment.professionalAssessors?.si?.evaluator, assessment.professionalAssessors?.ot?.evaluator,
      assessment.professionalAssessors?.st?.evaluator, assessment.professionalAssessors?.pt?.evaluator,
      (analysis.courseRecommendations || []).map((item) => `${item.priorityLabel || "建议"}：${item.title}`).join("；"),
      row.created_at, row.updated_at
    ];
  });
  const csv = "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: responseHeaders(request, env, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="student-functional-assessment-${new Date().toISOString().slice(0, 10)}.csv"`
    })
  });
}

async function handleAdminTrash(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const result = await env.DB.prepare(`
    SELECT assessment.id, assessment.student_code, assessment.primary_need,
           assessment.assessment_date, assessment.overall_score, assessment.coverage,
           assessment.version, assessment.created_at, assessment.deleted_at,
           student.student_name, student.class_name,
           deleter.display_name AS deleted_by_name,
           (SELECT COUNT(*) FROM team_assessment_versions version
             WHERE version.assessment_id = assessment.id) AS version_count
    FROM team_assessments assessment
    LEFT JOIN team_students student
      ON student.student_code = assessment.student_code AND student.status = 'active'
    LEFT JOIN team_members deleter ON deleter.user_id = assessment.deleted_by_user_id
    WHERE assessment.deleted_at IS NOT NULL
    ORDER BY datetime(assessment.deleted_at) DESC
    LIMIT 250
  `).all();
  return json(request, env, {
    retentionDays: TRASH_RETENTION_DAYS,
    records: (result.results || []).map((row) => trashRetention({
      ...row,
      student_label: row.student_name || row.student_code
    }))
  });
}

async function handleDeleteRecord(request, env, id) {
  const denied = await requireSuperAdmin(request, env);
  if (denied) return denied;
  const actorId = await signedInAdminUserId(request, env);
  const targetId = cleanString(id, 80);
  const result = await env.DB.prepare(`
    UPDATE team_assessments
    SET deleted_at = datetime('now'), deleted_by_user_id = ?, updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).bind(actorId, targetId).run();
  if (!result.meta?.changes) return json(request, env, { error: "未找到评估记录" }, 404);
  await auditStatement(env, actorId, "assessment.trash", "assessment", targetId, {
    retentionDays: TRASH_RETENTION_DAYS
  }).run();
  return json(request, env, { ok: true, status: "trashed", retentionDays: TRASH_RETENTION_DAYS });
}

async function handleRestoreRecord(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const actorId = await signedInAdminUserId(request, env);
  const targetId = cleanString(id, 80);
  const result = await env.DB.prepare(`
    UPDATE team_assessments
    SET deleted_at = NULL, deleted_by_user_id = NULL, updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NOT NULL
      AND datetime(deleted_at) > datetime('now', '-${TRASH_RETENTION_DAYS} days')
  `).bind(targetId).run();
  if (!result.meta?.changes) return json(request, env, { error: "记录不存在或已超过30天保留期" }, 404);
  await auditStatement(env, actorId, "assessment.restore", "assessment", targetId).run();
  return json(request, env, { ok: true, status: "active" });
}

async function handlePermanentlyDeleteRecord(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const actorId = await signedInAdminUserId(request, env);
  const targetId = cleanString(id, 80);
  const target = await env.DB.prepare(`
    SELECT id, student_code, deleted_at
    FROM team_assessments
    WHERE id = ? AND deleted_at IS NOT NULL
  `).bind(targetId).first();
  if (!target) return json(request, env, { error: "回收站中未找到该评估报告" }, 404);
  const results = await env.DB.batch([
    auditStatement(env, actorId, "assessment.purge", "assessment", targetId, {
      studentCode: target.student_code,
      deletedAt: target.deleted_at
    }),
    env.DB.prepare("DELETE FROM team_assessment_versions WHERE assessment_id = ?").bind(targetId),
    env.DB.prepare("DELETE FROM team_assessments WHERE id = ? AND deleted_at IS NOT NULL").bind(targetId)
  ]);
  if (!results[2]?.meta?.changes) return json(request, env, { error: "永久删除未完成，请刷新后重试" }, 409);
  return json(request, env, { ok: true, status: "purged" });
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
    await maintainAssessmentTrash(path, env);
    if (path === "/api/team/login") return handleTeamLogin(request, env);
    if (path === "/api/team/invite-code") return handleInviteInfo(request, env);
    if (path === "/api/team/register") return handleTeamRegister(request, env);
    if (path === "/api/team/logout") return handleTeamLogout(request, env);
    if (path === "/api/team/change-password") return handleChangePassword(request, env);
    if (path === "/api/team/assessments") return handleTeamAssessment(request, env);
    if (path === "/api/team/feedback") return handleTeamFeedback(request, env);
    if (path === "/api/team/invites") return handleCreateTeamInvite(request, env);
    if (path === "/api/team/students") return handleUpsertTeamStudent(request, env);
    const studentGoal = path.match(/^\/api\/team\/students\/([^/]+)\/goals$/);
    if (studentGoal) return handleCreateTeamGoal(request, env, studentGoal[1]);
    const studentIntervention = path.match(/^\/api\/team\/students\/([^/]+)\/interventions$/);
    if (studentIntervention) return handleCreateIntervention(request, env, studentIntervention[1]);
    const teamGoal = path.match(/^\/api\/team\/goals\/([^/]+)$/);
    if (teamGoal) return handleUpdateTeamGoal(request, env, teamGoal[1]);
    if (path === "/api/admin/team/invites") return handleAdminBootstrapInvite(request, env);
    if (path === "/api/admin/team/roster/import") return handleAdminTeamRosterImport(request, env);
    if (path === "/api/admin/team/care/bootstrap") return handleAdminCareBootstrap(request, env);
    const adminFeedbackStatus = path.match(/^\/api\/admin\/feedback\/([^/]+)\/status$/);
    if (adminFeedbackStatus) return handleAdminResolveFeedback(request, env, adminFeedbackStatus[1]);
    const trashRestore = path.match(/^\/api\/admin\/trash\/([^/]+)\/restore$/);
    if (trashRestore) return handleRestoreRecord(request, env, trashRestore[1]);
    const memberPasswordReset = path.match(/^\/api\/team\/members\/([^/]+)\/reset-password$/);
    if (memberPasswordReset) return handleResetTeamMemberPassword(request, env, memberPasswordReset[1]);
    const feedbackStatus = path.match(/^\/api\/team\/feedback\/([^/]+)\/status$/);
    if (feedbackStatus) return handleResolveTeamFeedback(request, env, feedbackStatus[1]);
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
    await maintainAssessmentTrash(path, env);
    if (path === "/api/team/session") return handleTeamSession(request, env);
    if (path === "/api/team/summary") return handleTeamSummary(request, env);
    const teamStudent = path.match(/^\/api\/team\/students\/([^/]+)$/);
    if (teamStudent) return handleTeamStudentProfile(request, env, teamStudent[1]);
    if (path.startsWith("/api/team/records/")) return handleTeamRecord(request, env, path.split("/").pop());
    const sharedReport = reportPathMatch(path);
    if (sharedReport) {
      return sharedReport[2]
        ? handleSharedReportDownload(request, env, sharedReport[1])
        : handleSharedReportInfo(request, env, sharedReport[1]);
    }
    if (path === "/api/admin/summary") return handleAdminSummary(request, env);
    if (path === "/api/admin/trash") return handleAdminTrash(request, env);
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
    await maintainAssessmentTrash(path, env);
    const teamStudent = path.match(/^\/api\/team\/students\/([^/]+)$/);
    if (teamStudent) return handleArchiveTeamStudent(request, env, teamStudent[1]);
    const intervention = path.match(/^\/api\/team\/interventions\/([^/]+)$/);
    if (intervention) return handleDeleteIntervention(request, env, intervention[1]);
    if (path.startsWith("/api/team/records/")) return handleDeleteTeamRecord(request, env, path.split("/").pop());
    const trashRecord = path.match(/^\/api\/admin\/trash\/([^/]+)$/);
    if (trashRecord) return handlePermanentlyDeleteRecord(request, env, trashRecord[1]);
    if (path.startsWith("/api/admin/records/")) return handleDeleteRecord(request, env, path.split("/").pop());
    return json(request, env, { error: "接口不存在" }, 404);
  } catch (error) {
    if (error.message === "auth_not_configured") return json(request, env, { error: "团队认证尚未配置" }, 503);
    return json(request, env, { error: "服务暂时不可用" }, 500);
  }
}
