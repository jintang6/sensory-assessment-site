import { analyzeAssessment, compactAssessmentAnalysis, deidentifyAssessmentRecord } from "./assessment-engine.js";
import { assessmentReportFilename, buildAssessmentReportDocument, loadReportFontData } from "./report-docx.js";
import { domains, domainCounts } from "./assessment-domains.js";

const STORAGE_KEY = "sensoryAssessmentRecords.v2";
const DRAFT_KEY = "sensoryAssessmentDraft.v2";
const LEGACY_STORAGE_KEY = "sensoryIntegrationRecords.v1";
const LEGACY_DRAFT_KEY = "sensoryIntegrationDraft.v1";
const CLOUD_SETTINGS_KEY = "sensoryCloudSettings.v1";
const TEAM_RECORD_TRANSFER_KEY = "sensoryTeamOpenRecord.v1";
const AUTO_SAVE_DELAY = 650;
const AUTO_SYNC_IDLE_DELAY = 4_000;
const MIN_CLOUD_SYNC_INTERVAL = 30_000;
const ASSESSMENT_CATALOG_VERSION = 6;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IS_WECHAT = /MicroMessenger/i.test(navigator.userAgent);
const API_ORIGIN = location.hostname === "sensory-assessment-site.pages.dev" || location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? ""
  : "https://sensory-assessment-site.pages.dev";

const scoreLevels = {
  1: {
    label: "全程协助",
    short: "高支持",
    className: "low",
    range: "完成少于25%",
    performance: "难以独立启动或维持任务，需持续手把手或身体协助完成。"
  },
  2: {
    label: "大量协助",
    short: "较高支持",
    className: "low",
    range: "完成25-49%",
    performance: "能完成少量步骤，仍需大量身体协助、示范或反复提示。"
  },
  3: {
    label: "部分提示",
    short: "发展中",
    className: "mid",
    range: "完成50-74%",
    performance: "能完成主要步骤，需要间歇性的身体、示范、视觉或语言提示。"
  },
  4: {
    label: "少量提示",
    short: "较稳定",
    className: "high",
    range: "完成75-89%",
    performance: "大部分时间能正确完成，仅需少量或偶发提示。"
  },
  5: {
    label: "独立稳定",
    short: "稳定",
    className: "high",
    range: "完成至少90%",
    performance: "在当前自然情境中可独立、稳定完成，且表现能够重复。"
  }
};

const impactLabels = ["无明显影响", "轻度影响", "中度影响", "显著影响"];
const impactDescriptions = [
  "存在相关表现，但不会妨碍学生开始、继续或完成课堂、生活和活动任务。",
  "偶尔减慢、分心或回避，经一次简单提醒或环境调整后通常能继续。",
  "经常中断任务，需要重复提示、较多协助或明显调整环境才能继续。",
  "多数时候难以开始、继续或完成活动，参与受到明显限制，或已经涉及安全风险。"
];

const professionalModules = [
  { id: "si", label: "感觉统合", short: "SI", description: "感觉调节、身体觉与活动状态" },
  { id: "ot", label: "作业治疗", short: "OT", description: "自理、操作与任务参与" },
  { id: "st", label: "言语语言", short: "ST", description: "语言、沟通与口腔参与" },
  { id: "pt", label: "运动功能", short: "PT", description: "姿势、移动、平衡与耐力" }
];

const professionalPageCopy = {
  si: {
    title: "知衡 · 感觉统合功能评估",
    product: "感觉统合功能评估",
    subtitle: "特殊教育学校 · 感觉调节、身体觉与活动状态",
    intro: "<strong>感觉统合学校场景功能观察</strong>，关注感觉调节、身体觉、活动转换及真实参与表现。",
    heading: "感觉统合与活动状态评估",
    description: "由感统主评人员完成本模块；需要跨专业解释的表现可留给OT、ST或运动/PT入口继续评估。"
  },
  ot: {
    title: "知衡 · 作业治疗功能评估",
    product: "作业治疗功能评估",
    subtitle: "特殊教育学校 · 自理、操作、动作计划与任务参与",
    intro: "<strong>作业治疗学校场景功能观察</strong>，关注学生完成课堂、生活自理和操作任务所需的能力与支持。",
    heading: "作业治疗与日常活动评估",
    description: "由OT主评人员完成本模块，重点记录任务质量、提示等级、环境条件和活动参与结果。"
  },
  st: {
    title: "知衡 · 言语语言功能评估",
    product: "言语语言功能评估",
    subtitle: "特殊教育学校 · 语言理解、表达、功能沟通与互动",
    intro: "<strong>言语语言学校场景功能观察</strong>，关注学生在真实活动中的理解、表达、沟通修复与辅助沟通使用。",
    heading: "言语语言与功能沟通评估",
    description: "由ST主评人员完成本模块；口腔进食项目涉及吞咽安全时，应先进行相应专业转介。"
  },
  pt: {
    title: "知衡 · 运动功能评估",
    product: "运动功能评估",
    subtitle: "特殊教育学校 · 姿势、移动、平衡与校园活动耐力",
    intro: "<strong>运动/PT学校场景功能观察</strong>，关注学生在校园真实路线和活动中的姿势、移动、安全与耐力。",
    heading: "运动功能与校园移动评估",
    description: "由运动/PT主评人员完成本模块；出现疼痛、突然退步或明显心肺异常时，应暂停并先行医学评估。"
  }
};

const requestedModulePage = new URLSearchParams(location.search).get("module") || document.body.dataset.modulePage || "si";
const activeModulePage = professionalPageCopy[requestedModulePage] ? requestedModulePage : "si";

const form = document.getElementById("assessmentForm");
const domainList = document.getElementById("domainList");
const recordList = document.getElementById("recordList");
const toast = document.getElementById("toast");
const searchRecords = document.getElementById("searchRecords");
const cloudToggle = document.getElementById("cloudSyncToggle");
const consentDialog = document.getElementById("cloudConsentDialog");
const methodDialog = document.getElementById("methodDialog");
const shareReportDialog = document.getElementById("shareReportDialog");
const feedbackDialog = document.getElementById("feedbackDialog");
const appHeader = document.querySelector(".app-header");

let records = [];
let activeId = null;
let draftTimer = null;
let cloudSyncTimer = null;
let toastTimer = null;
let teamSession = null;
let cloudSettings = { enabled: true, deidentified: true, consentAt: "", lastSyncedAt: "" };
let lastAnalysis = null;
let lastCloudSyncAt = 0;
let lastSyncedSignature = "";
let preparedReportFile = null;
let preparedReportLink = null;
let appHeaderObserver = null;
let measuredAppHeaderHeight = 0;
let isLoggingOut = false;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTeamStudentCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) && /[A-Z]/.test(code) && /\d/.test(code) ? code : "";
}

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
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function scopedStorageKey(key) {
  return teamSession?.user?.id ? `${key}.${teamSession.user.id}` : key;
}

function readScopedStorage(key, fallback, { adminLegacy = false } = {}) {
  const scoped = readJsonStorage(scopedStorageKey(key), null);
  if (scoped !== null) return scoped;
  if (adminLegacy && teamSession?.user?.role === "admin") return readJsonStorage(key, fallback);
  return fallback;
}

function migrateLegacyRecord(record) {
  const mapping = {
    tactile: ["tactile"],
    vestibular: ["vestibular", "postural"],
    proprioceptive: ["proprioceptive"],
    praxis: ["bilateral", "praxis"],
    fineMotor: ["fineMotor"],
    visualAuditory: ["auditory", "visual"],
    oral: ["oral"],
    emotion: ["regulation"],
    dailyLife: ["participation"]
  };
  const nextDomains = {};
  Object.entries(mapping).forEach(([legacyId, currentIds]) => {
    const legacy = record.domains?.[legacyId];
    if (!legacy) return;
    const score = Math.max(1, Math.min(5, Number(legacy.score) || 3));
    currentIds.forEach((currentId) => {
      const domain = domains.find((item) => item.id === currentId);
      if (!domain) return;
      nextDomains[currentId] = {
        professional: domain.professional,
        items: Object.fromEntries(domain.items.map((item) => [item.id, score])),
        impact: score <= 2 ? 2 : score === 3 ? 1 : 0,
        support: score <= 2 ? "大量协助" : score === 3 ? "部分提示" : "少量提示",
        note: legacy.note || ""
      };
    });
  });
  return {
    id: record.id || uid(),
    studentName: record.studentName || "",
    studentCode: record.studentCode || "",
    gender: record.gender || "",
    age: record.age || "",
    className: record.className || "",
    organizationName: record.organizationName || "",
    primaryNeed: record.primaryNeed === "智力发育迟缓" ? "全面发育迟缓/智力障碍" : (record.primaryNeed || "全面发育迟缓/智力障碍"),
    assessmentDate: record.assessmentDate || today(),
    evaluator: record.evaluator || "",
    reviewer: record.reviewer || "",
    setting: record.setting || "综合观察",
    cooperation: record.cooperation || "状态波动，需结合多次观察",
    communicationMode: "口语沟通",
    mobility: "独立移动",
    observationSources: [],
    background: record.background || "",
    medicalPrecautions: "",
    catalogVersion: ASSESSMENT_CATALOG_VERSION,
    domains: nextDomains,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    migratedFrom: "v1"
  };
}

