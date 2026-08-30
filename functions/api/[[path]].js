const MAX_BODY_BYTES = 180_000;
const DOMAIN_LIMIT = 16;
const ITEM_LIMIT = 10;

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
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    ...extra
  };
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

function scrubName(value, studentName) {
  const text = cleanString(value, 1200);
  const name = cleanString(studentName, 80);
  return name && name.length >= 2 ? text.split(name).join("该学生") : text;
}

async function parseBody(request) {
  const announcedLength = Number(request.headers.get("Content-Length") || 0);
  if (announcedLength > MAX_BODY_BYTES) throw new Error("payload_too_large");
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("payload_too_large");
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

function normalizeRecord(rawRecord, deidentified) {
  const raw = rawRecord && typeof rawRecord === "object" ? rawRecord : {};
  const studentName = cleanString(raw.studentName, 80);
  const studentCode = cleanString(raw.studentCode, 60);
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
      note: deidentified ? scrubName(domain.note, studentName) : cleanString(domain.note, 1200)
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

function normalizeAnalysis(rawAnalysis, studentName = "") {
  const raw = rawAnalysis && typeof rawAnalysis === "object" ? rawAnalysis : {};
  const cleanAnalysisString = (value, max) => {
    const text = cleanString(value, max);
    const name = cleanString(studentName, 80);
    return name && name.length >= 2 ? text.split(name).join("该学生") : text;
  };
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

  const deidentified = body.deidentified !== false;
  const studentName = deidentified ? cleanString(body.record?.studentName, 80) : "";
  const record = normalizeRecord(body.record, deidentified);
  const analysis = normalizeAnalysis(body.analysis, studentName);
  const sessionId = validSessionId(body.sessionId);
  const clientRecordId = cleanString(record.id, 80);

  if (!clientRecordId) return json(request, env, { error: "档案标识无效" }, 400);
  if (!record.studentCode && !record.studentName) {
    return json(request, env, { error: "请填写学生编号；完整同步模式也可填写姓名" }, 400);
  }
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
        (SELECT COUNT(*) FROM assessment_records WHERE date(created_at) = date('now')) AS today_assessments
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
  return new Response(null, { status: 204, headers: responseHeaders(context.request, context.env) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!originIsAllowed(request, env)) return json(request, env, { error: "不允许的请求来源" }, 403);
  const path = routePath(request);
  try {
    if (path === "/api/analytics/visit") return handleVisit(request, env, false);
    if (path === "/api/analytics/heartbeat") return handleVisit(request, env, true);
    if (path === "/api/assessments") return handleAssessment(request, env);
    return json(request, env, { error: "接口不存在" }, 404);
  } catch (error) {
    if (error.message === "payload_too_large") return json(request, env, { error: "提交内容过大" }, 413);
    if (error.message === "invalid_json") return json(request, env, { error: "提交内容格式错误" }, 400);
    return json(request, env, { error: "服务暂时不可用" }, 500);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!originIsAllowed(request, env)) return json(request, env, { error: "不允许的请求来源" }, 403);
  const path = routePath(request);
  try {
    if (path === "/api/admin/summary") return handleAdminSummary(request, env);
    if (path === "/api/admin/export") return handleAdminExport(request, env);
    if (path.startsWith("/api/admin/records/")) return handleAdminRecord(request, env, path.split("/").pop());
    return json(request, env, { error: "接口不存在" }, 404);
  } catch {
    return json(request, env, { error: "服务暂时不可用" }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!originIsAllowed(request, env)) return json(request, env, { error: "不允许的请求来源" }, 403);
  const path = routePath(request);
  try {
    if (path.startsWith("/api/admin/records/")) return handleDeleteRecord(request, env, path.split("/").pop());
    return json(request, env, { error: "接口不存在" }, 404);
  } catch {
    return json(request, env, { error: "服务暂时不可用" }, 500);
  }
}
