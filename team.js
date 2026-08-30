import {
  assessmentReportFilename,
  buildAssessmentReportDocument,
  buildStudentProgressDocument,
  studentProgressFilename
} from "./report-docx.js";

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
const rosterTableBody = document.getElementById("teamRosterTableBody");
const rosterSearch = document.getElementById("teamRosterSearch");
const rosterClassFilter = document.getElementById("teamRosterClassFilter");
const studentProfileDialog = document.getElementById("studentProfileDialog");
const studentFormDialog = document.getElementById("studentFormDialog");
const goalDialog = document.getElementById("goalDialog");
const interventionDialog = document.getElementById("interventionDialog");

let summary = null;
let currentRecord = null;
let currentProfile = null;
let refreshTimer = null;

const goalStatusLabels = { active: "执行中", achieved: "已达成", paused: "暂停", archived: "归档" };
const goalPriorityLabels = { high: "优先", medium: "常规重点", routine: "维持与泛化" };
const settingLabels = { classroom: "课堂", therapy: "康复训练", daily_living: "日常生活", home: "家庭", community: "社区" };
const observerLabels = { therapist: "康复治疗师观察", teacher: "教师反馈", family: "家庭反馈", multidisciplinary: "跨专业共同观察" };
const responseLabels = { limited: "反应有限", emerging: "开始出现", stable: "较稳定", generalized: "可泛化" };
const supportLabels = { 1: "全程协助", 2: "大量协助", 3: "部分提示", 4: "少量提示", 5: "独立稳定" };

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

function formatInviteCodeInput(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15);
  return [compact.slice(0, 3), compact.slice(3, 7), compact.slice(7, 11), compact.slice(11, 15)].filter(Boolean).join("-");
}

async function verifyInviteCode() {
  const inviteSummary = document.getElementById("inviteSummary");
  const inviteCode = document.getElementById("registerInviteCode").value;
  if (!inviteCode.trim()) {
    inviteSummary.textContent = "请输入管理员提供的一次性邀请码。";
    throw new Error("请输入邀请码");
  }
  inviteSummary.textContent = "正在验证邀请码…";
  try {
    const invite = await api("/api/team/invite-code", {
      method: "POST",
      body: JSON.stringify({ inviteCode })
    });
    inviteSummary.innerHTML = `<strong>${escapeHtml(invite.teamName)}</strong>受邀角色：${escapeHtml(invite.roleLabel)}<br>有效期至 ${escapeHtml(formatDateTime(invite.expiresAt))}`;
    return invite;
  } catch (error) {
    inviteSummary.textContent = error.message;
    throw error;
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
    showLogin();
    return null;
  }
}

function renderMetrics(metrics) {
  const totalStudents = Number(metrics.total_students) || 0;
  const assessedStudents = Math.min(totalStudents, Number(metrics.assessed_students) || 0);
  document.getElementById("teamStudentCount").textContent = String(totalStudents);
  document.getElementById("teamAssessedStudentCount").textContent = String(assessedStudents);
  document.getElementById("teamActiveGoalCount").textContent = String(Number(metrics.active_goals) || 0);
  document.getElementById("teamDueGoalCount").textContent = String(Number(metrics.due_goals) || 0);
  document.getElementById("teamRecordCount").textContent = String(metrics.total_records || 0);
  document.getElementById("teamTodayCount").textContent = String(metrics.today_updates || 0);
  document.getElementById("teamMemberCount").textContent = String(metrics.active_members || 0);
  document.getElementById("teamOnlineCount").textContent = String(metrics.online_members || 0);
}