function upgradeExpandedRecord(record) {
  if (!record || typeof record !== "object" || Number(record.catalogVersion) >= ASSESSMENT_CATALOG_VERSION) return record;
  const next = { ...record, domains: { ...(record.domains || {}) }, catalogVersion: ASSESSMENT_CATALOG_VERSION };
  const supportRank = { "自然情境独立": 0, "少量提示": 1, "部分提示": 2, "大量协助": 3, "全程协助": 4 };

  const mergeMapped = (sourceId, previousProfessional, targetId, itemMap) => {
    const source = next.domains[sourceId];
    if (!source || source.professional !== previousProfessional) return;
    const targetDefinition = domains.find((domain) => domain.id === targetId);
    if (!targetDefinition) return;
    const target = next.domains[targetId] || { professional: targetDefinition.professional, items: {}, impact: 0, support: "部分提示", note: "" };
    target.items = { ...(target.items || {}) };
    Object.entries(itemMap).forEach(([sourceItemId, targetItemId]) => {
      const score = Number(source.items?.[sourceItemId]);
      if (Number.isInteger(score) && score >= 1 && score <= 5 && target.items[targetItemId] == null) target.items[targetItemId] = score;
    });
    target.impact = Math.max(Number(target.impact) || 0, Number(source.impact) || 0);
    if ((supportRank[source.support] ?? 2) > (supportRank[target.support] ?? 2)) target.support = source.support;
    const sourceNote = String(source.note || "").trim();
    if (sourceNote && !String(target.note || "").includes(sourceNote)) target.note = [target.note, `旧版${moduleById(previousProfessional).short}记录：${sourceNote}`].filter(Boolean).join("\n");
    next.domains[targetId] = target;
  };

  mergeMapped("visual", "ot", "otVisualPerceptual", {
    discrimination: "visual_discrimination", visual_scan: "systematic_scan", spatial_relation: "spatial_relation"
  });
  mergeMapped("bilateral", "ot", "otBilateralPraxis", { midline: "cross_midline", helper_hand: "hand_roles" });
  mergeMapped("praxis", "ot", "otBilateralPraxis", {
    imitate: "imitate_action", idea: "motor_idea", sequence: "sequence_action", adjust_plan: "adapt_action"
  });
  mergeMapped("fineMotor", "ot", "otFineMotor", {
    grasp_release: "grasp_pattern", in_hand: "in_hand_manipulation", tool_use: "grasp_pattern"
  });
  mergeMapped("fineMotor", "ot", "otVisualMotor", { visual_motor: "copy_forms" });
  mergeMapped("participation", "ot", "otClassroomParticipation", { class_task: "task_persist" });
  mergeMapped("participation", "ot", "otPlayLeisure", { play_social: "shared_space" });
  mergeMapped("participation", "ot", "otAssistiveEnvironment", { generalization: "skill_generalization" });

  mergeMapped("oral", "st", "stFeedingSafety", { bite_chew: "chewing", mealtime_participation: "alert_position" });
  mergeMapped("receptiveExpressive", "st", "stReceptiveLanguage", {
    understand_familiar: "familiar_words", follow_steps: "multi_step", understand_questions: "questions"
  });
  mergeMapped("receptiveExpressive", "st", "stExpressiveLanguage", {
    express_needs: "express_needs", express_information: "describe_event"
  });
  mergeMapped("functionalCommunication", "st", "stFunctionalAAC", {
    initiate: "functions", choice_refusal: "functions", repair_message: "repair", generalize_communication: "partner_generalize"
  });
  mergeMapped("functionalCommunication", "st", "stSocialCommunication", { turn_taking: "conversation_turn" });

  mergeMapped("postural", "pt", "ptPostureAlignment", { seated_posture: "position_hold", antigravity: "trunk_control" });
  mergeMapped("postural", "pt", "ptBalanceProtection", {
    balance_reaction: "weight_shift", protective_response: "protective_step"
  });
  mergeMapped("grossMotorMobility", "pt", "ptTransfers", { position_transfer: "seat_transfer" });
  mergeMapped("grossMotorMobility", "pt", "ptMobility", { level_mobility: "level_route" });
  mergeMapped("grossMotorMobility", "pt", "ptStairsTerrain", { stairs: "stairs" });
  mergeMapped("grossMotorMobility", "pt", "ptCoordination", { run_jump_alt: "run_alternative", ball_object: "throw_catch" });
  mergeMapped("balanceEndurance", "pt", "ptBalanceProtection", {
    static_balance: "standing_balance", dynamic_balance: "dynamic_balance"
  });
  mergeMapped("balanceEndurance", "pt", "ptEndurance", {
    activity_endurance: "sustain_activity", body_safety: "pain_fatigue_report"
  });
  mergeMapped("balanceEndurance", "pt", "ptParticipation", { campus_route: "class_access" });

  [
    ["visual", "ot"], ["bilateral", "ot"], ["praxis", "ot"], ["fineMotor", "ot"], ["participation", "ot"],
    ["oral", "st"], ["receptiveExpressive", "st"], ["functionalCommunication", "st"],
    ["postural", "pt"], ["grossMotorMobility", "pt"], ["balanceEndurance", "pt"]
  ].forEach(([sourceId, previousProfessional]) => {
    if (next.domains[sourceId]?.professional === previousProfessional) delete next.domains[sourceId];
  });
  return next;
}

function loadRecords() {
  const current = readScopedStorage(STORAGE_KEY, [], { adminLegacy: true });
  if (Array.isArray(current) && current.length) {
    const upgraded = current.map(upgradeExpandedRecord);
    localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(upgraded));
    return upgraded;
  }
  const legacy = teamSession?.user?.role === "admin" ? readJsonStorage(LEGACY_STORAGE_KEY, []) : [];
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const migrated = legacy.map(migrateLegacyRecord);
  localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(migrated));
  return migrated;
}

function loadDraft() {
  const current = readScopedStorage(DRAFT_KEY, null, { adminLegacy: true });
  if (current) return upgradeExpandedRecord(current);
  const legacy = teamSession?.user?.role === "admin" ? readJsonStorage(LEGACY_DRAFT_KEY, null) : null;
  return legacy ? migrateLegacyRecord(legacy) : null;
}

function loadCloudSettings() {
  const value = readScopedStorage(CLOUD_SETTINGS_KEY, null, { adminLegacy: true });
  return value && typeof value === "object"
    ? { enabled: true, deidentified: true, consentAt: value.consentAt || new Date().toISOString(), lastSyncedAt: value.lastSyncedAt || "" }
    : { enabled: true, deidentified: true, consentAt: new Date().toISOString(), lastSyncedAt: "" };
}

function persistCloudSettings() {
  localStorage.setItem(scopedStorageKey(CLOUD_SETTINGS_KEY), JSON.stringify(cloudSettings));
}

function defaultDomainValue() {
  return { items: {}, impact: 0, support: "部分提示", note: "" };
}

function moduleById(id) {
  return professionalModules.find((module) => module.id === id) || professionalModules[0];
}

function defaultProfessionalAssessors(assessmentDate = today()) {
  return Object.fromEntries(professionalModules.map((module) => [module.id, { evaluator: "", assessmentDate }]));
}

function updateImpactDescription(domainId) {
  const select = document.getElementById(`${domainId}Impact`);
  const description = domainList.querySelector(`[data-impact-description="${domainId}"]`);
  if (!select || !description) return;
  const impact = Math.max(0, Math.min(3, Number(select.value) || 0));
  description.innerHTML = `<strong>${escapeHtml(impactLabels[impact])}</strong><span>${escapeHtml(impactDescriptions[impact])}</span>`;
}

