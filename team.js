import { assessmentReportFilename, buildAssessmentReportDocument } from "./report-docx.js";

const PRODUCTION_ORIGIN = "https://sensory-assessment-site.pages.dev";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const API_ORIGIN = location.hostname === "sensory-assessment-site.pages.dev" || LOCAL_HOSTS.has(location.hostname)
  ? ""
  : PRODUCTION_ORIGIN;
const TEAM_RECORD_TRANSFER_KEY = "sensoryTeamOpenRecord.v1";

if (location.protocol === "file:" || location.hostname === "jintang6.github.io") {
  location.replace(`${PRODUCTION_ORIGIN}/team.html${location.search}`);
}

const authView = document.getElementById("authView");
const dashboardView = document.getElementById("dashboardView");
const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");
const teamRecordDialog = document.getElementById("teamRecordDialog");
const accountDialog = document.getElementById("accountDialog");
const recordTableBody = document.getElementById("teamRecordTableBody");
const recordSearch = document.getElementById("teamRecordSearch");
const inviteToken = new URLSearchParams(location.search).get("invite") || "";

let summary = null;
let currentRecord = null;
let refreshTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "—";
  const text = String(value);
  const date = new Date(text.includes("T") ? text : `${text.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showToast(message) {
  const toast = document.getElementById("teamToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get("Content-Type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(data?.error || "请求未完成，请稍后重试");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showLogin() {
  clearInterval(refreshTimer);
  authView.hidden = false;
  dashboardView.hidden = true;
  document.getElementById("accountBtn").hidden = true;
  document.getElementById("teamLogoutBtn").hidden = true;
  loginPanel.hidden = false;
  registerPanel.hidden = true;
}

function showRegister() {
  authView.hidden = false;
  dashboardView.hidden = true;
  loginPanel.hidden = true;
  registerPanel.hidden = false;
}

function showDashboard() {
  authView.hidden = true;
  dashboardView.hidden = false;
  document.getElementById("accountBtn").hidden = false;
  document.getElementById("teamLogoutBtn").hidden = false;
}

async function loadInvite() {
  showRegister();
  const inviteSummary = document.getElementById("inviteSummary");
  const registerForm = document.getElementById("registerForm");
  try {
    const invite = await api(`/api/team/invites/${encodeURIComponent(inviteToken)}`);
    inviteSummary.innerHTML = `<strong>${escapeHtml(invite.teamName)}</strong>邀请邮箱：${escapeHtml(invite.emailHint)} · 角色：${escapeHtml(invite.roleLabel)}<br>有效期至 ${escapeHtml(formatDateTime(invite.expiresAt))}`;
    registerForm.hidden = false;
  } catch (error) {
    inviteSummary.textContent = error.message;
    document.getElementById("registerError").textContent = "请联系部门管理员重新生成邀请链接。";
  }
}

async function loadSession() {
  try {
    const data = await api("/api/team/session");
    showDashboard();
    await loadSummary();
    refreshTimer = setInterval(() => loadSummary({ quiet: true }), 30_000);
    return data;
  } catch (error) {
    if (inviteToken) await loadInvite();
    else showLogin();
    return null;
  }
}

function renderMetrics(metrics) {
  document.getElementById("teamRecordCount").textContent = String(metrics.total_records || 0);
  document.getElementById("teamTodayCount").textContent = String(metrics.today_updates || 0);
  document.getElementById("teamMemberCount").textContent = String(metrics.active_members || 0);
  document.getElementById("teamOnlineCount").textContent = String(metrics.online_members || 0);
}

function scoreClass(value) {
  const score = Number(value);
  return Number.isFinite(score) && score < 2.5 ? "low" : "";
}

function renderRecords() {
  const query = recordSearch.value.trim().toLowerCase();
  const records = (summary?.records || []).filter((row) => [row.student_code, row.primary_need, row.assessment_date, row.owner_name]
    .join(" ").toLowerCase().includes(query));
  document.getElementById("teamRecordEmpty").hidden = records.length > 0;
  recordTableBody.innerHTML = records.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.student_code)}</strong></td>
      <td>${escapeHtml(row.primary_need || "—")}</td>
      <td>${escapeHtml(row.assessment_date || "—")}</td>
      <td><span class="score-pill ${scoreClass(row.overall_score)}">${row.overall_score == null ? "—" : Number(row.overall_score).toFixed(1)}</span></td>
      <td>${Number(row.coverage) || 0}%</td>
      <td><span class="version-pill">v${Number(row.version) || 1}</span></td>
      <td>${escapeHtml(formatDateTime(row.updated_at))}<br><small>${escapeHtml(row.updated_by_name || "—")}</small></td>
      <td><button class="table-action" type="button" data-team-record-id="${escapeHtml(row.id)}">查看</button></td>
    </tr>
  `).join("");
}