function renderRoster() {
  const allStudents = summary?.students || [];
  const previousClass = rosterClassFilter.value;
  const classes = [...new Set(allStudents.map((student) => student.class_name).filter(Boolean))];
  rosterClassFilter.innerHTML = '<option value="">全部班级</option>'
    + classes.map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join("");
  if (classes.includes(previousClass)) rosterClassFilter.value = previousClass;

  const query = rosterSearch.value.trim().toLowerCase();
  const selectedClass = rosterClassFilter.value;
  const canEdit = ["admin", "evaluator"].includes(summary?.currentUser?.role);
  const students = allStudents.filter((student) => {
    if (selectedClass && student.class_name !== selectedClass) return false;
    return [student.student_name, student.class_name, student.student_code]
      .join(" ").toLowerCase().includes(query);
  });

  document.getElementById("teamRosterEmpty").hidden = students.length > 0;
  rosterTableBody.innerHTML = students.map((student) => {
    const assessed = Boolean(student.assessment_id);
    const activeGoals = Number(student.active_goal_count) || 0;
    const dueGoals = Number(student.due_goal_count) || 0;
    const assessmentAction = canEdit
      ? `<button class="table-action" type="button" data-start-student-id="${escapeHtml(student.id)}">${assessed ? "继续评估" : "开始评估"}</button>`
      : "";
    return `
      <tr>
        <td class="student-name-cell"><strong>${escapeHtml(student.student_name)}</strong><small>${escapeHtml(student.grade_name || "")}</small></td>
        <td>${escapeHtml(student.class_name)}</td>
        <td><code>${escapeHtml(student.student_code)}</code></td>
        <td class="student-name-cell"><span class="roster-status ${assessed ? "assessed" : ""}">${assessed ? `已评估 ${Number(student.coverage) || 0}%` : "待评估"}</span><small>${assessed ? escapeHtml(student.assessment_date || formatDateTime(student.assessment_updated_at)) : "尚无评估"}</small></td>
        <td><span class="care-count ${dueGoals ? "due" : ""}">${activeGoals}项执行中</span>${dueGoals ? `<small class="care-due">${dueGoals}项待复核</small>` : ""}</td>
        <td>${student.last_intervention_date ? escapeHtml(student.last_intervention_date) : "—"}</td>
        <td><div class="table-action-group"><button class="table-action" type="button" data-student-profile-id="${escapeHtml(student.id)}">学生主页</button>${assessmentAction}</div></td>
      </tr>`;
  }).join("");
}

function scoreClass(value) {
  const score = Number(value);
  return Number.isFinite(score) && score < 2.5 ? "low" : "";
}