function renderDomains() {
  const categoryLabels = {
    modulation: "感觉调节",
    sensorimotor: "感觉运动",
    participation: "调节与参与",
    occupation: "活动参与",
    performance: "作业表现技能",
    selfcare: "生活自理",
    communication: "沟通功能",
    speech: "言语功能",
    feeding: "进食安全筛查",
    movement: "运动功能"
  };
  const moduleSequence = Object.fromEntries(professionalModules.map((module) => [module.id, 0]));
  domainList.innerHTML = domains.map((domain) => {
    moduleSequence[domain.professional] += 1;
    const domainNumber = moduleSequence[domain.professional];
    return `
    <details class="domain-card" data-domain-card="${domain.id}" data-category="${domain.category}" data-professional="${domain.professional}">
      <summary class="domain-summary">
        <span class="domain-title-block">
          <span class="domain-number">${String(domainNumber).padStart(2, "0")}</span>
          <span>
            <h3>${escapeHtml(domain.title)} <i class="professional-tag">${escapeHtml(moduleById(domain.professional).short)}</i></h3>
            <p>${escapeHtml(moduleById(domain.professional).label)} · ${escapeHtml(categoryLabels[domain.category])} · ${escapeHtml(domain.scope)}</p>
          </span>
        </span>
        <span class="domain-score-summary">
          <span class="domain-average"><strong id="${domain.id}Average">—</strong><span id="${domain.id}Answered">0/${domain.items.length}项</span></span>
          <span class="domain-state" id="${domain.id}State">未评</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </summary>
      <div class="domain-body">
        <div class="domain-controls">
          <div class="domain-owner"><span>模块主评</span><strong data-domain-owner="${domain.professional}">未填写</strong></div>
          <div class="impact-control">
            <label for="${domain.id}Support">当前主要支持</label>
            <select id="${domain.id}Support" data-domain-support="${domain.id}">
              <option>全程协助</option>
              <option>大量协助</option>
              <option selected>部分提示</option>
              <option>少量提示</option>
              <option>自然情境独立</option>
            </select>
          </div>
          <div class="impact-control impact-participation-control">
            <label for="${domain.id}Impact">对课堂、生活和活动参与的影响</label>
            <select id="${domain.id}Impact" data-domain-impact="${domain.id}">
              ${impactLabels.map((label, impact) => `<option value="${impact}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="impact-description" data-impact-description="${domain.id}"></div>
        <p class="domain-validity-note">本领域共${domain.items.length}项，至少完成${domain.minimumItems}项才形成领域分；未观察项目保留“未评”。</p>
        <div class="item-table">
          ${domain.items.map((item) => `
            <div class="item-row">
              <div class="item-label">${escapeHtml(item.label)}<small>${escapeHtml(item.observe)}</small></div>
              <div class="rating-scale" data-domain="${domain.id}" data-item="${item.id}" data-value="">
                ${[1, 2, 3, 4, 5].map((score) => `<button class="rating-button" type="button" data-score="${score}" title="${score}分 · ${scoreLevels[score].label} · ${scoreLevels[score].range}" aria-label="${score}分，${scoreLevels[score].label}，${scoreLevels[score].range}" aria-pressed="false">${score}</button>`).join("")}
                <button class="rating-button na selected" type="button" data-score="" title="未评估" aria-label="未评估，不计分" aria-pressed="true">—</button>
              </div>
              <p class="rating-feedback" role="status" aria-live="polite" hidden></p>
            </div>
          `).join("")}
        </div>
        <div class="domain-note">
          <label for="${domain.id}Note">领域观察记录</label>
          <textarea id="${domain.id}Note" data-domain-note="${domain.id}" placeholder="记录具体任务、提示等级、持续时间、成功比例、调节反应和跨情境差异。"></textarea>
        </div>
      </div>
    </details>
  `;
  }).join("");
  domains.forEach((domain) => updateImpactDescription(domain.id));
}

function renderModuleCatalog(moduleId) {
  const catalogDomains = moduleId === "all" ? domains : domains.filter((domain) => domain.professional === moduleId);
  const title = document.getElementById("moduleCatalogTitle");
  const count = document.getElementById("moduleCatalogCount");
  const guidance = document.getElementById("moduleCatalogGuidance");
  const list = document.getElementById("moduleCatalogList");
  if (!title || !count || !guidance || !list) return;

  const itemCount = catalogDomains.reduce((sum, domain) => sum + domain.items.length, 0);
  title.textContent = moduleId === "all" ? "四专业完整领域" : `${moduleById(moduleId).label}评估目录`;
  count.textContent = `${catalogDomains.length}个领域 · ${itemCount}项观察`;
  guidance.textContent = moduleId === "all"
    ? "四个专业由各自主评人员完成；点击领域名称可直接定位，未评模块不会被解释为没有需要。"
    : `每个领域至少完成60%的项目才形成领域分；${moduleById(moduleId).label}的未观察项目请保留“未评”。`;
  const moduleIndexes = Object.fromEntries(professionalModules.map((module) => [module.id, 0]));
  list.innerHTML = catalogDomains.map((domain) => {
    const originalIndex = domains.filter((item) => item.professional === domain.professional).findIndex((item) => item.id === domain.id) + 1;
    moduleIndexes[domain.professional] += 1;
    const number = moduleId === "all" ? `${moduleById(domain.professional).short} ${String(originalIndex).padStart(2, "0")}` : String(moduleIndexes[domain.professional]).padStart(2, "0");
    return `<button type="button" data-jump-domain="${domain.id}"><span>${escapeHtml(number)}</span><b>${escapeHtml(domain.title)}</b></button>`;
  }).join("");
}

function updateRatingFeedback(scale) {
  const selectedScore = scale.dataset.value;
  scale.querySelectorAll(".rating-button").forEach((button) => {
    const isSelected = button.dataset.score === selectedScore;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  const feedback = scale.closest(".item-row")?.querySelector(".rating-feedback");
  if (!feedback) return;
  const level = scoreLevels[selectedScore];
  if (!level) {
    feedback.hidden = true;
    feedback.textContent = "";
    feedback.removeAttribute("data-score");
    return;
  }

  feedback.dataset.score = selectedScore;
  feedback.innerHTML = `<strong>${selectedScore}分 · ${escapeHtml(level.label)}（${escapeHtml(level.range)}）</strong><span>${escapeHtml(level.performance)}</span>`;
  feedback.hidden = false;
}

function collectData() {
  const observationSources = Array.from(form.querySelectorAll('input[name="observationSources"]:checked')).map((input) => input.value);
  const signedInEvaluator = teamSession?.user?.displayName || "";
  const assessmentDate = form.assessmentDate.value || today();
  const data = {
    id: activeId,
    studentName: form.studentName.value.trim(),
    studentCode: form.studentCode.value.trim(),
    gender: form.gender.value,
    age: form.age.value.trim(),
    className: form.className.value.trim(),
    organizationName: form.organizationName.value.trim(),
    primaryNeed: form.primaryNeed.value,
    assessmentDate,
    evaluator: form.evaluator.value.trim(),
    reviewer: form.reviewer.value.trim(),
    setting: form.setting.value,
    cooperation: form.cooperation.value,
    communicationMode: form.communicationMode.value,
    mobility: form.mobility.value,
    observationSources,
    background: form.background.value.trim(),
    medicalPrecautions: form.medicalPrecautions.value.trim(),
    professionalAssessors: Object.fromEntries(professionalModules.map((module) => [module.id, {
      evaluator: module.id === activeModulePage
        ? signedInEvaluator
        : String(document.getElementById(`${module.id}Evaluator`)?.value || "").trim(),
      assessmentDate: module.id === activeModulePage
        ? assessmentDate
        : document.getElementById(`${module.id}AssessmentDate`)?.value || "",
      contributors: module.id === activeModulePage
        ? Array.from(new Set([
            ...(Array.isArray(document.getElementById(`${module.id}Evaluator`)?.dataset.contributors)
              ? document.getElementById(`${module.id}Evaluator`).dataset.contributors
              : String(document.getElementById(`${module.id}Evaluator`)?.dataset.contributors || "").split("|").filter(Boolean)),
            signedInEvaluator
          ].filter(Boolean)))
        : String(document.getElementById(`${module.id}Evaluator`)?.dataset.contributors || "").split("|").filter(Boolean)
    }])),
    catalogVersion: ASSESSMENT_CATALOG_VERSION,
    domains: {},
    updatedAt: new Date().toISOString()
  };

  domains.forEach((domain) => {
    const items = {};
    domain.items.forEach((item) => {
      const scale = domainList.querySelector(`.rating-scale[data-domain="${domain.id}"][data-item="${item.id}"]`);
      items[item.id] = scale?.dataset.value ? Number(scale.dataset.value) : null;
    });
    data.domains[domain.id] = {
      professional: domain.professional,
      items,
      impact: Number(document.getElementById(`${domain.id}Impact`).value || 0),
      support: document.getElementById(`${domain.id}Support`).value,
      note: document.getElementById(`${domain.id}Note`).value.trim()
    };
  });
  return data;
}

function setField(name, value) {
  const field = form.elements[name];
  if (field) field.value = value ?? "";
}

function applyData(data = {}) {
  data = upgradeExpandedRecord(data) || {};
  activeId = data.id || null;
  setField("studentName", data.studentName || "");
  setField("studentCode", data.studentCode || "");
  setField("gender", data.gender || "");
  setField("age", data.age || "");
  setField("className", data.className || "");
  setField("organizationName", data.organizationName || "");
  setField("primaryNeed", data.primaryNeed || "全面发育迟缓/智力障碍");
  setField("assessmentDate", data.assessmentDate || today());
  setField("evaluator", data.evaluator || "");
  setField("reviewer", data.reviewer || "");
  setField("setting", data.setting || "综合观察");
  setField("cooperation", data.cooperation || "资料充分，表现较稳定");
  setField("communicationMode", data.communicationMode || "口语沟通");
  setField("mobility", data.mobility || "独立移动");
  setField("background", data.background || "");
  setField("medicalPrecautions", data.medicalPrecautions || "");

  const assessors = data.professionalAssessors && typeof data.professionalAssessors === "object"
    ? data.professionalAssessors
    : defaultProfessionalAssessors(data.assessmentDate || today());
  professionalModules.forEach((module) => {
    const evaluatorField = document.getElementById(`${module.id}Evaluator`);
    const dateField = document.getElementById(`${module.id}AssessmentDate`);
    const legacyEvaluator = module.id === "si" ? data.evaluator || "" : "";
    const currentEvaluator = module.id === activeModulePage && teamSession?.user?.displayName
      ? teamSession.user.displayName
      : assessors[module.id]?.evaluator || legacyEvaluator;
    if (evaluatorField) {
      evaluatorField.value = currentEvaluator;
      evaluatorField.readOnly = true;
      evaluatorField.dataset.contributors = (assessors[module.id]?.contributors || []).join("|");
    }
    if (dateField) {
      dateField.value = module.id === activeModulePage
        ? data.assessmentDate || today()
        : assessors[module.id]?.assessmentDate || (legacyEvaluator ? data.assessmentDate || today() : "");
      dateField.readOnly = true;
    }
  });

  const sources = Array.isArray(data.observationSources) ? data.observationSources : [];
  form.querySelectorAll('input[name="observationSources"]').forEach((input) => {
    input.checked = sources.includes(input.value);
  });

  domains.forEach((domain) => {
    const value = data.domains?.[domain.id] || defaultDomainValue();
    domain.items.forEach((item) => {
      const score = value.items?.[item.id];
      const scale = domainList.querySelector(`.rating-scale[data-domain="${domain.id}"][data-item="${item.id}"]`);
      if (!scale) return;
      scale.dataset.value = Number.isFinite(Number(score)) && Number(score) >= 1 ? String(score) : "";
      updateRatingFeedback(scale);
    });
    document.getElementById(`${domain.id}Impact`).value = String(value.impact ?? 0);
    document.getElementById(`${domain.id}Support`).value = value.support || "部分提示";
    document.getElementById(`${domain.id}Note`).value = value.note || "";
    updateImpactDescription(domain.id);
  });

  document.getElementById("currentRecordTitle").textContent = data.studentName || data.studentCode || "新建学生评估";
  document.getElementById("lastSavedText").textContent = data.updatedAt ? `更新于 ${formatDateTime(data.updatedAt)}` : "尚未保存";
  refreshAnalysis();
  renderRecords();
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function analyze(data) {
  return analyzeAssessment(data, { domains, scoreLevels, impactLabels });
}

function refreshAnalysis() {
  const data = collectData();
  const result = analyze(data);
  lastAnalysis = result;
  const activeReadiness = result.moduleReadiness?.[activeModulePage];
  const activeSummary = result.moduleSummaries?.[activeModulePage];
  const activeRows = result.rows.filter((row) => row.professional === activeModulePage);
  const activePriorityRows = (activeSummary?.priorityDomainIds || []).map((id) => activeRows.find((row) => row.id === id)).filter(Boolean);
  const activeStrengthRows = (activeSummary?.strengthDomainIds || []).map((id) => activeRows.find((row) => row.id === id)).filter(Boolean);
  const activeCoverage = activeReadiness?.coverage || 0;
  const activeAverage = activeSummary?.average ?? null;

  document.getElementById("coverageText").textContent = `${activeCoverage}%`;
  document.getElementById("coverageBar").style.width = `${activeCoverage}%`;
  document.getElementById("averageScore").textContent = activeAverage === null ? "—" : activeAverage.toFixed(1);
  document.getElementById("overallLevel").textContent = activeSummary?.level || "尚未形成结果";
  const moduleLabel = moduleById(activeModulePage).label;
  const moduleSummaryText = activeAverage === null
    ? `${moduleLabel}已形成${activeSummary?.validDomainCount || 0}/${activeSummary?.totalDomainCount || 0}个有效领域；至少完成3个有效领域后生成本专业初步分析，达到${activeReadiness?.requiredDomainCount || 4}个后才参与个训分流。`
    : `${moduleLabel}均分${activeAverage.toFixed(1)}，已形成${activeSummary.validDomainCount}/${activeSummary.totalDomainCount}个有效领域。相对优势：${activeStrengthRows.map((row) => row.title).join("、") || "待补充"}；优先关注：${activePriorityRows.map((row) => row.title).join("、") || "待复核"}。`;
  document.getElementById("overallSummary").textContent = moduleSummaryText;
  document.getElementById("scoreRing").style.setProperty("--score-angle", `${activeAverage === null ? 0 : (activeAverage / 5) * 360}deg`);
  const state = document.getElementById("analysisState");
  state.textContent = activeAverage === null ? "等待本专业评估" : `个别化 · ${activeSummary.validDomainCount}领域`;
  state.classList.toggle("ready", activeAverage !== null);

  domains.forEach((domain) => {
    const row = result.rows.find((item) => item.id === domain.id);
    const average = document.getElementById(`${domain.id}Average`);
    const answered = document.getElementById(`${domain.id}Answered`);
    const stateBadge = document.getElementById(`${domain.id}State`);
    average.textContent = row.average === null ? "—" : row.average.toFixed(1);
    answered.textContent = `${row.answered}/${domain.items.length}项`;
    if (!row.valid) {
      stateBadge.textContent = row.answered ? "待补充" : "未评";
      stateBadge.className = "domain-state";
    } else {
      const rounded = Math.max(1, Math.min(5, Math.round(row.average)));
      stateBadge.textContent = scoreLevels[rounded].short;
      stateBadge.className = `domain-state ${scoreLevels[rounded].className}`;
    }
  });

  const tags = activePriorityRows.length
    ? activePriorityRows.map((row) => `<span class="${row.average < 2.5 || row.impact >= 3 ? "urgent" : ""}">${escapeHtml(row.title)} ${row.average.toFixed(1)}</span>`).join("")
    : "<span>完成评估后显示优先领域</span>";
  document.getElementById("priorityTags").innerHTML = tags;
  renderList("strengthList", result.strengths);
  renderList("needList", result.needs);
  renderList("basisList", result.basis);
  renderList("alertList", result.alerts);
  renderList("goalList", result.goals);
  renderList("strategyList", result.strategies);
  renderCourseDecision(result);
  renderProfessionalModuleStatus(result, data);
  queueDraftSave(data, result);
}

function renderList(id, values) {
  document.getElementById(id).innerHTML = values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");
}

function renderProfessionalModuleStatus(result, data) {
  professionalModules.forEach((module) => {
    const readiness = result.moduleReadiness?.[module.id];
    const assessor = data.professionalAssessors?.[module.id];
    const evaluator = assessor?.evaluator || "";
    document.querySelectorAll(`[data-domain-owner="${module.id}"]`).forEach((label) => {
      label.textContent = evaluator || `${module.label}待分配`;
    });
    const status = document.querySelector(`[data-module-status="${module.id}"]`);
    if (!status || !readiness) return;
    status.textContent = `${readiness.validDomainCount}/${readiness.totalDomainCount}个有效领域 · ${readiness.coverage}%`;
    status.classList.toggle("ready", readiness.ready);
  });
}

function renderCourseDecision(result) {
  const container = document.getElementById("courseRecommendationList");
  const notes = document.getElementById("courseRecommendationNotes");
  const readiness = document.getElementById("courseModuleReadiness");
  if (!container || !notes || !readiness) return;
  const recommendations = Array.isArray(result.courseRecommendations) ? result.courseRecommendations : [];
  container.innerHTML = recommendations.length
    ? recommendations.map((item) => `
        <article class="course-recommendation course-${escapeHtml(item.courseId)}">
          <div class="course-rank"><span>${escapeHtml(item.priorityLabel)}</span><strong>${escapeHtml(item.title)}</strong></div>
          <p>${escapeHtml(item.rationale)}</p>
          <dl><div><dt>建议聚焦</dt><dd>${escapeHtml(item.focus)}</dd></div><div><dt>需要指数</dt><dd>${Number(item.needIndex).toFixed(1)}</dd></div></dl>
        </article>`).join("")
    : '<div class="course-empty">当前尚未形成个训课推荐</div>';
  readiness.innerHTML = professionalModules.map((module) => {
    const item = result.moduleReadiness?.[module.id];
    if (!item) return "";
    return `<div class="module-readiness-item ${item.ready ? "ready" : "pending"}"><b>${escapeHtml(module.short)}</b><span>${item.ready ? "资料可用于分流" : "待补评"}</span><small>${item.validDomainCount}/${item.totalDomainCount}个有效领域 · 门槛${item.requiredDomainCount}个</small></div>`;
  }).join("");
  notes.innerHTML = (result.courseRecommendationNotes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function saveRecordLocally(data, { render = true } = {}) {
  if (!data.studentName && !data.studentCode) return null;
  const now = new Date().toISOString();
  const existing = records.find((record) => record.id === (activeId || data.id));
  if (!activeId) activeId = data.id || uid();
  data.id = activeId;
  data.createdAt = existing?.createdAt || data.createdAt || now;
  data.updatedAt = now;

  const index = records.findIndex((record) => record.id === activeId);
  if (index >= 0) records[index] = data;
  else records.push(data);
  if (render) persistRecords();
  else localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(records));
  localStorage.setItem(scopedStorageKey(DRAFT_KEY), JSON.stringify(data));
  document.getElementById("currentRecordTitle").textContent = data.studentName || data.studentCode;
  document.getElementById("lastSavedText").textContent = `更新于 ${formatDateTime(now)}`;
  return data;
}

function prepareCloudPayload(data, analysis) {
  const record = deidentifyAssessmentRecord(data);
  record.studentCode = normalizeTeamStudentCode(record.studentCode);
  const deidentifiedAnalysis = analyze(record);
  return { record, analysis: compactAssessmentAnalysis(deidentifiedAnalysis) };
}

function syncSignature(data, analysis) {
  const payload = prepareCloudPayload(data, analysis);
  const { createdAt, updatedAt, ...stableRecord } = payload.record;
  return JSON.stringify({ deidentified: true, record: stableRecord, analysis: payload.analysis });
}

function queueCloudSync(data, analysis, { immediate = false } = {}) {
  clearTimeout(cloudSyncTimer);
  if (!cloudSettings.enabled) return;
  if (!teamSession) {
    updateSyncStatus("pending", "尚未登录团队 · 评估仍保存在本机");
    return;
  }
  if (!data.studentName && !data.studentCode) {
    updateSyncStatus("pending", "填写姓名或学生编号后自动上传");
    return;
  }
  if (!normalizeTeamStudentCode(data.studentCode)) {
    updateSyncStatus("pending", "已保存本机 · 协作编号需同时包含字母和数字");
    return;
  }
  const signature = syncSignature(data, analysis);
  if (signature === lastSyncedSignature) return;
  const elapsed = Date.now() - lastCloudSyncAt;
  const delay = immediate ? 0 : Math.max(AUTO_SYNC_IDLE_DELAY, MIN_CLOUD_SYNC_INTERVAL - elapsed);
  updateSyncStatus("enabled", delay ? "更改已自动保存 · 等待自动上传" : "正在安全上传…");
  cloudSyncTimer = setTimeout(() => syncRecord(data, analysis, { silent: true, signature }), delay);
}

function queueDraftSave(data, analysis) {
  clearTimeout(draftTimer);
  document.getElementById("draftState").textContent = "正在自动保存";
  draftTimer = setTimeout(() => {
    localStorage.setItem(scopedStorageKey(DRAFT_KEY), JSON.stringify(data));
    const saved = saveRecordLocally(data);
    document.getElementById("draftState").textContent = saved ? "已自动保存" : "草稿已自动暂存";
    if (saved) queueCloudSync(saved, analysis);
  }, AUTO_SAVE_DELAY);
}

function persistRecords() {
  localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(records));
  renderRecords();
}

function renderRecords() {
  document.getElementById("recordCount").textContent = String(records.length);
  const query = searchRecords.value.trim().toLowerCase();
  const filtered = records
    .filter((record) => [record.studentName, record.studentCode, record.className, record.primaryNeed, record.assessmentDate].join(" ").toLowerCase().includes(query))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (!filtered.length) {
    recordList.innerHTML = `<div class="empty-state">${records.length ? "没有匹配的档案" : "尚未保存评估记录"}</div>`;
    return;
  }

  recordList.innerHTML = filtered.map((record) => {
    const result = analyze(record);
    const name = record.studentName || record.studentCode || "未命名学生";
    const meta = [record.studentCode && record.studentName ? record.studentCode : "", record.className, record.assessmentDate].filter(Boolean).join(" · ");
    return `
      <button class="record-item ${record.id === activeId ? "active" : ""}" type="button" data-record-id="${escapeHtml(record.id)}">
        <span class="record-line"><strong>${escapeHtml(name)}</strong><span class="record-score">${result.average === null ? "—" : result.average.toFixed(1)}</span></span>
        <small>${escapeHtml(meta || record.primaryNeed || "未填写资料")}</small>
      </button>
    `;
  }).join("");
}

async function saveCurrentRecord() {
  const data = collectData();
  if (!data.studentName && !data.studentCode) {
    showToast("请至少填写学生姓名或学生编号。 ");
    form.studentName.focus();
    return;
  }

  clearTimeout(draftTimer);
  const saved = saveRecordLocally(data);
  document.getElementById("draftState").textContent = "已自动保存";
  showToast("评估已保存到本机浏览器。 ");

  if (cloudSettings.enabled) {
    clearTimeout(cloudSyncTimer);
    await syncRecord(saved, analyze(saved));
  }
}

async function syncRecord(data, analysis, { silent = false, signature = syncSignature(data, analysis), keepalive = false } = {}) {
  if (!cloudSettings.enabled) return;
  if (!teamSession) {
    updateSyncStatus("pending", "尚未登录团队 · 评估仍保存在本机");
    if (!silent) showToast("请先登录团队工作台，再启用云备份。 ");
    return;
  }
  if (silent && signature === lastSyncedSignature) return;
  if (!data.studentName && !data.studentCode) {
    updateSyncStatus("pending", "填写姓名或学生编号后自动上传");
    return;
  }
  if (!normalizeTeamStudentCode(data.studentCode)) {
    updateSyncStatus("pending", "已保存本机 · 协作编号需同时包含字母和数字");
    if (!silent) showToast("本机已保存；请填写字母加数字的内部协作编号，如 KFB-027。 ");
    return;
  }
  updateSyncStatus("enabled", "正在安全同步…");
  try {
    const payload = prepareCloudPayload(data, analysis);
    const response = await fetch(`${API_ORIGIN}/api/team/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        consent: true,
        deidentified: true,
        module: activeModulePage,
        record: payload.record,
        analysis: payload.analysis
      }),
      keepalive
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "同步失败");
      error.status = response.status;
      throw error;
    }
    lastCloudSyncAt = Date.now();
    if (result.clientRecordId && result.clientRecordId !== data.id) {
      const previousId = data.id;
      data.id = result.clientRecordId;
      activeId = result.clientRecordId;
      records = records.filter((record) => record.id !== result.clientRecordId || record.id === previousId);
      const localIndex = records.findIndex((record) => record.id === previousId);
      if (localIndex >= 0) records[localIndex] = data;
      persistRecords();
    }
    data.cloudVersion = result.version || data.cloudVersion;
    cloudSettings.lastSyncedAt = new Date(lastCloudSyncAt).toISOString();
    persistCloudSettings();
    lastSyncedSignature = signature;
    updateSyncStatus("enabled", `自动云备份已完成 · v${result.version || "—"} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    if (result.reviewRequired) showToast(result.reviewMessage || "本专业已有其他评估者记录，请团队复核新旧版本。 ");
    else if (!silent) showToast("云端同步完成。 ");
  } catch (error) {
    if (error.status === 401 || error.status === 403 || error.status === 428) {
      teamSession = null;
      updateSyncStatus("error", "登录状态已失效，正在返回登录页");
      redirectToTeam(error.status === 428 ? "password" : "login");
      return;
    }
    updateSyncStatus("error", error.message || "云端暂时不可用");
    if (!silent) showToast("本机保存成功，但云端同步未完成。 ");
    if (silent && !keepalive && cloudSettings.enabled && teamSession) {
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(() => syncRecord(data, analysis, { silent: true, signature }), 30_000);
    }
  }
}

function newRecord() {
  activeId = null;
  applyData({ assessmentDate: today(), domains: {} });
  showToast("已开始新的空白评估。 ");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteCurrentRecord() {
  if (!activeId) {
    showToast("当前内容尚未保存为档案。 ");
    return;
  }
  const current = records.find((record) => record.id === activeId);
  const name = current?.studentName || current?.studentCode || "当前档案";
  if (!confirm(`确定删除“${name}”的本机档案吗？已同步到云端的数据需在后台单独删除。`)) return;
  records = records.filter((record) => record.id !== activeId);
  persistRecords();
  newRecord();
  showToast("本机档案已删除。 ");
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

function safeFilename(value) {
  return String(value || "未命名学生").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 48);
}

function exportCurrentJson() {
  const data = collectData();
  const payload = { version: 2, exportedAt: new Date().toISOString(), record: data, analysis: analyze(data) };
  downloadFile(`${safeFilename(data.studentName || data.studentCode)}-学生功能评估.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  showToast("已导出当前评估 JSON。 ");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportAllCsv() {
  const source = records.length ? records : [collectData()];
  const header = [
    "姓名", "学生编号", "性别", "年龄", "班级", "机构/学校", "主要发展需要", "评估日期", "报告统筹人", "复核人", "主要情境", "观察来源", "功能观察均分", "完成度", "总体等级",
    ...professionalModules.flatMap((module) => [`${module.label}${module.short}主评人`, `${module.label}${module.short}评估日期`]),
    ...domains.map((domain) => `${domain.title}均分`),
    ...domains.map((domain) => `${domain.title}参与影响`),
    "优势摘要", "支持需要", "阶段目标", "个训课建议"
  ];
  const rows = source.map((record) => {
    const result = analyze(record);
    return [
      record.studentName, record.studentCode, record.gender, record.age, record.className, record.organizationName, record.primaryNeed,
      record.assessmentDate, record.evaluator, record.reviewer, record.setting, (record.observationSources || []).join("、"),
      result.average === null ? "" : result.average.toFixed(2), `${result.coverage}%`, result.level,
      ...professionalModules.flatMap((module) => [record.professionalAssessors?.[module.id]?.evaluator || "", record.professionalAssessors?.[module.id]?.assessmentDate || ""]),
      ...domains.map((domain) => {
        const row = result.rows.find((item) => item.id === domain.id);
        return row?.valid ? row.average.toFixed(2) : "";
      }),
      ...domains.map((domain) => impactLabels[record.domains?.[domain.id]?.impact || 0]),
      result.strengths.join("；"), result.needs.join("；"), result.goals.join("；"), result.courseRecommendations.map((item) => `${item.priorityLabel}：${item.title}`).join("；")
    ];
  });
  const csv = "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadFile(`学生功能评估数据-${today()}.csv`, csv, "text/csv;charset=utf-8");
  showToast("已导出 CSV 数据。 ");
}

function buildReportHtml(record) {
  const result = analyze(record);
  const domainSections = result.rows.filter((row) => row.answered > 0).map((row) => {
    const itemRows = row.itemScores.map((item) => `
      <tr><td>${escapeHtml(item.label)}</td><td>${item.score === null ? "未评" : `${item.score} · ${scoreLevels[item.score].label}`}</td></tr>
    `).join("");
    return `
      <section class="domain-report">
        <h3>${escapeHtml(row.title)} <small>${escapeHtml(moduleById(row.professional).short)}</small><span>${row.average === null ? "未形成领域分" : `${row.average.toFixed(1)}分 · ${impactLabels[row.impact]}`}</span></h3>
        <table><thead><tr><th>可观察表现</th><th>评分</th></tr></thead><tbody>${itemRows}</tbody></table>
        ${row.note ? `<p><b>观察记录：</b>${escapeHtml(row.note)}</p>` : ""}
      </section>
    `;
  }).join("");
  const list = (items) => `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
  const courseLines = result.courseRecommendations.length
    ? result.courseRecommendations.map((item) => `${item.priorityLabel}：${item.title}。${item.rationale}建议聚焦：${item.focus}。`)
    : result.courseRecommendationNotes.slice(0, 1);
  const assessorRows = professionalModules.map((module) => {
    const assessor = record.professionalAssessors?.[module.id] || {};
    const readiness = result.moduleReadiness?.[module.id] || {};
    const contributors = Array.from(new Set([...(assessor.contributors || []), assessor.evaluator].filter(Boolean)));
    return `<tr><td>${escapeHtml(`${module.label} ${module.short}`)}</td><td>${escapeHtml(assessor.evaluator || "未填写")}</td><td>${escapeHtml(contributors.join("、") || "未填写")}</td><td>${escapeHtml(assessor.assessmentDate || "未填写")}</td><td>${readiness.validDomainCount || 0}/${readiness.totalDomainCount || 0}个有效领域</td></tr>`;
  }).join("");
  const titleName = record.studentName || record.studentCode || "学生";
  const organizationName = record.organizationName || "知衡学生功能评估与康复支持";
  const htmlReportNumber = `ZH-FR-${String(record.assessmentDate || today()).replaceAll("-", "")}-${String(record.studentCode || "REPORT").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "REPORT"}`;

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(titleName)}-学生功能评估与康复支持报告</title>
  <style>
    body{margin:0;padding:30px;color:#1f2a33;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.7}
    header{text-align:center;border-bottom:2px solid #167b72;padding-bottom:14px}.org{color:#294858;font-weight:800;letter-spacing:0}h1{margin:7px 0 0;font-size:27px}header p{margin:5px 0 0;color:#687782}
    h2{margin:24px 0 9px;font-size:19px;border-bottom:1px solid #dfe5e8;padding-bottom:6px}h3{margin:16px 0 7px;font-size:16px}h3 small{margin-left:6px;color:#356b8c}h3 span{float:right;color:#53616c;font-size:13px;font-weight:500}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px;margin:18px 0;padding:13px;border:1px solid #dfe5e8;background:#f8fafb}.meta b{color:#65737d}
    .score{font-size:28px;color:#167b72;font-weight:800}.notice{padding:9px 11px;border-left:4px solid #356b8c;background:#e8f0f6;color:#405f73}
    table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{padding:8px;border:1px solid #dfe5e8;text-align:left;vertical-align:top}th{background:#f3f5f7}.domain-report{break-inside:avoid}
    ol{margin:8px 0;padding-left:25px}li{margin:6px 0;padding-left:3px}li::marker{color:#167b72;font-weight:800}.signatures{display:grid;grid-template-columns:repeat(3,1fr);margin-top:22px;border:1px solid #dfe5e8}.signatures div{min-height:80px;padding:12px;border-right:1px solid #dfe5e8}.signatures div:last-child{border-right:0}.foot{margin-top:25px;color:#77838d;font-size:12px}
    @media print{body{padding:0}.domain-report{break-inside:avoid}}
  </style></head><body>
  <header><div class="org">${escapeHtml(organizationName)}</div><h1>学生功能评估与康复支持报告</h1><p>学生标识：${escapeHtml(titleName)} · 报告编号：${escapeHtml(htmlReportNumber)} · ${escapeHtml(record.assessmentDate || today())}</p></header>
  <p class="notice">本报告由多专业学校场景功能性观察数据自动整理，用于团队讨论目标与服务分流；不是标准化常模量表，不能替代医学诊断或各专业完整评估。</p>
  <div class="meta">
    <div><b>学生编号：</b>${escapeHtml(record.studentCode || "未填写")}</div><div><b>年龄：</b>${escapeHtml(record.age || "未填写")}</div><div><b>性别：</b>${escapeHtml(record.gender || "未填写")}</div>
    <div><b>班级：</b>${escapeHtml(record.className || "未填写")}</div><div><b>主要发展需要：</b>${escapeHtml(record.primaryNeed || "未填写")}</div><div><b>报告统筹人：</b>${escapeHtml(record.evaluator || "未填写")}</div>
    <div><b>主要情境：</b>${escapeHtml(record.setting || "未填写")}</div><div><b>观察来源：</b>${escapeHtml((record.observationSources || []).join("、") || "未填写")}</div><div><b>完成度：</b>${result.coverage}%</div>
    <div><b>功能观察均分：</b><span class="score">${result.average === null ? "—" : result.average.toFixed(1)}</span></div><div><b>总体等级：</b>${escapeHtml(result.level)}</div><div><b>分析可信度：</b>${escapeHtml(result.confidence)}</div>
  </div>
  <h2>多专业评估分工与完成情况</h2><table><thead><tr><th>专业模块</th><th>最近提交者</th><th>参与评估人员</th><th>日期</th><th>完成情况</th></tr></thead><tbody>${assessorRows}</tbody></table>
  <h2>评估摘要</h2><p>${escapeHtml(result.summary)}</p>
  <h2>个别化分析依据</h2>${list(result.basis)}
  <h2>背景、安全与解释</h2><p><b>主要关切：</b>${escapeHtml(record.background || "未填写")}</p><p><b>医疗与安全：</b>${escapeHtml(record.medicalPrecautions || "未填写")}</p>${list(result.alerts)}
  <h2>相对优势</h2>${list(result.strengths)}<h2>优先支持需要</h2>${list(result.needs)}<h2>个训课分流建议</h2>${list(courseLines)}${list(result.courseRecommendationNotes)}<h2>8周阶段目标</h2>${list(result.goals)}<h2>训练、课堂与生活支持</h2>${list(result.strategies)}
  <h2>领域与项目明细</h2>${domainSections}
  <h2>专业人员确认</h2><div class="signatures"><div><b>报告统筹人签名</b><br>${escapeHtml(record.evaluator || "")}</div><div><b>复核人签名</b><br>${escapeHtml(record.reviewer || "")}</div><div><b>机构盖章</b></div></div>
  <p class="foot">评分：1全程协助，2大量协助，3部分提示，4少量提示，5独立稳定；每个领域至少完成60%的项目才形成领域分。建议由具备相关专业能力的人员结合多情境观察、家庭优先事项和跨专业资料解释。</p>
  </body></html>`;
}

function reportRow(data, analysis) {
  return {
    student_label: data.studentName || data.studentCode || "学生",
    is_deidentified: 0,
    updated_at: data.updatedAt || new Date().toISOString(),
    assessment: data,
    analysis
  };
}

async function createCurrentDocxFile() {
  const data = collectData();
  const analysis = analyze(data);
  if (!data.studentName && !data.studentCode) throw new Error("请先填写学生姓名或编号。");
  if (analysis.validDomainCount < 3) throw new Error("请至少完成3个有效领域后再生成正式报告。");
  if (!globalThis.docx?.Packer) throw new Error("Word 报告组件尚未加载，请刷新页面后重试。");
  const row = reportRow(data, analysis);
  const filename = assessmentReportFilename(row);
  const fontData = await loadReportFontData();
  const documentFile = buildAssessmentReportDocument(row, globalThis.docx, fontData);
  const blob = await globalThis.docx.Packer.toBlob(documentFile);
  const file = typeof File === "function"
    ? new File([blob], filename, { type: DOCX_MIME, lastModified: Date.now() })
    : blob;
  return {
    file,
    filename
  };
}

async function exportDocxReport() {
  const button = document.getElementById("exportDocxBtn");
  button.disabled = true;
  showToast("正在生成正式 Word 评估报告…");
  try {
    const { file, filename } = await createCurrentDocxFile();
    downloadFile(filename, file, DOCX_MIME);
    showToast("Word 评估报告已导出。 ");
  } catch (error) {
    showToast(error.message || "Word 报告生成失败。 ");
  } finally {
    button.disabled = false;
  }
}

function updateReportShareButton() {
  const button = document.getElementById("createReportLinkBtn");
  const consented = document.getElementById("shareReportConsent").checked;
  button.disabled = !preparedReportFile || !consented || Boolean(preparedReportLink);
}

function reportExpiryText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "24小时后";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取 Word 报告，请重新生成。"));
    reader.onload = () => {
      const encoded = String(reader.result || "").split(",")[1];
      if (!encoded) reject(new Error("Word 报告编码失败，请重新生成。"));
      else resolve(encoded);
    };
    reader.readAsDataURL(blob);
  });
}

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the selection-based copy used by older WeChat webviews.
    }
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  input.setSelectionRange(0, input.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    input.remove();
  }
  return copied;
}

