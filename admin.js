import { assessmentReportFilename, buildAssessmentReportDocument, loadReportFontData } from "./report-docx.js";

const API_ORIGIN = location.hostname === "sensory-assessment-site.pages.dev" || location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? ""
  : "https://sensory-assessment-site.pages.dev";
const SESSION_KEY = "sensoryAdminSessionKey";
const REFRESH_INTERVAL = 15_000;
const professionalModuleLabels = { si: "感觉统合 SI", ot: "作业治疗 OT", st: "言语语言 ST", pt: "运动功能 / PT" };

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const keyInput = document.getElementById("adminKeyInput");
const loginError = document.getElementById("loginError");
const toast = document.getElementById("toast");
const recordDialog = document.getElementById("recordDialog");
const adminTrashDialog = document.getElementById("adminTrashDialog");
const adminDrawer = document.getElementById("adminDrawer");
const adminHelpDialog = document.getElementById("adminHelpDialog");

let adminKey = sessionStorage.getItem(SESSION_KEY) || "";
let dashboardData = null;
let selectedRecordId = null;
let selectedRecord = null;
let refreshTimer = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function closeAdminDrawer() {
  document.body.classList.remove("drawer-open");
  adminDrawer.setAttribute("aria-hidden", "true");
  document.getElementById("adminMenuBtn").setAttribute("aria-expanded", "false");
  document.getElementById("adminDrawerBackdrop").hidden = true;
}

function openAdminDrawer() {
  document.body.classList.add("drawer-open");
  adminDrawer.setAttribute("aria-hidden", "false");
  document.getElementById("adminMenuBtn").setAttribute("aria-expanded", "true");
  document.getElementById("adminDrawerBackdrop").hidden = false;
}

function renderAdminDrawerIdentity(user = null) {
  const keyAccess = !user && Boolean(adminKey);
  const name = user?.displayName || (keyAccess ? "备用管理密钥" : "超级管理员验证中");
  document.getElementById("adminDrawerAvatar").textContent = user?.displayName?.slice(0, 1) || "知";
  document.getElementById("adminDrawerUserName").textContent = name;
  document.getElementById("adminDrawerUserRole").textContent = user ? "超级管理员 · 全专业" : (keyAccess ? "系统初始化与恢复" : "运营与数据后台");
  document.getElementById("adminDrawerUserEmail").textContent = user?.email || (keyAccess ? "本次浏览器会话" : "—");
}

async function loadAdminIdentity() {
  try {
    const response = await fetch(`${API_ORIGIN}/api/team/session`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    renderAdminDrawerIdentity(response.ok && data.user?.isSuperAdmin === true ? data.user : null);
  } catch {
    renderAdminDrawerIdentity(null);
  }
}

function analyticsSessionId() {
  let id = sessionStorage.getItem("sensoryAnonymousSession");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now().toString(36)}`;
    sessionStorage.setItem("sensoryAnonymousSession", id);
  }
  return id;
}

async function sendAnalytics(endpoint) {
  try {
    await fetch(`${API_ORIGIN}/api/analytics/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: analyticsSessionId(),
        path: location.pathname,
        deviceType: innerWidth <= 680 ? "mobile" : innerWidth <= 1100 ? "tablet" : "desktop"
      }),
      keepalive: true
    });
  } catch {
    // Statistics never block administration.
  }
}