function renderRecords() {
  const query = recordSearch.value.trim().toLowerCase();
  const records = (summary?.records || []).filter((row) => [row.student_name, row.class_name, row.student_code, row.primary_need, row.assessment_date, row.owner_name]
    .join(" ").toLowerCase().includes(query));
  document.getElementById("teamRecordEmpty").hidden = records.length > 0;
  recordTableBody.innerHTML = records.map((row) => `
    <tr>
      <td class="student-name-cell"><strong>${escapeHtml(row.student_name || row.student_code)}</strong>${row.student_name ? `<small>${escapeHtml(row.student_code)}</small>` : ""}</td>
      <td>${escapeHtml(row.class_name || "—")}</td>
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
    ? invites.map((invite) => `<div class="pending-item"><strong>邀请码尾号 ${escapeHtml(invite.code_hint)}</strong><span>${escapeHtml(invite.roleLabel)} · ${escapeHtml(formatDateTime(invite.expires_at))} 到期</span></div>`).join("")
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
  "assessment.delete": "删除评估档案",
  "student.roster_import": "导入学生名单",
  "student.profile_view": "查看学生康复档案",
  "student.create": "新增学生",
  "student.update": "更新学生名单信息",
  "student.archive": "归档学生",
  "goal.create": "新增康复目标",
  "goal.update": "更新康复目标",
  "intervention.create": "新增干预记录",
  "intervention.delete": "删除误录干预记录"
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
  document.getElementById("addTeamStudentBtn").hidden = !isAdmin;
  renderMetrics(summary.metrics || {});
  renderRoster();
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

function detailList(title, values, ordered = true) {
  const items = Array.isArray(values) && values.length ? values : ["暂无"];
  const tag = ordered ? "ol" : "ul";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><${tag}>${items.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</${tag}></section>`;
}

function renderRecordDetail(row) {
  const record = row.assessment || {};
  const analysis = row.analysis || {};
  const domains = Object.values(analysis.domainScores || {}).sort((a, b) => Number(a.score) - Number(b.score));
  const versions = row.versions || [];
  document.getElementById("teamRecordDialogTitle").textContent = `${row.student_name || row.student_code} · 感觉统合功能评估`;
  document.getElementById("teamRecordDetail").innerHTML = `
    <div class="team-record-meta">
      <div><span>学生姓名</span><strong>${escapeHtml(row.student_name || "—")}</strong></div>
      <div><span>班级</span><strong>${escapeHtml(row.class_name || "—")}</strong></div>
      <div><span>年级</span><strong>${escapeHtml(row.grade_name || "—")}</strong></div>
      <div><span>学年</span><strong>${escapeHtml(row.school_year || "—")}</strong></div>
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
    ${detailList("阶段康复目标", analysis.goals)}
    ${detailList("干预与环境支持建议", analysis.strategies)}
    ${detailList("安全与解释提醒", analysis.alerts)}
    <section class="detail-section"><h3>版本记录</h3><div class="version-list">${versions.map((version) => `<span>v${version.version} · ${escapeHtml(version.changed_by_name || "成员")} · ${escapeHtml(formatDateTime(version.created_at))}</span>`).join("")}</div></section>`;
}

async function startRosterAssessment(studentId) {
  const student = (summary?.students || []).find((row) => row.id === studentId);
  if (!student) return;
  try {
    let record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `record-${Date.now().toString(36)}`,
      studentName: student.student_name,
      studentCode: student.student_code,
      className: student.class_name,
      organizationName: summary.team.name,
      assessmentDate: new Date().toISOString().slice(0, 10),
      domains: {}
    };
    if (student.assessment_id) {
      const existing = await api(`/api/team/records/${encodeURIComponent(student.assessment_id)}`);
      record = {
        ...existing.assessment,
        id: existing.client_record_id,
        studentName: student.student_name,
        studentCode: student.student_code,
        className: student.class_name,
        organizationName: summary.team.name
      };
    }
    sessionStorage.setItem(TEAM_RECORD_TRANSFER_KEY, JSON.stringify(record));
    location.href = "./index.html?source=team&new=1";
  } catch (error) {
    showToast(error.message);
  }
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
    studentName: currentRecord.student_name || currentRecord.assessment.studentName || "",
    className: currentRecord.class_name || currentRecord.assessment.className || "",
    organizationName: summary?.team?.name || "",
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

function todayDate() {
  return localDateAfter(0);
}

function localDateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAfter(days) {
  return localDateAfter(days);
}

function setProfileTab(name) {
  document.querySelectorAll("[data-profile-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.profileTab === name));
  document.querySelectorAll("[data-profile-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.profilePanel === name));
}

function renderProfileTrend(points) {
  const container = document.getElementById("profileTrendChart");
  const values = (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point.score)) && Number(point.score) >= 1 && Number(point.score) <= 5)
    .slice(-8);
  if (!values.length) {
    container.innerHTML = '<div class="team-empty">完成首次评估后显示趋势</div>';
    return;
  }
  const width = Math.max(300, Math.min(720, container.clientWidth || 720));
  const height = 210;
  const left = 42;
  const right = 18;
  const top = 14;
  const bottom = 36;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index) => left + (values.length === 1 ? chartWidth / 2 : index / (values.length - 1) * chartWidth);
  const y = (score) => top + (5 - score) / 4 * chartHeight;
  const grid = [1, 2, 3, 4, 5].map((score) => `<line class="trend-grid-line" x1="${left}" y1="${y(score)}" x2="${width - right}" y2="${y(score)}"></line><text class="trend-axis-label" x="${left - 14}" y="${y(score) + 3}" text-anchor="middle">${score}</text>`).join("");
  const polyline = values.map((point, index) => `${x(index)},${y(Number(point.score))}`).join(" ");
  const pointNodes = values.map((point, index) => {
    const date = String(point.assessmentDate || "");
    const label = date.length >= 10 ? date.slice(5) : date;
    return `<g><circle class="trend-point" cx="${x(index)}" cy="${y(Number(point.score))}" r="5"><title>${escapeHtml(date)} · ${Number(point.score).toFixed(1)}分 · v${Number(point.version) || 1}</title></circle><text class="trend-axis-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${escapeHtml(label)}</text></g>`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="学生历次综合评估分数趋势">${grid}<polyline class="trend-line" points="${polyline}"></polyline>${pointNodes}</svg>`;
}

function renderProfileReminders(reminders) {
  const rows = Array.isArray(reminders) ? reminders : [];
  document.getElementById("profileReminderCount").textContent = String(rows.length);
  document.getElementById("profileReminderList").innerHTML = rows.length
    ? rows.map((reminder) => {
        const status = reminder.status === "overdue" ? "已逾期" : reminder.status === "today" ? "今天复核" : "7日内复核";
        return `<div class="profile-reminder ${escapeHtml(reminder.status)}"><i></i><div><strong>${escapeHtml(reminder.title)}</strong><span>${escapeHtml(status)}</span></div><time>${escapeHtml(reminder.reviewDate)}</time></div>`;
      }).join("")
    : '<div class="team-empty">目前没有近期复核提醒</div>';
}

function renderProfileDomains(latestAssessment) {
  const rows = Object.values(latestAssessment?.analysis?.domainScores || {}).sort((left, right) => Number(left.score) - Number(right.score));
  document.getElementById("profileDomainList").innerHTML = rows.length
    ? rows.map((domain) => {
        const score = Number(domain.score) || 0;
        return `<div class="profile-domain-row"><span title="${escapeHtml(domain.title)}">${escapeHtml(domain.title)}</span><div class="domain-track"><i style="width:${Math.max(0, Math.min(100, score / 5 * 100))}%"></i></div><strong>${score.toFixed(1)}</strong></div>`;
      }).join("")
    : '<div class="team-empty">尚无可显示的领域评估结果</div>';
}

function renderProfileInsights(latestAssessment) {
  const analysis = latestAssessment?.analysis || {};
  const priorityItems = [
    ...(Array.isArray(analysis.strengths) ? analysis.strengths.slice(0, 2).map((item) => `优势：${item}`) : []),
    ...(Array.isArray(analysis.needs) ? analysis.needs.slice(0, 3).map((item) => `需要：${item}`) : [])
  ];
  const strategies = Array.isArray(analysis.strategies) ? analysis.strategies.slice(0, 4) : [];
  document.getElementById("profileAnalysisSummary").textContent = analysis.summary || "尚无有效摘要，建议先完成多情境功能性观察。";
  document.getElementById("profilePriorityNeeds").innerHTML = (priorityItems.length ? priorityItems : ["尚未形成优势与优先需要分析"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  document.getElementById("profileStrategyList").innerHTML = (strategies.length ? strategies : ["尚未形成干预建议"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderProfileGoals() {
  const goals = currentProfile?.goals || [];
  const canEdit = currentProfile?.capabilities?.canEdit;
  document.getElementById("profileGoalList").innerHTML = goals.length
    ? goals.map((goal) => {
        const reviewState = goal.status === "active" && goal.review_date < todayDate() ? "已逾期" : `复核 ${goal.review_date}`;
        const actions = canEdit ? `<div class="goal-actions"><div class="table-action-group"><button class="table-action" type="button" data-log-goal-id="${escapeHtml(goal.id)}">记录干预</button><button class="table-action" type="button" data-edit-goal-id="${escapeHtml(goal.id)}">编辑</button></div></div>` : "";
        return `<article class="goal-item priority-${escapeHtml(goal.priority)} status-${escapeHtml(goal.status)}">
          <div><h4>${escapeHtml(goal.title)}</h4><p>${escapeHtml(goal.success_criteria)}</p><div class="goal-meta"><span>${escapeHtml(goalPriorityLabels[goal.priority] || goal.priority)}</span><span>基线 ${goal.baseline_level}级 → 目标 ${goal.target_level}级</span><span>${escapeHtml(reviewState)}</span><span>${escapeHtml(goal.updated_by_name || goal.created_by_name || "")}</span></div></div>
          <div class="goal-progress"><span>${escapeHtml(goalStatusLabels[goal.status] || goal.status)}</span><strong>${Number(goal.progress) || 0}%</strong><div class="domain-track"><i style="width:${Math.max(0, Math.min(100, Number(goal.progress) || 0))}%"></i></div></div>
          ${actions}
        </article>`;
      }).join("")
    : '<div class="team-empty">尚未建立阶段康复目标</div>';
}

function renderProfileInterventions() {
  const rows = currentProfile?.interventions || [];
  const canEdit = currentProfile?.capabilities?.canEdit;
  document.getElementById("profileInterventionList").innerHTML = rows.length
    ? rows.map((row) => `<article class="intervention-item">
        <div class="intervention-date"><strong>${escapeHtml(row.session_date)}</strong><span>${Number(row.duration_minutes) || 0}分钟</span></div>
        <div class="intervention-content"><h4>${escapeHtml(row.goal_title || "一般功能干预")}</h4><p>${escapeHtml(row.note)}</p>${row.next_step ? `<p class="next-step"><strong>下次调整：</strong>${escapeHtml(row.next_step)}</p>` : ""}<div class="intervention-meta"><span>${escapeHtml(settingLabels[row.setting] || row.setting)}</span><span>${escapeHtml(observerLabels[row.observer_type] || row.observer_type)}</span><span>${row.support_level}级 · ${escapeHtml(supportLabels[row.support_level] || "")}</span><span>${escapeHtml(responseLabels[row.response_level] || row.response_level)}</span><span>${escapeHtml(row.created_by_name || "")}</span></div></div>
        ${canEdit ? `<button class="table-action" type="button" data-delete-intervention-id="${escapeHtml(row.id)}">删除误录</button>` : ""}
      </article>`).join("")
    : '<div class="team-empty">尚无干预记录</div>';
}

function renderProfileAssessments() {
  const points = [...(currentProfile?.assessmentPoints || [])].reverse();
  document.getElementById("profileAssessmentTimeline").innerHTML = points.length
    ? points.map((point) => `<article class="assessment-timeline-item"><div><strong>${escapeHtml(point.assessmentDate)}</strong><span>${escapeHtml(formatDateTime(point.createdAt))}</span></div><div><strong>${point.score == null ? "尚无综合分" : `${Number(point.score).toFixed(1)}分`}</strong><span>完成度 ${Number(point.coverage) || 0}% · v${Number(point.version) || 1} · ${escapeHtml(point.changedByName || "团队成员")}</span></div><button class="table-action" type="button" data-profile-record-id="${escapeHtml(point.assessmentId)}">查看评估</button></article>`).join("")
    : '<div class="team-empty">尚无评估历史</div>';
}

function renderCurrentProfile({ resetTab = false } = {}) {
  if (!currentProfile) return;
  const { student, metrics = {}, latestAssessment, capabilities = {} } = currentProfile;
  const latestScore = latestAssessment?.analysis?.average;
  document.getElementById("studentProfileCode").textContent = `学生康复档案 · ${student.student_code}`;
  document.getElementById("studentProfileTitle").textContent = student.student_name;
  document.getElementById("studentProfileSubtitle").textContent = [student.class_name, student.grade_name, student.school_year].filter(Boolean).join(" · ");
  document.getElementById("profileLatestScore").textContent = latestScore == null ? "—" : Number(latestScore).toFixed(1);
  document.getElementById("profileLatestDate").textContent = latestAssessment?.assessment?.assessmentDate || "尚无评估";
  document.getElementById("profileAssessmentCount").textContent = String(Number(metrics.assessmentCount) || 0);
  document.getElementById("profileActiveGoalCount").textContent = String(Number(metrics.activeGoalCount) || 0);
  document.getElementById("profileDueGoalCount").textContent = String(Number(metrics.dueGoalCount) || 0);
  document.getElementById("editStudentBtn").hidden = !capabilities.canManageRoster;
  document.getElementById("addGoalBtn").hidden = !capabilities.canEdit;
  document.getElementById("addInterventionBtn").hidden = !capabilities.canEdit;
  document.getElementById("startProfileAssessmentBtn").hidden = !capabilities.canEdit;
  document.getElementById("startProfileAssessmentBtn").textContent = latestAssessment ? "继续评估" : "开始评估";
  renderProfileTrend(currentProfile.assessmentPoints);
  renderProfileReminders(currentProfile.reminders);
  renderProfileDomains(latestAssessment);
  renderProfileInsights(latestAssessment);
  renderProfileGoals();
  renderProfileInterventions();
  renderProfileAssessments();
  if (resetTab) setProfileTab("overview");
}

async function openStudentProfile(studentId) {
  try {
    currentProfile = await api(`/api/team/students/${encodeURIComponent(studentId)}`);
    renderCurrentProfile({ resetTab: true });
    studentProfileDialog.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshCurrentProfile() {
  if (!currentProfile?.student?.id) return;
  currentProfile = await api(`/api/team/students/${encodeURIComponent(currentProfile.student.id)}`);
  renderCurrentProfile();
}

function defaultSchoolYear() {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function openStudentForm(student = null) {
  const form = document.getElementById("studentForm");
  form.reset();
  document.getElementById("studentFormError").textContent = "";
  document.getElementById("studentFormId").value = student?.id || "";
  document.getElementById("studentFormTitle").textContent = student ? "编辑学生" : "新增学生";
  document.getElementById("studentFormName").value = student?.student_name || "";
  document.getElementById("studentFormClass").value = student?.class_name || "";
  document.getElementById("studentFormCode").value = student?.student_code || "";
  document.getElementById("studentFormGrade").value = student?.grade_name || "";
  document.getElementById("studentFormYear").value = student?.school_year || defaultSchoolYear();
  document.getElementById("studentFormOrder").value = student?.roster_order ?? 0;
  document.getElementById("archiveStudentBtn").hidden = !student;
  studentFormDialog.showModal();
}

function openGoalForm(goal = null) {
  document.getElementById("goalForm").reset();
  document.getElementById("goalFormError").textContent = "";
  document.getElementById("goalFormId").value = goal?.id || "";
  document.getElementById("goalDialogTitle").textContent = goal ? "编辑康复目标" : "新增康复目标";
  document.getElementById("goalTitle").value = goal?.title || "";
  document.getElementById("goalCriteria").value = goal?.success_criteria || "";
  document.getElementById("goalBaseline").value = String(goal?.baseline_level || 1);
  document.getElementById("goalTarget").value = String(goal?.target_level || 3);
  document.getElementById("goalPriority").value = goal?.priority || "medium";
  document.getElementById("goalProgress").value = String(goal?.progress || 0);
  document.getElementById("goalProgressOutput").textContent = `${Number(goal?.progress) || 0}%`;
  document.getElementById("goalStartDate").value = goal?.start_date || todayDate();
  document.getElementById("goalReviewDate").value = goal?.review_date || dateAfter(56);
  document.getElementById("goalStatus").value = goal?.status || "active";
  goalDialog.showModal();
}

function openInterventionForm(goalId = "") {
  document.getElementById("interventionForm").reset();
  document.getElementById("interventionFormError").textContent = "";
  document.getElementById("interventionDate").value = todayDate();
  document.getElementById("interventionDuration").value = "30";
  const goals = (currentProfile?.goals || []).filter((goal) => ["active", "paused"].includes(goal.status));
  document.getElementById("interventionGoal").innerHTML = '<option value="">未关联具体目标</option>' + goals.map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.title)}</option>`).join("");
  document.getElementById("interventionGoal").value = goalId;
  interventionDialog.showModal();
}

async function exportProgressDocx() {
  if (!currentProfile) return;
  const button = document.getElementById("exportProgressDocxBtn");
  button.disabled = true;
  button.textContent = "正在生成…";
  try {
    const doc = buildStudentProgressDocument(currentProfile, window.docx);
    const blob = await window.docx.Packer.toBlob(doc);
    downloadBlob(blob, studentProgressFilename(currentProfile));
    showToast("阶段康复档案已生成");
  } catch {
    showToast("阶段档案生成失败，请刷新后重试");
  } finally {
    button.disabled = false;
    button.textContent = "导出阶段档案";
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

document.getElementById("studentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  const errorBox = document.getElementById("studentFormError");
  errorBox.textContent = "";
  submit.disabled = true;
  try {
    const id = document.getElementById("studentFormId").value;
    await api("/api/team/students", {
      method: "POST",
      body: JSON.stringify({
        id,
        studentName: document.getElementById("studentFormName").value,
        className: document.getElementById("studentFormClass").value,
        studentCode: document.getElementById("studentFormCode").value,
        gradeName: document.getElementById("studentFormGrade").value,
        schoolYear: document.getElementById("studentFormYear").value,
        rosterOrder: Number(document.getElementById("studentFormOrder").value)
      })
    });
    studentFormDialog.close();
    await loadSummary({ quiet: true });
    if (id && currentProfile?.student?.id === id) await refreshCurrentProfile();
    showToast(id ? "学生信息已更新" : "学生已加入授权名单");
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("archiveStudentBtn").addEventListener("click", async () => {
  const student = currentProfile?.student;
  const id = document.getElementById("studentFormId").value;
  if (!id || !confirm(`确认归档 ${student?.student_name || "该学生"}？其评估历史会保留，执行中目标将暂停。`)) return;
  const button = document.getElementById("archiveStudentBtn");
  button.disabled = true;
  try {
    await api(`/api/team/students/${encodeURIComponent(id)}`, { method: "DELETE" });
    studentFormDialog.close();
    if (studentProfileDialog.open) studentProfileDialog.close();
    currentProfile = null;
    await loadSummary({ quiet: true });
    showToast("学生已归档");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("goalForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentProfile) return;
  const submit = event.submitter;
  const errorBox = document.getElementById("goalFormError");
  const goalId = document.getElementById("goalFormId").value;
  errorBox.textContent = "";
  submit.disabled = true;
  try {
    await api(goalId ? `/api/team/goals/${encodeURIComponent(goalId)}` : `/api/team/students/${encodeURIComponent(currentProfile.student.id)}/goals`, {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("goalTitle").value,
        successCriteria: document.getElementById("goalCriteria").value,
        baselineLevel: Number(document.getElementById("goalBaseline").value),
        targetLevel: Number(document.getElementById("goalTarget").value),
        priority: document.getElementById("goalPriority").value,
        progress: Number(document.getElementById("goalProgress").value),
        startDate: document.getElementById("goalStartDate").value,
        reviewDate: document.getElementById("goalReviewDate").value,
        status: document.getElementById("goalStatus").value
      })
    });
    goalDialog.close();
    await refreshCurrentProfile();
    await loadSummary({ quiet: true });
    setProfileTab("goals");
    showToast(goalId ? "康复目标已更新" : "康复目标已建立");
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("interventionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentProfile) return;
  const submit = event.submitter;
  const errorBox = document.getElementById("interventionFormError");
  errorBox.textContent = "";
  submit.disabled = true;
  try {
    await api(`/api/team/students/${encodeURIComponent(currentProfile.student.id)}/interventions`, {
      method: "POST",
      body: JSON.stringify({
        sessionDate: document.getElementById("interventionDate").value,
        durationMinutes: Number(document.getElementById("interventionDuration").value),
        goalId: document.getElementById("interventionGoal").value,
        setting: document.getElementById("interventionSetting").value,
        observerType: document.getElementById("interventionObserver").value,
        supportLevel: Number(document.getElementById("interventionSupport").value),
        responseLevel: document.getElementById("interventionResponse").value,
        note: document.getElementById("interventionNote").value,
        nextStep: document.getElementById("interventionNextStep").value
      })
    });
    interventionDialog.close();
    await refreshCurrentProfile();
    await loadSummary({ quiet: true });
    setProfileTab("interventions");
    showToast("干预记录已保存");
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("studentProfileTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-profile-tab]");
  if (button) setProfileTab(button.dataset.profileTab);
});

document.getElementById("profileGoalList").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-goal-id]");
  if (editButton) {
    const goal = (currentProfile?.goals || []).find((item) => item.id === editButton.dataset.editGoalId);
    if (goal) openGoalForm(goal);
    return;
  }
  const logButton = event.target.closest("[data-log-goal-id]");
  if (logButton) openInterventionForm(logButton.dataset.logGoalId);
});

document.getElementById("profileInterventionList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-intervention-id]");
  if (!button || !confirm("确认删除这条误录的干预记录？此操作会写入审计日志。")) return;
  button.disabled = true;
  try {
    await api(`/api/team/interventions/${encodeURIComponent(button.dataset.deleteInterventionId)}`, { method: "DELETE" });
    await refreshCurrentProfile();
    await loadSummary({ quiet: true });
    setProfileTab("interventions");
    showToast("误录记录已删除");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

document.getElementById("profileAssessmentTimeline").addEventListener("click", (event) => {
  const button = event.target.closest("[data-profile-record-id]");
  if (!button) return;
  studentProfileDialog.close();
  openRecord(button.dataset.profileRecordId);
});

document.getElementById("addTeamStudentBtn").addEventListener("click", () => openStudentForm());
document.getElementById("editStudentBtn").addEventListener("click", () => openStudentForm(currentProfile?.student));
document.getElementById("addGoalBtn").addEventListener("click", () => openGoalForm());
document.getElementById("addInterventionBtn").addEventListener("click", () => openInterventionForm());
document.getElementById("startProfileAssessmentBtn").addEventListener("click", () => currentProfile && startRosterAssessment(currentProfile.student.id));
document.getElementById("exportProgressDocxBtn").addEventListener("click", exportProgressDocx);
document.getElementById("goalProgress").addEventListener("input", (event) => {
  document.getElementById("goalProgressOutput").textContent = `${event.target.value}%`;
});

document.querySelectorAll(".close-student-profile").forEach((button) => button.addEventListener("click", () => studentProfileDialog.close()));
document.querySelectorAll(".close-student-form").forEach((button) => button.addEventListener("click", () => studentFormDialog.close()));
document.querySelectorAll(".close-goal-dialog").forEach((button) => button.addEventListener("click", () => goalDialog.close()));
document.querySelectorAll(".close-intervention-dialog").forEach((button) => button.addEventListener("click", () => interventionDialog.close()));

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
    await verifyInviteCode();
    await api("/api/team/register", {
      method: "POST",
      body: JSON.stringify({
        inviteCode: document.getElementById("registerInviteCode").value,
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
    submit.textContent = "使用邀请码注册";
  }
});

document.getElementById("showRegisterBtn").addEventListener("click", () => {
  showRegister();
  document.getElementById("registerInviteCode").focus();
});

document.getElementById("verifyInviteCodeBtn").addEventListener("click", async () => {
  const errorBox = document.getElementById("registerError");
  errorBox.textContent = "";
  try {
    await verifyInviteCode();
    showToast("邀请码有效");
  } catch (error) {
    errorBox.textContent = error.message;
  }
});

document.getElementById("registerInviteCode").addEventListener("input", (event) => {
  event.target.value = formatInviteCodeInput(event.target.value);
  document.getElementById("inviteSummary").textContent = "输入完成后验证邀请码。";
  document.getElementById("registerError").textContent = "";
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
rosterSearch.addEventListener("input", renderRoster);
rosterClassFilter.addEventListener("change", renderRoster);
rosterTableBody.addEventListener("click", (event) => {
  const profileButton = event.target.closest("[data-student-profile-id]");
  if (profileButton) {
    openStudentProfile(profileButton.dataset.studentProfileId);
    return;
  }
  const startButton = event.target.closest("[data-start-student-id]");
  if (startButton) {
    startRosterAssessment(startButton.dataset.startStudentId);
    return;
  }
  const recordButton = event.target.closest("[data-team-record-id]");
  if (recordButton) openRecord(recordButton.dataset.teamRecordId);
});
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
        role: document.getElementById("inviteRole").value
      })
    });
    document.getElementById("inviteCodeOutput").value = result.invite.code;
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
  copyText(document.getElementById("inviteCodeOutput").value, "邀请码已复制");
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

[teamRecordDialog, accountDialog, studentProfileDialog, studentFormDialog, goalDialog, interventionDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

loadSession();