async function openShareReportDialog() {
  preparedReportFile = null;
  preparedReportLink = null;
  document.getElementById("shareReportFilename").textContent = "正在生成报告…";
  document.getElementById("shareReportStatus").textContent = "正在整理评估结果与正式版式";
  document.getElementById("shareReportNote").textContent = "微信无法稳定转发网页生成的临时 Word 文件。报告生成后，可创建一个限时下载链接。";
  document.getElementById("shareReportConsent").checked = false;
  document.getElementById("shareReportConsent").disabled = false;
  document.getElementById("shareReportConsentWrap").hidden = false;
  document.getElementById("shareReportLinkPanel").hidden = true;
  document.getElementById("shareReportLinkInput").value = "";
  const createButton = document.getElementById("createReportLinkBtn");
  createButton.hidden = false;
  createButton.disabled = true;
  createButton.textContent = "正在生成";
  shareReportDialog.showModal();
  try {
    preparedReportFile = await createCurrentDocxFile();
    document.getElementById("shareReportFilename").textContent = preparedReportFile.filename;
    document.getElementById("shareReportStatus").textContent = "正式版 Word 文档已在本机生成，尚未上传";
    document.getElementById("shareReportNote").textContent = "勾选授权后生成24小时随机链接，再复制到微信聊天中发送。";
    createButton.textContent = "生成24小时链接";
    updateReportShareButton();
  } catch (error) {
    document.getElementById("shareReportFilename").textContent = "报告生成失败";
    document.getElementById("shareReportStatus").textContent = error.message || "请检查评估资料";
    document.getElementById("shareReportNote").textContent = "补充所需资料后可重新生成。";
    document.getElementById("shareReportConsentWrap").hidden = true;
    createButton.textContent = "无法生成";
  }
}

