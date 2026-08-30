import { assessmentReportFilename, buildAssessmentReportDocument } from "./report-docx.js";

const API_ORIGIN = location.hostname === "sensory-assessment-site.pages.dev" || location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? ""
  : "https://sensory-assessment-site.pages.dev";
const SESSION_KEY = "sensoryAdminSessionKey";
const REFRESH_INTERVAL = 15_000;

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const keyInput = document.getElementById("adminKeyInput");
const loginError = document.getElementById("loginError");
const toast = document.getElementById("toast");
const recordDialog = document.getElementById("recordDialog");

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
  keyInput.focus();
}

async function refreshDashboard(showFeedback = false) {
  try {
    dashboardData = await api("/api/admin/summary");
    renderDashboard();
    if (showFeedback) showToast("后台数据已刷新。 ");
  } catch (error) {
    if (error.status === 401) {
      logout();
      loginError.textContent = "管理会话已失效，请重新输入密钥。";
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
  document.getElementById("todayViews").textContent = number(metrics.today_views);
  document.getElementById("totalViews").textContent = number(metrics.total_views);
  document.getElementById("sessionSummary").textContent = `${number(metrics.total_sessions)} 个匿名会话`;
  document.getElementById("totalAssessments").textContent = number(metrics.total_assessments);
  document.getElementById("todayAssessments").textContent = number(metrics.today_assessments);
  document.getElementById("freshnessText").textContent = `最近更新 ${formatDateTime(data.generatedAt)}`;
  document.getElementById("sourceTimestamp").textContent = formatDateTime(data.generatedAt);
  renderTraffic(data.traffic || []);
  renderDomainAverages(data.domainAverages || []);
  renderRecordTable();
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
    <tr><td>${escapeHtml(domain.title)}</td><td>${Number(domain.score).toFixed(1)}</td><td>${number(domain.answered)}项</td><td>${["无明显影响", "轻度影响", "中度影响", "显著影响"][Number(domain.impact) || 0]}</td></tr>
  `).join("");
  const list = (items) => `<ul class="detail-list">${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无</li>"}</ul>`;
  document.getElementById("recordDetail").innerHTML = `
    <div class="detail-summary">
      <div><span>学生标识</span><strong>${escapeHtml(title)}</strong></div>
      <div><span>隐私模式</span><strong>${Number(row.is_deidentified) === 1 ? "去标识化" : "完整记录"}</strong></div>
      <div><span>综合分</span><strong>${analysis.average == null ? "—" : Number(analysis.average).toFixed(1)}</strong></div>
      <div><span>完成度</span><strong>${number(analysis.coverage)}%</strong></div>
      <div><span>评估日期</span><strong>${escapeHtml(record.assessmentDate || "—")}</strong></div>
      <div><span>主要情境</span><strong>${escapeHtml(record.setting || "—")}</strong></div>
      <div><span>主要发展需要</span><strong>${escapeHtml(record.primaryNeed || "—")}</strong></div>
      <div><span>最后同步</span><strong>${formatDateTime(row.updated_at)}</strong></div>
    </div>
    <section class="detail-section"><h3>总体摘要</h3><p>${escapeHtml(analysis.summary || "暂无")}</p></section>
    <section class="detail-section"><h3>相对优势</h3>${list(analysis.strengths)}</section>
    <section class="detail-section"><h3>优先支持需要</h3>${list(analysis.needs)}</section>
    <section class="detail-section"><h3>8周阶段目标</h3>${list(analysis.goals)}</section>
    <section class="detail-section"><h3>康复与情境支持</h3>${list(analysis.strategies)}</section>
    <section class="detail-section"><h3>领域分数</h3>
      <table class="detail-domain-table"><thead><tr><th>领域</th><th>均分</th><th>有效项目</th><th>参与影响</th></tr></thead><tbody>${domainRows || '<tr><td colspan="4">暂无有效领域</td></tr>'}</tbody></table>
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
    const documentFile = buildAssessmentReportDocument(row, globalThis.docx);
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
  if (!confirm(`确定永久删除云端记录“${title}”吗？此操作不会删除使用者浏览器中的本机副本。`)) return;
  try {
    await api(`/api/admin/records/${encodeURIComponent(selectedRecordId)}`, { method: "DELETE" });
    recordDialog.close();
    selectedRecordId = null;
    selectedRecord = null;
    await refreshDashboard(false);
    showToast("云端评估记录已删除。 ");
  } catch (error) {
    showToast(error.message);
  }
}

async function exportCloudCsv() {
  try {
    const response = await api("/api/admin/export", { raw: true });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `云端感觉统合评估-${new Date().toISOString().slice(0, 10)}.csv`;
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
  document.getElementById("refreshBtn").addEventListener("click", () => refreshDashboard(true));
  document.getElementById("exportCloudBtn").addEventListener("click", exportCloudCsv);
  document.getElementById("recordSearch").addEventListener("input", renderRecordTable);
  document.getElementById("privacyFilter").addEventListener("change", renderRecordTable);
  document.getElementById("recordTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-record-id]");
    if (!button) return;
    if (button.dataset.recordAction === "export") {
      exportRecordById(button.dataset.recordId, button);
      return;
    }
    openRecord(button.dataset.recordId);
  });
  document.querySelectorAll(".close-record-dialog").forEach((button) => button.addEventListener("click", () => recordDialog.close()));
  document.getElementById("deleteCloudRecordBtn").addEventListener("click", deleteSelectedRecord);
  document.getElementById("exportRecordReportBtn").addEventListener("click", exportSelectedRecordReport);
  recordDialog.addEventListener("click", (event) => {
    if (event.target === recordDialog) recordDialog.close();
  });
}

async function init() {
  attachEvents();
  if (!adminKey) {
    keyInput.focus();
    return;
  }
  try {
    dashboardData = await api("/api/admin/summary");
    loginPanel.hidden = true;
    dashboard.hidden = false;
    renderDashboard();
    startAutoRefresh();
  } catch {
    logout();
  }
}

init();