function renderDomainChart() {
  const rows = summary?.domainAverages || [];
  const chart = document.getElementById("teamDomainChart");
  if (!rows.length) {
    chart.innerHTML = '<div class="team-empty">形成团队评估后显示领域趋势</div>';
    return;
  }
  chart.innerHTML = rows.map((row) => {
    const score = Number(row.score) || 0;
    const state = score < 2.5 ? "low" : score < 3.5 ? "mid" : "";
    return `<div class="team-domain-row ${state}"><span title="${escapeHtml(row.title)}">${escapeHtml(row.title)}</span><div class="domain-track"><i style="width:${Math.max(0, Math.min(100, score / 5 * 100))}%"></i></div><strong>${score.toFixed(1)}</strong></div>`;
  }).join("");
}

function roleOptions(selected) {
  return [
    ["admin", "部门管理员"],
    ["evaluator", "评估成员"],
    ["viewer", "只读成员"]
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function renderMembers() {
  const body = document.getElementById("memberTableBody");
  body.innerHTML = (summary?.members || []).map((member) => {
    const isSelf = member.user_id === summary.currentUser.id;
    return `
      <tr data-member-id="${escapeHtml(member.user_id)}">
        <td><strong>${escapeHtml(member.display_name)}</strong>${isSelf ? "（当前账号）" : ""}</td>
        <td>${escapeHtml(member.email)}</td>
        <td><select data-member-role ${isSelf ? "disabled" : ""}>${roleOptions(member.role)}</select></td>
        <td><select data-member-status ${isSelf ? "disabled" : ""}><option value="active" ${member.status === "active" ? "selected" : ""}>启用</option><option value="disabled" ${member.status === "disabled" ? "selected" : ""}>停用</option></select></td>
        <td>${escapeHtml(formatDateTime(member.last_active_at))}</td>
        <td>${isSelf ? '<span class="member-status active">当前</span>' : '<button class="table-action" type="button" data-save-member>保存</button>'}</td>
      </tr>`;
  }).join("");
}

function renderInvites() {
  const invites = summary?.invites || [];
  document.getElementById("pendingInviteCount").textContent = String(invites.length);
  document.getElementById("pendingInviteList").innerHTML = invites.length
    ? invites.map((invite) => `<div class="pending-item"><strong>${escapeHtml(invite.email)}</strong><span>${escapeHtml(invite.roleLabel)} · ${escapeHtml(formatDateTime(invite.expires_at))} 到期</span></div>`).join("")
    : '<div class="team-empty">暂无待接受邀请</div>';
}

const auditLabels = {
  "member.login": "成员登录",
  "member.password_change": "修改密码",
  "member.update": "调整成员权限",
  "invite.create": "创建成员邀请",
  "invite.accept": "接受成员邀请",
  "assessment.sync": "同步评估版本",
  "assessment.view": "查看评估档案",
  "assessment.delete": "删除评估档案"
};

function renderAudit() {
  const members = new Map((summary?.members || []).map((member) => [member.user_id, member.display_name]));
  const rows = summary?.audit || [];
  document.getElementById("auditList").innerHTML = rows.length
    ? rows.map((row) => {
        const version = row.metadata?.version ? ` · v${row.metadata.version}` : "";
        return `<div class="audit-item"><strong>${escapeHtml(members.get(row.user_id) || "系统管理员")}</strong><span>${escapeHtml(auditLabels[row.action] || row.action)}${escapeHtml(version)}</span><time>${escapeHtml(formatDateTime(row.created_at))}</time></div>`;
      }).join("")
    : '<div class="team-empty">暂无审计记录</div>';
}

function renderSummary() {
  const isAdmin = summary.currentUser.role === "admin";
  const canEdit = isAdmin || summary.currentUser.role === "evaluator";
  document.getElementById("teamName").textContent = summary.team.name;
  document.getElementById("teamHeaderSubtitle").textContent = `${summary.team.name} · 邀请制协作`;
  document.getElementById("memberGreeting").textContent = `${summary.currentUser.displayName}，欢迎回来`;
  document.getElementById("memberRole").textContent = summary.currentUser.roleLabel;
  document.getElementById("membersTabBtn").hidden = !isAdmin;
  document.getElementById("auditTabBtn").hidden = !isAdmin;
  document.getElementById("newAssessmentBtn").hidden = !canEdit;
  document.getElementById("deleteTeamRecordBtn").hidden = !isAdmin;
  document.getElementById("openInAssessmentBtn").hidden = !canEdit;
  renderMetrics(summary.metrics || {});
  renderRecords();
  renderDomainChart();
  if (isAdmin) {
    renderMembers();
    renderInvites();
    renderAudit();
  }
  document.getElementById("teamFreshness").textContent = formatDateTime(summary.generatedAt);
}

async function loadSummary({ quiet = false } = {}) {
  try {
    summary = await api("/api/team/summary");
    renderSummary();
    if (!quiet) showToast("团队数据已刷新");
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      showLogin();
      showToast("登录已失效，请重新登录");
      return;
    }
    if (!quiet) showToast(error.message);
  }
}

function detailList(title, values, ordered = false) {
  const items = Array.isArray(values) && values.length ? values : ["暂无"];
  const tag = ordered ? "ol" : "ul";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><${tag}>${items.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</${tag}></section>`;
}

function renderRecordDetail(row) {
  const record = row.assessment || {};
  const analysis = row.analysis || {};
  const domains = Object.values(analysis.domainScores || {}).sort((a, b) => Number(a.score) - Number(b.score));
  const versions = row.versions || [];
  document.getElementById("teamRecordDialogTitle").textContent = `${row.student_code} · 感觉统合功能评估`;
  document.getElementById("teamRecordDetail").innerHTML = `
    <div class="team-record-meta">
      <div><span>学生协作编号</span><strong>${escapeHtml(row.student_code)}</strong></div>
      <div><span>年龄</span><strong>${escapeHtml(record.age || "—")}</strong></div>
      <div><span>性别</span><strong>${escapeHtml(record.gender || "—")}</strong></div>
      <div><span>主要发展需要</span><strong>${escapeHtml(record.primaryNeed || "—")}</strong></div>
      <div><span>评估日期</span><strong>${escapeHtml(record.assessmentDate || "—")}</strong></div>
      <div><span>综合分</span><strong>${analysis.average == null ? "—" : Number(analysis.average).toFixed(1)}</strong></div>
      <div><span>完成度</span><strong>${Number(analysis.coverage) || 0}%</strong></div>
      <div><span>当前版本</span><strong>v${Number(row.version) || 1}</strong></div>
    </div>
    <section class="detail-section"><h3>综合评估结果</h3><p>${escapeHtml(analysis.summary || "资料不足，尚未形成综合分析。")}</p></section>
    <section class="detail-section"><h3>领域表现</h3><div class="detail-domain-grid">${domains.length ? domains.map((domain) => `<div><span>${escapeHtml(domain.title)}</span><strong>${Number(domain.score).toFixed(1)}</strong></div>`).join("") : "暂无领域数据"}</div></section>
    ${detailList("相对优势", analysis.strengths)}
    ${detailList("优先支持需要", analysis.needs)}
    ${detailList("阶段康复目标", analysis.goals, true)}
    ${detailList("干预与环境支持建议", analysis.strategies)}
    ${detailList("安全与解释提醒", analysis.alerts)}
    <section class="detail-section"><h3>版本记录</h3><div class="version-list">${versions.map((version) => `<span>v${version.version} · ${escapeHtml(version.changed_by_name || "成员")} · ${escapeHtml(formatDateTime(version.created_at))}</span>`).join("")}</div></section>`;
}

async function openRecord(id) {
  try {
    currentRecord = await api(`/api/team/records/${encodeURIComponent(id)}`);
    renderRecordDetail(currentRecord);
    teamRecordDialog.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCurrentDocx() {
  if (!currentRecord) return;
  const button = document.getElementById("exportTeamDocxBtn");
  button.disabled = true;
  button.textContent = "正在生成…";
  try {
    const doc = buildAssessmentReportDocument(currentRecord, window.docx);
    const blob = await window.docx.Packer.toBlob(doc);
    downloadBlob(blob, assessmentReportFilename(currentRecord));
    showToast("DOCX评估报告已生成");
  } catch {
    showToast("报告生成失败，请刷新页面后重试");
  } finally {
    button.disabled = false;
    button.textContent = "导出 DOCX";
  }
}

function openRecordInAssessment() {
  if (!currentRecord) return;
  const record = {
    ...currentRecord.assessment,
    id: currentRecord.client_record_id,
    studentName: "",
    className: "",
    organizationName: "",
    evaluator: "",
    reviewer: "",
    background: "",
    medicalPrecautions: ""
  };
  sessionStorage.setItem(TEAM_RECORD_TRANSFER_KEY, JSON.stringify(record));
  location.href = "./index.html?source=team";
}

async function deleteCurrentRecord() {
  if (!currentRecord || !confirm(`确认将 ${currentRecord.student_code} 移入已删除记录？历史版本与审计记录仍会保留。`)) return;
  try {
    await api(`/api/team/records/${encodeURIComponent(currentRecord.id)}`, { method: "DELETE" });
    teamRecordDialog.close();
    currentRecord = null;
    await loadSummary({ quiet: true });
    showToast("团队档案已移入已删除记录");
  } catch (error) {
    showToast(error.message);
  }
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast(successMessage);
}

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.getElementById("loginError");
  const submit = event.submitter;
  errorBox.textContent = "";
  submit.disabled = true;
  submit.textContent = "正在验证…";
  try {
    await api("/api/team/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value
      })
    });
    await loadSession();
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "安全登录";
  }
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.getElementById("registerError");
  const password = document.getElementById("registerPassword").value;
  const confirmPassword = document.getElementById("registerPasswordConfirm").value;
  if (password !== confirmPassword) {
    errorBox.textContent = "两次输入的密码不一致";
    return;
  }
  const submit = event.submitter;
  errorBox.textContent = "";
  submit.disabled = true;
  submit.textContent = "正在建立账号…";
  try {
    await api("/api/team/register", {
      method: "POST",
      body: JSON.stringify({
        inviteToken,
        email: document.getElementById("registerEmail").value,
        displayName: document.getElementById("registerName").value,
        password
      })
    });
    history.replaceState({}, "", "./team.html");
    showToast("账号已建立，正在进入团队空间");
    await loadSession();
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "接受邀请并注册";
  }
});

document.getElementById("backToLoginBtn").addEventListener("click", () => {
  history.replaceState({}, "", "./team.html");
  showLogin();
});

document.getElementById("teamLogoutBtn").addEventListener("click", async () => {
  try { await api("/api/team/logout", { method: "POST", body: "{}" }); } catch { /* Cookie is cleared when possible. */ }
  summary = null;
  showLogin();
  showToast("已退出团队工作台");
});

document.getElementById("refreshTeamBtn").addEventListener("click", () => loadSummary());
document.getElementById("newAssessmentBtn").addEventListener("click", () => { location.href = "./index.html?source=team&new=1"; });
recordSearch.addEventListener("input", renderRecords);
recordTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-team-record-id]");
  if (button) openRecord(button.dataset.teamRecordId);
});

document.getElementById("teamTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-team-tab]");
  if (!button) return;
  document.querySelectorAll("[data-team-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
  document.querySelectorAll("[data-team-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.teamPanel === button.dataset.teamTab));
});

document.getElementById("inviteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.getElementById("inviteError");
  const submit = event.submitter;
  errorBox.textContent = "";
  submit.disabled = true;
  try {
    const result = await api("/api/team/invites", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("inviteEmail").value,
        role: document.getElementById("inviteRole").value
      })
    });
    document.getElementById("inviteLinkOutput").value = result.invite.inviteUrl;
    document.getElementById("inviteExpiryText").textContent = `${result.invite.roleLabel} · ${formatDateTime(result.invite.expiresAt)} 到期，仅可使用一次。`;
    document.getElementById("inviteResult").hidden = false;
    event.target.reset();
    await loadSummary({ quiet: true });
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("copyInviteBtn").addEventListener("click", () => {
  copyText(document.getElementById("inviteLinkOutput").value, "邀请链接已复制");
});

document.getElementById("memberTableBody").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-member]");
  if (!button) return;
  const row = button.closest("[data-member-id]");
  button.disabled = true;
  try {
    await api(`/api/team/members/${encodeURIComponent(row.dataset.memberId)}`, {
      method: "POST",
      body: JSON.stringify({
        role: row.querySelector("[data-member-role]").value,
        status: row.querySelector("[data-member-status]").value
      })
    });
    await loadSummary({ quiet: true });
    showToast("成员权限已更新");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

document.getElementById("accountBtn").addEventListener("click", () => accountDialog.showModal());
document.querySelectorAll(".close-account-dialog").forEach((button) => button.addEventListener("click", () => accountDialog.close()));
document.getElementById("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.getElementById("passwordError");
  const newPassword = document.getElementById("newPassword").value;
  if (newPassword !== document.getElementById("newPasswordConfirm").value) {
    errorBox.textContent = "两次输入的新密码不一致";
    return;
  }
  const submit = event.submitter;
  submit.disabled = true;
  errorBox.textContent = "";
  try {
    await api("/api/team/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword
      })
    });
    event.target.reset();
    accountDialog.close();
    showToast("密码已更新，其他设备会话已退出");
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelectorAll(".close-team-record").forEach((button) => button.addEventListener("click", () => teamRecordDialog.close()));
document.getElementById("exportTeamDocxBtn").addEventListener("click", exportCurrentDocx);
document.getElementById("openInAssessmentBtn").addEventListener("click", openRecordInAssessment);
document.getElementById("deleteTeamRecordBtn").addEventListener("click", deleteCurrentRecord);

[teamRecordDialog, accountDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

loadSession();