async function createPreparedReportLink() {
  if (!preparedReportFile) return;
  if (!document.getElementById("shareReportConsent").checked) {
    showToast("请先确认已获得报告分享授权。 ");
    return;
  }
  const button = document.getElementById("createReportLinkBtn");
  button.disabled = true;
  button.textContent = "正在安全上传";
  document.getElementById("shareReportStatus").textContent = "正在创建24小时临时链接…";
  try {
    const fileBase64 = await blobToBase64(preparedReportFile.file);
    const response = await fetch(`${API_ORIGIN}/api/reports/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent: true,
        sessionId: getSessionId(),
        filename: preparedReportFile.filename,
        mimeType: DOCX_MIME,
        fileBase64
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.shareUrl) throw new Error(payload.error || "临时链接生成失败，请稍后重试。 ");
    preparedReportLink = payload;
    document.getElementById("shareReportStatus").textContent = `链接有效至 ${reportExpiryText(payload.expiresAt)}`;
    document.getElementById("shareReportNote").textContent = "报告已临时保存。请复制链接并返回微信聊天粘贴发送；对方打开后即可下载 Word 文件。";
    document.getElementById("shareReportLinkInput").value = payload.shareUrl;
    document.getElementById("shareReportLinkPanel").hidden = false;
    document.getElementById("shareReportConsent").disabled = true;
    document.getElementById("shareReportLinkBtn").hidden = IS_WECHAT || !navigator.share;
    button.hidden = true;
  } catch (error) {
    button.disabled = false;
    button.textContent = "重新生成链接";
    document.getElementById("shareReportStatus").textContent = "临时链接生成失败";
    document.getElementById("shareReportNote").textContent = error.message || "请检查网络后重试。";
  }
}

async function copyPreparedReportLink() {
  if (!preparedReportLink?.shareUrl) return;
  const copied = await copyText(preparedReportLink.shareUrl);
  showToast(copied ? "报告链接已复制，请返回微信聊天粘贴发送。" : "自动复制失败，请长按链接手动复制。 ");
}

async function sharePreparedReportLink() {
  if (!preparedReportLink?.shareUrl) return;
  if (!navigator.share) {
    await copyPreparedReportLink();
    return;
  }
  try {
    await navigator.share({
      title: "学生功能评估与康复支持报告",
      text: "请在24小时内打开链接并下载 Word 评估报告。",
      url: preparedReportLink.shareUrl
    });
    showToast("已打开系统转发，请确认联系人会话中已出现报告链接。 ");
  } catch (error) {
    if (error.name !== "AbortError") {
      await copyPreparedReportLink();
    }
  }
}

function printReport() {
  const data = collectData();
  const report = window.open("", "_blank");
  if (!report) {
    showToast("浏览器拦截了报告窗口，请改用“评估报告”导出。 ");
    return;
  }
  report.document.open();
  report.document.write(buildReportHtml(data));
  report.document.close();
  report.focus();
  setTimeout(() => report.print(), 260);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed.records) ? parsed.records : parsed.record ? [parsed.record] : [];
      const incoming = source
        .filter((item) => item && typeof item === "object")
        .map((item) => item.domains && Object.values(item.domains).some((domain) => domain?.items) ? item : migrateLegacyRecord(item))
        .map(upgradeExpandedRecord)
        .map((item) => ({ ...item, id: item.id || uid(), updatedAt: item.updatedAt || new Date().toISOString() }));
      if (!incoming.length) throw new Error("empty");
      incoming.forEach((item) => {
        const index = records.findIndex((record) => record.id === item.id);
        if (index >= 0) records[index] = item;
        else records.push(item);
      });
      persistRecords();
      applyData(incoming[0]);
      showToast(`已导入 ${incoming.length} 份评估档案。`);
    } catch {
      showToast("无法识别该 JSON 备份文件。 ");
    }
  };
  reader.readAsText(file);
}

function updateSyncStatus(state, message) {
  const box = document.getElementById("syncStatus");
  box.className = `sync-status ${state || ""}`;
  box.querySelector("span").textContent = message;
}

async function syncNow() {
  if (!teamSession) {
    redirectToTeam("login");
    return;
  }
  const button = document.getElementById("syncNowBtn");
  button.disabled = true;
  button.querySelector("span").textContent = "同步中";
  clearTimeout(cloudSyncTimer);
  const data = collectData();
  const saved = saveRecordLocally(data);
  await syncRecord(saved || data, analyze(saved || data));
  button.disabled = false;
  button.querySelector("span").textContent = "立即同步";
}

function refreshCloudUi() {
  cloudToggle.checked = Boolean(teamSession);
  cloudToggle.disabled = true;
  const description = document.getElementById("cloudDescription");
  const syncButtonLabel = document.querySelector("#syncNowBtn span");
  if (!teamSession) {
    description.textContent = "正在验证团队登录状态";
    updateSyncStatus("pending", "登录验证中");
    syncButtonLabel.textContent = "登录团队";
    return;
  }
  description.textContent = `${teamSession.user.displayName} · ${teamSession.user.primaryModuleLabel} · 自动云备份`;
  const lastSync = cloudSettings.lastSyncedAt ? ` · 上次 ${formatDateTime(cloudSettings.lastSyncedAt)}` : " · 等待首次同步";
  updateSyncStatus("enabled", `登录后自动同步已开启${lastSync}`);
  syncButtonLabel.textContent = "立即同步";
}

function openConsentDialog() {
  if (!teamSession) {
    redirectToTeam("login");
    return;
  }
  consentDialog.showModal();
}

function moduleRoute(moduleId = activeModulePage) {
  return { si: "/", ot: "/ot/", st: "/st/", pt: "/movement/" }[moduleId] || "/";
}

function redirectToTeam(reason = "login") {
  const origin = location.protocol === "file:" || location.hostname === "jintang6.github.io" ? API_ORIGIN : "";
  const target = new URL(`${origin || location.origin}/team.html`);
  target.searchParams.set("return", moduleRoute());
  target.searchParams.set("reason", reason);
  location.replace(target.toString());
}

async function loadTeamSession() {
  if (location.protocol === "file:" || location.hostname === "jintang6.github.io") {
    redirectToTeam("login");
    return false;
  }
  try {
    const response = await fetch(`${API_ORIGIN}/api/team/session`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      redirectToTeam(response.status === 428 ? "password" : "login");
      return false;
    }
    teamSession = await response.json();
  } catch {
    redirectToTeam("unavailable");
    return false;
  }
  if (teamSession.user.passwordChangeRequired) {
    redirectToTeam("password");
    return false;
  }
  const allowedModules = teamSession.user.role === "admin" ? professionalModules.map((module) => module.id) : teamSession.user.moduleAccess || [];
  if (!allowedModules.includes(activeModulePage)) {
    redirectToTeam("module");
    return false;
  }
  cloudSettings = loadCloudSettings();
  cloudSettings.enabled = true;
  cloudSettings.consentAt ||= new Date().toISOString();
  persistCloudSettings();
  lastCloudSyncAt = cloudSettings.lastSyncedAt ? new Date(cloudSettings.lastSyncedAt).getTime() : 0;
  refreshCloudUi();
  return true;
}

function takeTeamRecordTransfer() {
  try {
    const raw = sessionStorage.getItem(TEAM_RECORD_TRANSFER_KEY);
    sessionStorage.removeItem(TEAM_RECORD_TRANSFER_KEY);
    const record = JSON.parse(raw || "null");
    return record && typeof record === "object" && record.studentCode ? record : null;
  } catch {
    return null;
  }
}

function getSessionId() {
  let id = sessionStorage.getItem("sensoryAnonymousSession");
  if (!id) {
    id = uid();
    sessionStorage.setItem("sensoryAnonymousSession", id);
  }
  return id;
}

function deviceType() {
  if (window.innerWidth <= 680) return "mobile";
  if (window.innerWidth <= 1100) return "tablet";
  return "desktop";
}

async function sendAnalytics(endpoint) {
  if (location.protocol === "file:") return;
  try {
    await fetch(`${API_ORIGIN}/api/analytics/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId(), path: location.pathname, deviceType: deviceType() }),
      keepalive: true
    });
  } catch {
    // Anonymous statistics must never block the assessment workflow.
  }
}