function number(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(String(value).includes("T") ? value : `${String(value).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function api(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "X-Admin-Key": adminKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  if (options.raw) {
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "请求失败");
    }
    return response;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求失败");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function login() {
  const value = keyInput.value.trim();
  if (!value) {
    loginError.textContent = "请输入管理密钥。";
    keyInput.focus();
    return;
  }
  adminKey = value;
  loginError.textContent = "正在验证…";
  try {
    const data = await api("/api/admin/summary");
    sessionStorage.setItem(SESSION_KEY, adminKey);
    loginPanel.hidden = true;
    dashboard.hidden = false;
    dashboardData = data;
    renderDashboard();
    await loadAdminIdentity();
    startAutoRefresh();
  } catch (error) {
    adminKey = "";
    loginError.textContent = error.message;
    keyInput.select();
  }
}

function logout() {
  clearInterval(refreshTimer);
  sessionStorage.removeItem(SESSION_KEY);
  adminKey = "";
  keyInput.value = "";
  loginError.textContent = "";
  dashboard.hidden = true;
  loginPanel.hidden = false;
  closeAdminDrawer();
  renderAdminDrawerIdentity(null);
  keyInput.focus();
}

async function refreshDashboard(showFeedback = false) {
  try {
    dashboardData = await api("/api/admin/summary");
    renderDashboard();
    if (showFeedback) showToast("后台数据已刷新。 ");
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      logout();
      loginError.textContent = "超级管理员会话已失效，请重新验证。";
      return;
    }
    document.getElementById("freshnessText").textContent = `刷新失败：${error.message}`;
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => refreshDashboard(false), REFRESH_INTERVAL);
}

function renderDashboard() {
  const data = dashboardData || { metrics: {}, traffic: [], domainAverages: [], records: [] };
  const metrics = data.metrics || {};
  document.getElementById("activeNow").textContent = number(metrics.active_now);
  document.getElementById("todaySessions").textContent = number(metrics.today_sessions);
  document.getElementById("todayViews").textContent = number(metrics.today_views);
  document.getElementById("totalSessions").textContent = number(metrics.total_sessions);
  document.getElementById("totalViews").textContent = number(metrics.total_views);
  document.getElementById("totalAssessments").textContent = number(metrics.total_assessments);
  document.getElementById("todayAssessments").textContent = number(metrics.today_assessments);
  document.getElementById("recycleBinCount").textContent = number(metrics.trash_records);
  document.getElementById("freshnessText").textContent = `最近更新 ${formatDateTime(data.generatedAt)}`;
  document.getElementById("sourceTimestamp").textContent = formatDateTime(data.generatedAt);
  renderTeamBootstrap(metrics);
  renderTraffic(data.traffic || []);
  renderDomainAverages(data.domainAverages || []);
  renderBreakdown("deviceBreakdown", data.devices || [], { desktop: "桌面电脑", tablet: "平板", mobile: "手机", unknown: "未知设备" });
  renderBreakdown("regionBreakdown", data.regions || []);
  renderBreakdown("pathBreakdown", data.paths || []);
  renderFeedback(data.feedback || []);
  renderRecordTable();
}

function renderBreakdown(id, rows, labels = {}) {
  const container = document.getElementById(id);
  if (!rows.length) {
    container.innerHTML = '<div class="chart-empty">暂无访问数据</div>';
    return;
  }
  const maxViews = Math.max(1, ...rows.map((row) => Number(row.views) || 0));
  container.innerHTML = rows.map((row) => `<div class="breakdown-row"><span>${escapeHtml(labels[row.label] || row.label || "未知")}</span><div><i style="width:${Math.max(3, (Number(row.views) || 0) / maxViews * 100)}%"></i></div><strong>${number(row.sessions)}人 / ${number(row.views)}次</strong></div>`).join("");
}

function renderFeedback(rows) {
  const labels = { suggestion: "功能建议", content: "评估内容", bug: "故障问题", workflow: "操作流程", other: "其他" };
  document.getElementById("adminOpenFeedbackCount").textContent = String(rows.filter((item) => item.status === "open").length);
  document.getElementById("adminFeedbackList").innerHTML = rows.length
    ? rows.map((item) => `<article class="admin-feedback-item ${item.status}"><header><span>${escapeHtml(labels[item.category] || item.category)}</span><strong>${escapeHtml(item.author_name || "团队成员")}</strong><time>${escapeHtml(formatDateTime(item.created_at))}</time></header><p>${escapeHtml(item.content)}</p><footer><small>${escapeHtml(item.page_path || "/")}</small><button class="link-button" type="button" data-admin-feedback-id="${escapeHtml(item.id)}" data-admin-feedback-status="${item.status === "open" ? "resolved" : "open"}">${item.status === "open" ? "标记已处理" : "重新打开"}</button></footer></article>`).join("")
    : '<div class="chart-empty">尚未收到团队反馈</div>';
}

function renderTeamBootstrap(metrics) {
  const memberCount = Number(metrics.team_member_count) || 0;
  const recordCount = Number(metrics.team_record_count) || 0;
  const form = document.getElementById("teamBootstrapForm");
  const result = document.getElementById("bootstrapResult");
  if (memberCount > 0) {
    document.getElementById("teamBootstrapStatus").textContent = `团队已建立：${memberCount} 名启用成员、${recordCount} 份去标识化档案。后续邀请请由部门管理员在团队工作台中创建。`;
    form.hidden = true;
    result.hidden = true;
    return;
  }
  document.getElementById("teamBootstrapStatus").textContent = "尚未建立团队。请生成首位部门管理员的一次性邀请码。";
  form.hidden = false;
}

async function createBootstrapInvite(event) {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  try {
    const data = await api("/api/admin/team/invites", {
      method: "POST",
      body: "{}"
    });
    document.getElementById("bootstrapInviteCode").value = data.invite.code;
    document.getElementById("bootstrapResult").hidden = false;
    document.getElementById("teamBootstrapStatus").textContent = `首位管理员邀请码已生成，${formatDateTime(data.invite.expiresAt)} 到期。`;
    showToast("管理员邀请码已生成。 ");
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
  }
}

async function copyBootstrapInvite() {
  const value = document.getElementById("bootstrapInviteCode").value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.getElementById("bootstrapInviteCode");
    input.select();
    document.execCommand("copy");
  }
  showToast("管理员邀请码已复制。 ");
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function renderTraffic(rows) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const days = [];
  const now = new Date();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const key = dateKey(date);
    const row = byDay.get(key) || { views: 0, sessions: 0 };
    days.push({ key, label: `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`, views: Number(row.views) || 0, sessions: Number(row.sessions) || 0 });
  }
  const maxValue = Math.max(1, ...days.flatMap((day) => [day.views, day.sessions]));
  document.getElementById("trafficChart").innerHTML = days.map((day) => `
    <div class="bar-group" data-label="${day.label}" title="${day.key}：${day.views} 次浏览，${day.sessions} 个会话">
      <i class="bar views" style="height:${Math.max(day.views ? 3 : 0, (day.views / maxValue) * 100)}%"></i>
      <i class="bar sessions" style="height:${Math.max(day.sessions ? 3 : 0, (day.sessions / maxValue) * 100)}%"></i>
    </div>
  `).join("");
}

function renderDomainAverages(rows) {
  const chart = document.getElementById("domainChart");
  if (!rows.length) {
    chart.innerHTML = '<div class="chart-empty">收到授权同步的有效评估后，将显示领域平均表现。</div>';
    return;
  }
  chart.innerHTML = rows.map((row) => {
    const state = row.score < 2.5 ? "low" : row.score < 3.5 ? "mid" : "high";
    return `
      <div class="domain-bar-row ${state}" title="基于 ${row.count} 份有效领域数据">
        <span>${escapeHtml(row.title)}</span>
        <div class="domain-bar-track"><i style="width:${Math.max(0, Math.min(100, (Number(row.score) / 5) * 100))}%"></i></div>
        <b>${Number(row.score).toFixed(1)}</b>
      </div>
    `;
  }).join("");
}

function filteredRecords() {
  const query = document.getElementById("recordSearch").value.trim().toLowerCase();
  const privacy = document.getElementById("privacyFilter").value;
  return (dashboardData?.records || []).filter((record) => {
    const matchesQuery = !query || [record.student_label, record.student_code, record.primary_need, record.class_name, record.assessment_date].join(" ").toLowerCase().includes(query);
    const matchesPrivacy = privacy === "all" || (privacy === "deidentified" ? Number(record.is_deidentified) === 1 : Number(record.is_deidentified) === 0);
    return matchesQuery && matchesPrivacy;
  });
}

function renderRecordTable() {
  const rows = filteredRecords();
  const body = document.getElementById("recordTableBody");
  const empty = document.getElementById("tableEmpty");
  empty.hidden = rows.length > 0;
  body.innerHTML = rows.map((record) => `
    <tr>
      <td>${escapeHtml(record.student_label || "未命名")}${record.student_code && record.student_code !== record.student_label ? `<br><small>${escapeHtml(record.student_code)}</small>` : ""}</td>
      <td>${escapeHtml(record.primary_need || "—")}</td>
      <td>${escapeHtml(record.assessment_date || "—")}</td>
      <td>${record.overall_score == null ? "—" : Number(record.overall_score).toFixed(1)}</td>
      <td>${number(record.coverage)}%</td>
      <td><span class="privacy-badge ${Number(record.is_deidentified) === 1 ? "deidentified" : "full"}">${Number(record.is_deidentified) === 1 ? "去标识化" : "完整记录"}</span></td>
      <td>${formatDateTime(record.updated_at)}</td>
      <td>
        <div class="record-row-actions">
          <button class="link-button" type="button" data-record-action="view" data-record-id="${escapeHtml(record.id)}">查看</button>
          <button class="table-export-button" type="button" data-record-action="export" data-record-id="${escapeHtml(record.id)}" aria-label="导出 ${escapeHtml(record.student_label || "该学生")} 的 DOCX 评估报告">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"/></svg>
            <span>导出 DOCX</span>
          </button>
          <button class="link-button danger-link" type="button" data-record-action="delete" data-record-id="${escapeHtml(record.id)}" data-record-label="${escapeHtml(record.student_label || record.student_code || "该评估报告")}">删除</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function openRecord(id) {
  selectedRecordId = id;
  selectedRecord = null;
  document.getElementById("exportRecordReportBtn").disabled = true;
  document.getElementById("recordDialogTitle").textContent = "正在加载…";
  document.getElementById("recordDetail").innerHTML = '<div class="chart-empty">正在读取评估详情…</div>';
  recordDialog.showModal();
  try {
    const row = await api(`/api/admin/records/${encodeURIComponent(id)}`);
    renderRecordDetail(row);
  } catch (error) {
    document.getElementById("recordDetail").innerHTML = `<div class="chart-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderRecordDetail(row) {
  selectedRecord = row;
  document.getElementById("exportRecordReportBtn").disabled = false;
  const record = row.assessment || {};
  const analysis = row.analysis || {};
  const title = row.student_label || record.studentName || record.studentCode || "评估记录";
  document.getElementById("recordDialogTitle").textContent = title;
  const domainRows = Object.values(analysis.domainScores || {}).map((domain) => `
    <tr><td>${escapeHtml(domain.title)}</td><td>${escapeHtml(String(domain.professional || "—").toUpperCase())}</td><td>${Number(domain.score).toFixed(1)}</td><td>${number(domain.answered)}项</td><td>${["无明显影响", "轻度影响", "中度影响", "显著影响"][Number(domain.impact) || 0]}</td></tr>
  `).join("");
  const list = (items) => `<ul class="detail-list">${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无</li>"}</ul>`;
  const assessorRows = Object.entries(professionalModuleLabels).map(([id, label]) => {
    const assessor = record.professionalAssessors?.[id] || {};
    const readiness = analysis.moduleReadiness?.[id] || {};
    const contributors = Array.from(new Set([...(assessor.contributors || []), assessor.evaluator].filter(Boolean)));
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(assessor.evaluator ? `最近：${assessor.evaluator}` : "待分配")}</strong><small>${contributors.length ? `参与：${escapeHtml(contributors.join("、"))} · ` : ""}${escapeHtml(assessor.assessmentDate || "未填写日期")} · ${Number(readiness.validDomainCount) || 0}/${Number(readiness.totalDomainCount) || 0}个有效领域 · ${readiness.ready ? "可用于分流" : "待补评"}</small></div>`;
  }).join("");
  const courseLines = Array.isArray(analysis.courseRecommendations)
    ? analysis.courseRecommendations.map((item) => `${item.priorityLabel || "建议"}：${item.title}。${item.rationale || ""}建议聚焦：${item.focus || "待团队确认"}。`)
    : [];
  document.getElementById("recordDetail").innerHTML = `
    <div class="detail-summary">
      <div><span>学生标识</span><strong>${escapeHtml(title)}</strong></div>
      <div><span>机构/学校</span><strong>${escapeHtml(record.organizationName || "—")}</strong></div>
      <div><span>隐私模式</span><strong>${Number(row.is_deidentified) === 1 ? "去标识化" : "完整记录"}</strong></div>
      <div><span>功能观察均分</span><strong>${analysis.average == null ? "—" : Number(analysis.average).toFixed(1)}</strong></div>
      <div><span>完成度</span><strong>${number(analysis.coverage)}%</strong></div>
      <div><span>分析可信度</span><strong>${escapeHtml(analysis.confidence || "历史记录未标注")}</strong></div>
      <div><span>评估日期</span><strong>${escapeHtml(record.assessmentDate || "—")}</strong></div>
      <div><span>主要情境</span><strong>${escapeHtml(record.setting || "—")}</strong></div>
      <div><span>主要发展需要</span><strong>${escapeHtml(record.primaryNeed || "—")}</strong></div>
      <div><span>报告复核人</span><strong>${escapeHtml(record.reviewer || "—")}</strong></div>
      <div><span>最后同步</span><strong>${formatDateTime(row.updated_at)}</strong></div>
    </div>
    <section class="detail-section"><h3>多专业评估分工</h3><div class="detail-summary">${assessorRows}</div></section>
    <section class="detail-section"><h3>总体摘要</h3><p>${escapeHtml(analysis.summary || "暂无")}</p></section>
    <section class="detail-section"><h3>个别化分析依据</h3>${list(analysis.basis)}</section>
    <section class="detail-section"><h3>安全与解释提醒</h3>${list(analysis.alerts)}</section>
    <section class="detail-section"><h3>相对优势</h3>${list(analysis.strengths)}</section>
    <section class="detail-section"><h3>优先支持需要</h3>${list(analysis.needs)}</section>
    <section class="detail-section"><h3>个训课分流建议</h3>${list(courseLines.length ? courseLines : analysis.courseRecommendationNotes)}</section>
    <section class="detail-section"><h3>8周阶段目标</h3>${list(analysis.goals)}</section>
    <section class="detail-section"><h3>康复与情境支持</h3>${list(analysis.strategies)}</section>
    <section class="detail-section"><h3>领域分数</h3>
      <table class="detail-domain-table"><thead><tr><th>领域</th><th>专业</th><th>均分</th><th>有效项目</th><th>参与影响</th></tr></thead><tbody>${domainRows || '<tr><td colspan="5">暂无有效领域</td></tr>'}</tbody></table>
    </section>
  `;
}

function downloadFile(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportSelectedRecordReport() {
  if (!selectedRecord) {
    showToast("请先打开一份评估记录。 ");
    return;
  }
  const button = document.getElementById("exportRecordReportBtn");
  await exportRecordReport(selectedRecord, button);
}

async function exportRecordReport(row, button) {
  button.disabled = true;
  showToast("正在生成 Word 评估报告…");
  try {
    const fontData = await loadReportFontData();
    const documentFile = buildAssessmentReportDocument(row, globalThis.docx, fontData);
    const blob = await globalThis.docx.Packer.toBlob(documentFile);
    downloadFile(assessmentReportFilename(row), blob, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    showToast("DOCX 评估报告已导出。 ");
  } catch (error) {
    showToast(error.message || "DOCX 报告生成失败。 ");
  } finally {
    button.disabled = false;
  }
}

async function exportRecordById(id, button) {
  button.disabled = true;
  showToast("正在读取学生评估记录…");
  try {
    const row = await api(`/api/admin/records/${encodeURIComponent(id)}`);
    await exportRecordReport(row, button);
  } catch (error) {
    button.disabled = false;
    showToast(error.message || "读取评估记录失败。 ");
  }
}

async function deleteSelectedRecord() {
  if (!selectedRecordId) return;
  const title = document.getElementById("recordDialogTitle").textContent;
  if (!confirm(`确定将“${title}”移入回收站吗？30天内可以恢复。`)) return;
  try {
    await api(`/api/admin/records/${encodeURIComponent(selectedRecordId)}`, { method: "DELETE" });
    recordDialog.close();
    selectedRecordId = null;
    selectedRecord = null;
    await refreshDashboard(false);
    showToast("评估报告已移入回收站，可在30天内恢复。 ");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteRecordFromTable(id, label) {
  if (!confirm(`确定将“${label}”的评估报告移入回收站吗？30天内可以恢复。`)) return;
  try {
    await api(`/api/admin/records/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refreshDashboard(false);
    showToast("评估报告已移入回收站。 ");
  } catch (error) {
    showToast(error.message);
  }
}

function renderAdminTrash(rows) {
  const body = document.getElementById("adminTrashTableBody");
  document.getElementById("adminTrashEmpty").hidden = rows.length > 0;
  body.innerHTML = rows.map((record) => `
    <tr>
      <td>${escapeHtml(record.student_label || record.student_code || "未命名")}${record.student_code && record.student_code !== record.student_label ? `<br><small>${escapeHtml(record.student_code)}</small>` : ""}</td>
      <td>${escapeHtml(record.class_name || "—")}</td>
      <td>${escapeHtml(record.assessment_date || "—")}</td>
      <td>${escapeHtml(formatDateTime(record.deleted_at))}</td>
      <td>${escapeHtml(record.deleted_by_name || "备用管理密钥")}</td>
      <td><span class="retention-badge ${Number(record.days_remaining) <= 3 ? "urgent" : ""}">${Number(record.days_remaining) > 0 ? `${Number(record.days_remaining)}天` : "今天到期"}</span></td>
      <td><div class="record-row-actions">
        <button class="link-button" type="button" data-trash-action="restore" data-trash-id="${escapeHtml(record.id)}">恢复</button>
        <button class="link-button danger-link" type="button" data-trash-action="purge" data-trash-id="${escapeHtml(record.id)}" data-trash-label="${escapeHtml(record.student_label || record.student_code || "该评估报告")}">永久删除</button>
      </div></td>
    </tr>
  `).join("");
}

async function refreshAdminTrash() {
  const data = await api("/api/admin/trash");
  renderAdminTrash(data.records || []);
  document.getElementById("recycleBinCount").textContent = number((data.records || []).length);
}

async function openAdminTrash() {
  document.getElementById("adminTrashTableBody").innerHTML = '<tr><td colspan="7">正在读取回收站…</td></tr>';
  document.getElementById("adminTrashEmpty").hidden = true;
  adminTrashDialog.showModal();
  try {
    await refreshAdminTrash();
  } catch (error) {
    document.getElementById("adminTrashTableBody").innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function handleTrashAction(button) {
  const id = button.dataset.trashId;
  const action = button.dataset.trashAction;
  if (!id) return;
  if (action === "purge" && !confirm(`确定永久删除“${button.dataset.trashLabel || "该评估报告"}”吗？删除后无法恢复。`)) return;
  button.disabled = true;
  try {
    if (action === "restore") {
      await api(`/api/admin/trash/${encodeURIComponent(id)}/restore`, { method: "POST", body: "{}" });
      showToast("评估报告已恢复到正式档案。 ");
    } else {
      await api(`/api/admin/trash/${encodeURIComponent(id)}`, { method: "DELETE" });
      showToast("测试报告已永久删除。 ");
    }
    await Promise.all([refreshAdminTrash(), refreshDashboard(false)]);
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

async function exportCloudCsv() {
  try {
    const response = await api("/api/admin/export", { raw: true });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `云端学生功能评估-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error.message);
  }
}

function attachEvents() {
  document.getElementById("loginBtn").addEventListener("click", login);
  keyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("adminMenuBtn").addEventListener("click", () => document.body.classList.contains("drawer-open") ? closeAdminDrawer() : openAdminDrawer());
  document.getElementById("closeAdminDrawerBtn").addEventListener("click", closeAdminDrawer);
  document.getElementById("adminDrawerBackdrop").addEventListener("click", closeAdminDrawer);
  document.getElementById("adminDrawerLogoutBtn").addEventListener("click", logout);
  adminDrawer.addEventListener("click", (event) => {
    const action = event.target.closest("[data-admin-drawer-action]")?.dataset.adminDrawerAction;
    if (!action) return;
    closeAdminDrawer();
    if (action === "feedback") {
      if (dashboard.hidden) showToast("请先通过超级管理员验证");
      else document.getElementById("adminFeedbackPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (action === "instructions") adminHelpDialog.showModal();
  });
  document.querySelectorAll(".close-admin-help").forEach((button) => button.addEventListener("click", () => adminHelpDialog.close()));
  document.getElementById("refreshBtn").addEventListener("click", () => refreshDashboard(true));
  document.getElementById("exportCloudBtn").addEventListener("click", exportCloudCsv);
  document.getElementById("teamBootstrapForm").addEventListener("submit", createBootstrapInvite);
  document.getElementById("copyBootstrapInviteBtn").addEventListener("click", copyBootstrapInvite);
  document.getElementById("recordSearch").addEventListener("input", renderRecordTable);
  document.getElementById("privacyFilter").addEventListener("change", renderRecordTable);
  document.getElementById("adminFeedbackList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-feedback-id]");
    if (!button) return;
    button.disabled = true;
    try {
      await api(`/api/admin/feedback/${encodeURIComponent(button.dataset.adminFeedbackId)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: button.dataset.adminFeedbackStatus })
      });
      await refreshDashboard(false);
      showToast("反馈状态已更新。 ");
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });
  document.getElementById("recordTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-record-id]");
    if (!button) return;
    if (button.dataset.recordAction === "export") {
      exportRecordById(button.dataset.recordId, button);
      return;
    }
    if (button.dataset.recordAction === "delete") {
      deleteRecordFromTable(button.dataset.recordId, button.dataset.recordLabel || "该评估报告");
      return;
    }
    openRecord(button.dataset.recordId);
  });
  document.getElementById("openRecycleBinBtn").addEventListener("click", openAdminTrash);
  document.getElementById("adminTrashTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-trash-action]");
    if (button) handleTrashAction(button);
  });
  document.querySelectorAll(".close-admin-trash").forEach((button) => button.addEventListener("click", () => adminTrashDialog.close()));
  document.querySelectorAll(".close-record-dialog").forEach((button) => button.addEventListener("click", () => recordDialog.close()));
  document.getElementById("deleteCloudRecordBtn").addEventListener("click", deleteSelectedRecord);
  document.getElementById("exportRecordReportBtn").addEventListener("click", exportSelectedRecordReport);
  recordDialog.addEventListener("click", (event) => {
    if (event.target === recordDialog) recordDialog.close();
  });
  adminTrashDialog.addEventListener("click", (event) => {
    if (event.target === adminTrashDialog) adminTrashDialog.close();
  });
  adminHelpDialog.addEventListener("click", (event) => {
    if (event.target === adminHelpDialog) adminHelpDialog.close();
  });
}

async function init() {
  attachEvents();
  try {
    dashboardData = await api("/api/admin/summary");
    loginPanel.hidden = true;
    dashboard.hidden = false;
    renderDashboard();
    await loadAdminIdentity();
    startAutoRefresh();
  } catch (error) {
    if (adminKey) logout();
    else {
      loginError.textContent = error.status === 401 ? "请先在团队工作台登录超级管理员账号，或使用备用管理密钥。" : error.message;
      keyInput.focus();
    }
  }
}

init();
sendAnalytics("visit");
setInterval(() => sendAnalytics("heartbeat"), 45_000);