function configureRuntimeUi() {
  if (!IS_WECHAT) return;
  document.body.classList.add("wechat-browser");
  const printButton = document.getElementById("printBtn");
  printButton.title = "发送 Word 评估报告";
  printButton.querySelector(".print-action-icon").hidden = true;
  printButton.querySelector(".share-action-icon").hidden = false;
  document.getElementById("printActionLabel").textContent = "发送报告";
}

function configureModulePage() {
  const copy = professionalPageCopy[activeModulePage];
  document.body.dataset.modulePage = activeModulePage;
  document.body.classList.add(`module-page-${activeModulePage}`);
  document.title = copy.title;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.content = `${copy.product}，与知衡其他专业入口共享学生档案、云端协作和综合报告。`;
  document.getElementById("productLabel").textContent = copy.product;
  document.getElementById("productSubtitle").textContent = copy.subtitle;
  document.getElementById("methodIntro").innerHTML = `${copy.intro} 不替代标准化量表或医学诊断。`;
  document.getElementById("assessmentModuleHeading").textContent = copy.heading;
  const counts = domainCounts[activeModulePage];
  document.getElementById("assessmentModuleDescription").textContent = `${copy.description} 本模块包含${counts.domains}个领域、${counts.items}项可观察项目。`;

  document.querySelectorAll("[data-module-link]").forEach((link) => {
    const active = link.dataset.moduleLink === activeModulePage;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-module-assignment]").forEach((card) => card.classList.toggle("active", card.dataset.moduleAssignment === activeModulePage));
  document.querySelectorAll("#categoryFilter button").forEach((button) => {
    button.classList.toggle("active", button.dataset.professional === activeModulePage);
    button.hidden = button.dataset.professional !== activeModulePage;
  });
  document.querySelectorAll(".domain-card").forEach((card) => {
    const active = card.dataset.professional === activeModulePage;
    card.hidden = !active;
    card.open = false;
  });
  const first = document.querySelector(`.domain-card[data-professional="${activeModulePage}"]`);
  if (first) first.open = true;
  renderModuleCatalog(activeModulePage);
}

function closeDrawer() {
  document.body.classList.remove("drawer-open");
  document.getElementById("appDrawer").setAttribute("aria-hidden", "true");
  document.getElementById("appMenuBtn").setAttribute("aria-expanded", "false");
  document.getElementById("drawerBackdrop").hidden = true;
}

function openDrawer() {
  document.body.classList.add("drawer-open");
  document.getElementById("appDrawer").setAttribute("aria-hidden", "false");
  document.getElementById("appMenuBtn").setAttribute("aria-expanded", "true");
  document.getElementById("drawerBackdrop").hidden = false;
}

function configureAccountNavigation() {
  const user = teamSession.user;
  document.getElementById("drawerAvatar").textContent = user.displayName.slice(0, 1) || "知";
  document.getElementById("drawerUserName").textContent = user.displayName;
  document.getElementById("drawerUserRole").textContent = `${user.roleLabel} · ${user.primaryModuleLabel}`;
  document.getElementById("drawerUserEmail").textContent = user.email;
  document.getElementById("drawerAssignment").textContent = user.assignmentNote || "可查看本部门学生档案与专业评估记录。";
  const canOpenDataAdmin = user.isSuperAdmin === true;
  document.getElementById("drawerAdminLink").hidden = !canOpenDataAdmin;
  document.getElementById("headerAdminLink").hidden = !canOpenDataAdmin;
  const allowedModules = user.role === "admin" ? professionalModules.map((module) => module.id) : user.moduleAccess || [];
  document.querySelectorAll("[data-module-link]").forEach((link) => {
    link.hidden = !allowedModules.includes(link.dataset.moduleLink);
  });
  document.querySelectorAll("[data-drawer-module]").forEach((link) => {
    const allowed = allowedModules.includes(link.dataset.drawerModule);
    link.classList.toggle("locked", !allowed);
    link.setAttribute("aria-disabled", String(!allowed));
    if (!allowed) link.title = "当前账号未获授权填写此专业模块";
  });
  document.getElementById("automaticAssessorNote").textContent = `${user.displayName} 已由系统自动署名为本次${moduleById(activeModulePage).label}评估者；提交后同步到团队云端。`;
}

function configureFixedHeader() {
  if (!appHeader) return;

  let framePending = false;
  const syncHeight = () => {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      const height = Math.ceil(appHeader.getBoundingClientRect().height);
      if (!height || height === measuredAppHeaderHeight) return;
      measuredAppHeaderHeight = height;
      document.documentElement.style.setProperty("--app-header-height", `${height}px`);
    });
  };

  syncHeight();
  if ("ResizeObserver" in window) {
    appHeaderObserver = new ResizeObserver(syncHeight);
    appHeaderObserver.observe(appHeader);
  } else {
    window.addEventListener("resize", syncHeight);
  }
  window.addEventListener("orientationchange", syncHeight);
  document.fonts?.ready.then(syncHeight);
}

function attachEvents() {
  domainList.addEventListener("click", (event) => {
    const button = event.target.closest(".rating-button");
    if (!button) return;
    const scale = button.closest(".rating-scale");
    scale.dataset.value = button.dataset.score;
    updateRatingFeedback(scale);
    refreshAnalysis();
  });

  domainList.addEventListener("change", (event) => {
    const select = event.target.closest("[data-domain-impact]");
    if (select) updateImpactDescription(select.dataset.domainImpact);
  });

  document.getElementById("moduleCatalogList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-jump-domain]");
    if (!button) return;
    const card = document.querySelector(`[data-domain-card="${button.dataset.jumpDomain}"]`);
    if (!card) return;
    card.hidden = false;
    card.open = true;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  form.addEventListener("input", refreshAnalysis);
  form.addEventListener("change", refreshAnalysis);

  document.getElementById("categoryFilter").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-professional]");
    if (!button) return;
    document.querySelectorAll("#categoryFilter button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".domain-card").forEach((card) => {
      card.hidden = button.dataset.professional !== "all" && card.dataset.professional !== button.dataset.professional;
    });
    renderModuleCatalog(button.dataset.professional);
  });

  document.querySelector(".result-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-result-tab]");
    if (!button) return;
    document.querySelectorAll(".result-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".result-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.resultPanel === button.dataset.resultTab));
  });

  document.getElementById("showSummaryBtn").addEventListener("click", () => {
    document.querySelector('[data-result-tab="courses"]')?.click();
    document.querySelector(".insights-column")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  recordList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-record-id]");
    if (!item) return;
    const record = records.find((entry) => entry.id === item.dataset.recordId);
    if (record) {
      applyData(record);
      showToast("已载入本机评估档案。 ");
    }
  });

  searchRecords.addEventListener("input", renderRecords);
  document.getElementById("saveRecordBtn").addEventListener("click", saveCurrentRecord);
  document.getElementById("newRecordBtn").addEventListener("click", newRecord);
  document.getElementById("printBtn").addEventListener("click", () => IS_WECHAT ? openShareReportDialog() : printReport());
  document.getElementById("exportJsonBtn").addEventListener("click", exportCurrentJson);
  document.getElementById("exportCsvBtn").addEventListener("click", exportAllCsv);
  document.getElementById("exportDocxBtn").addEventListener("click", exportDocxReport);
  document.getElementById("shareReportConsent").addEventListener("change", updateReportShareButton);
  document.getElementById("createReportLinkBtn").addEventListener("click", createPreparedReportLink);
  document.getElementById("copyReportLinkBtn").addEventListener("click", copyPreparedReportLink);
  document.getElementById("shareReportLinkBtn").addEventListener("click", sharePreparedReportLink);
  document.getElementById("syncNowBtn").addEventListener("click", syncNow);
  document.getElementById("importJsonBtn").addEventListener("click", () => document.getElementById("importJsonInput").click());
  document.getElementById("importJsonInput").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importJson(file);
    event.target.value = "";
  });

  document.getElementById("methodBtn").addEventListener("click", () => methodDialog.showModal());
  document.getElementById("appMenuBtn").addEventListener("click", () => document.body.classList.contains("drawer-open") ? closeDrawer() : openDrawer());
  document.getElementById("closeDrawerBtn").addEventListener("click", closeDrawer);
  document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);
  document.getElementById("appDrawer").addEventListener("click", (event) => {
    const lockedLink = event.target.closest("a.locked");
    if (lockedLink) {
      event.preventDefault();
      showToast("当前账号未获授权填写该专业模块。 ");
      return;
    }
    const action = event.target.closest("[data-drawer-action]")?.dataset.drawerAction;
    if (action === "instructions") {
      closeDrawer();
      methodDialog.showModal();
    }
    if (action === "feedback") {
      closeDrawer();
      feedbackDialog.showModal();
      document.getElementById("feedbackContent").focus();
    }
  });
  document.getElementById("drawerLogoutBtn").addEventListener("click", async () => {
    isLoggingOut = true;
    try {
      await fetch(`${API_ORIGIN}/api/team/logout`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally {
      redirectToTeam("login");
    }
  });
  document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll(".close-feedback-dialog").forEach((button) => button.addEventListener("click", () => feedbackDialog.close()));
  document.getElementById("privacyManageBtn").addEventListener("click", openConsentDialog);

  document.getElementById("feedbackForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = document.getElementById("feedbackError");
    const submit = event.submitter;
    errorBox.textContent = "";
    submit.disabled = true;
    try {
      const response = await fetch(`${API_ORIGIN}/api/team/feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: document.getElementById("feedbackCategory").value,
          content: document.getElementById("feedbackContent").value,
          pagePath: location.pathname
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "反馈提交失败");
      event.target.reset();
      feedbackDialog.close();
      showToast("反馈已提交，管理员可以在团队后台查看。 ");
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById("confirmCloudBtn").addEventListener("click", () => {
    consentDialog.close();
  });

  methodDialog.addEventListener("click", (event) => {
    if (event.target === methodDialog) methodDialog.close();
  });
  consentDialog.addEventListener("click", (event) => {
    if (event.target === consentDialog) consentDialog.close();
  });
  shareReportDialog.addEventListener("click", (event) => {
    if (event.target === shareReportDialog) shareReportDialog.close();
  });
  feedbackDialog.addEventListener("click", (event) => {
    if (event.target === feedbackDialog) feedbackDialog.close();
  });

  const deleteButton = document.getElementById("deleteRecordBtn");
  if (deleteButton) deleteButton.addEventListener("click", deleteCurrentRecord);

  window.addEventListener("pagehide", () => {
    clearTimeout(draftTimer);
    const data = collectData();
    localStorage.setItem(scopedStorageKey(DRAFT_KEY), JSON.stringify(data));
    const saved = saveRecordLocally(data, { render: false });
    if (saved && cloudSettings.enabled && !isLoggingOut) {
      clearTimeout(cloudSyncTimer);
      syncRecord(saved, analyze(saved), { silent: true, keepalive: true });
    }
  });
}

async function init() {
  configureFixedHeader();
  const authenticated = await loadTeamSession();
  if (!authenticated) return;
  records = loadRecords();
  renderDomains();
  configureRuntimeUi();
  configureModulePage();
  configureAccountNavigation();
  attachEvents();
  refreshCloudUi();
  const transferredRecord = takeTeamRecordTransfer();
  const shouldStartNew = new URLSearchParams(location.search).get("new") === "1";
  const draft = shouldStartNew ? null : loadDraft();
  applyData(transferredRecord || draft || { assessmentDate: today(), domains: {} });
  if (transferredRecord) showToast(`已从团队空间载入 ${transferredRecord.studentCode} 的去标识化档案。`);
  if (records.some((record) => record.migratedFrom === "v1")) showToast("旧版评估档案已自动迁移到新版结构。 ");
  document.body.classList.remove("auth-pending");
  sendAnalytics("visit");
  setInterval(() => sendAnalytics("heartbeat"), 45_000);
}

init();
