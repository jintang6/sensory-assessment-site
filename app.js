const STORAGE_KEY = "sensoryAssessmentRecords.v2";
const DRAFT_KEY = "sensoryAssessmentDraft.v2";
const LEGACY_STORAGE_KEY = "sensoryIntegrationRecords.v1";
const LEGACY_DRAFT_KEY = "sensoryIntegrationDraft.v1";
const CLOUD_SETTINGS_KEY = "sensoryCloudSettings.v1";
const AUTO_SAVE_DELAY = 650;
const AUTO_SYNC_IDLE_DELAY = 4_000;
const MIN_CLOUD_SYNC_INTERVAL = 15_000;
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

const domains = [
  {
    id: "tactile",
    category: "modulation",
    title: "触觉调节与辨别",
    scope: "身体接触、材料探索、照护耐受与触觉定位",
    strategies: [
      "触觉活动前先安排可预测的推、拉、搬运等本体觉准备，再由干爽材料逐步过渡到湿黏或颗粒材料。",
      "洗护、穿衣和材料操作前使用视觉预告与明确停止信号，避免突然、不可控的触碰。"
    ],
    items: [
      { id: "touch_people", label: "在预告后接受成人协助触碰身体，不出现明显回避或僵硬", observe: "观察穿衣、整理姿势与治疗协助" },
      { id: "touch_materials", label: "主动接触并操作不同质地的学习或游戏材料", observe: "干、湿、软、硬、颗粒材料" },
      { id: "grooming", label: "耐受洗手、擦脸、梳头、剪指甲等日常照护", observe: "记录可接受的步骤和持续时间" },
      { id: "clothing", label: "适应常见衣物、鞋袜和接缝标签，不因触觉持续分心", observe: "课堂和生活自理情境" },
      { id: "localization", label: "能定位被触碰部位，并用动作或沟通方式作出相应反应", observe: "双侧身体与遮挡视觉条件" }
    ]
  },
  {
    id: "vestibular",
    category: "modulation",
    title: "前庭调节与运动耐受",
    scope: "重力安全感、移动反应、停止后的恢复与唤醒水平",
    strategies: [
      "前庭输入采用短时、可预测、可主动停止的方式，优先线性运动，旋转活动需严格控制次数并观察面色、眼神和情绪。",
      "运动活动结束后连接稳定的本体觉任务和明确落点，帮助学生恢复到可学习状态。"
    ],
    items: [
      { id: "position_change", label: "接受坐、跪、趴、站等姿势转换，并保持情绪和身体稳定", observe: "地面、器械与课堂转换" },
      { id: "feet_off_ground", label: "在安全保护下参与双脚离地或重心变化活动", observe: "秋千、平衡台、台阶等" },
      { id: "linear_motion", label: "耐受前后、左右或上下的线性移动，不出现明显恐惧或过度兴奋", observe: "记录速度、幅度和停止信号" },
      { id: "stop_recover", label: "运动停止后能在2分钟内恢复定向，并进入下一项任务", observe: "关注眼震、眩晕、兴奋与逃避" },
      { id: "movement_choice", label: "能主动选择合适的运动强度，并在提示下停止或调整", observe: "体现自我监控与安全意识" }
    ]
  },
  {
    id: "proprioceptive",
    category: "modulation",
    title: "本体觉与身体觉",
    scope: "身体位置、力量分级、关节稳定与重力工作后的组织",
    strategies: [
      "在课前和桌面任务前安排推墙、搬垫、拉弹力带等重力工作，并记录其对注意和动作控制的实际影响。",
      "用轻、中、重的视觉刻度和即时反馈练习力量分级，避免仅以增加强刺激作为调节手段。"
    ],
    items: [
      { id: "body_position", label: "不依赖视觉也能大致判断四肢位置并调整身体姿势", observe: "模仿姿势、闭眼定位与穿衣" },
      { id: "force_grade", label: "拿取、推拉和书写时能按物品与任务调整用力大小", observe: "避免过轻掉落或过重损坏" },
      { id: "space_body", label: "移动时能注意自身与人、物的距离，减少碰撞和跌撞", observe: "走廊、排队、体育与游戏" },
      { id: "joint_stability", label: "肩、肘、腕和躯干能为操作任务提供稳定支撑", observe: "爬行、支撑、桌面精细活动" },
      { id: "heavy_work_response", label: "完成适量抗阻活动后，唤醒水平和任务参与更有组织", observe: "比较活动前后5-10分钟表现" }
    ]
  },
  {
    id: "auditory",
    category: "modulation",
    title: "听觉调节与信息处理",
    scope: "声音耐受、声源定位、指令理解与背景噪声过滤",
    strategies: [
      "降低不必要背景声，使用短句、停顿和视觉提示，确认学生注意后再给出1-2步指令。",
      "对不可避免的声音提前预告并提供降噪、安静角或短暂离开的选择，同时逐步训练功能性耐受。"
    ],
    items: [
      { id: "sound_tolerance", label: "耐受课堂和校园常见声音，不因普通声响持续中断活动", observe: "铃声、谈话、拖椅与器材声" },
      { id: "sound_location", label: "能寻找并大致定位呼名、提示音或环境声来源", observe: "左右、前后和不同距离" },
      { id: "name_safety", label: "在适当音量下回应姓名和安全指令", observe: "停止、等待、过来等关键指令" },
      { id: "follow_instruction", label: "在视觉支持下理解并执行1-2步口头指令", observe: "记录重复次数和延迟" },
      { id: "noise_filter", label: "存在背景谈话时仍能维持对主要教师或任务声音的关注", observe: "低、中等干扰条件" }
    ]
  },
  {
    id: "visual",
    category: "modulation",
    title: "视觉调节与视觉辨别",
    scope: "光线与视觉复杂度耐受、追踪、扫描和空间关系",
    strategies: [
      "减少桌面视觉拥挤，使用清晰边界、对比和由左到右的扫描提示，逐步增加材料数量。",
      "视觉任务与姿势稳定结合，避免在疲劳或高唤醒状态下持续增加追踪和抄写负荷。"
    ],
    items: [
      { id: "visual_tolerance", label: "适应常见室内光线、颜色和移动视觉信息，不持续回避或寻求", observe: "日光、屏幕、反光和人群移动" },
      { id: "tracking", label: "头部相对稳定时，双眼能跟随缓慢移动的物体或目标", observe: "横向、纵向和跨中线" },
      { id: "visual_scan", label: "能按一定顺序扫描桌面或空间并找到目标物", observe: "2-8个物品逐级增加" },
      { id: "discrimination", label: "能辨认常见形状、大小、颜色或图形的相同与不同", observe: "配对、分类与找不同" },
      { id: "spatial_relation", label: "理解并操作上/下、里/外、前/后等基本空间关系", observe: "动作指令、拼搭和纸笔任务" }
    ]
  },
  {
    id: "oral",
    category: "modulation",
    title: "口腔感觉与进食参与",
    scope: "口周照护、质地接受、咀嚼组织与安全进食参与",
    strategies: [
      "进食训练必须先确认吞咽和医疗安全，从可接受食物的相近味道、形状或质地做微小变化，不强迫进食。",
      "先进行可预测的口周外部准备和非食物口腔活动，再连接刷牙、饮水或进食等真实任务。"
    ],
    items: [
      { id: "oral_care", label: "接受擦口、刷牙和口周清洁等日常照护", observe: "记录工具、时长和可接受区域" },
      { id: "texture_range", label: "在安全前提下接受与年龄和能力相符的多种食物质地", observe: "不以强迫方式扩展食物" },
      { id: "bite_chew", label: "能按食物特性进行咬断和持续咀嚼", observe: "需由具备相应资质者判断安全" },
      { id: "oral_seeking", label: "能用安全、适当的方式满足咬、吸或口腔探索需要", observe: "减少咬衣物和非食物物品" },
      { id: "mealtime_participation", label: "能在进餐位置保持适当唤醒和参与，完成约定步骤", observe: "坐姿、餐具、等待和结束" }
    ]
  },
  {
    id: "postural",
    category: "sensorimotor",
    title: "姿势控制与眼动稳定",
    scope: "抗重力姿势、坐姿耐力、平衡反应与视线稳定",
    strategies: [
      "先建立脚部、骨盆和前臂支撑，再逐步延长坐姿和视觉任务时间；调整桌椅高度而不是反复口头提醒。",
      "在安全保护下使用缓慢重心转移、爬行和支撑活动，强调质量、对称和呼吸，不追求疲劳。"
    ],
    items: [
      { id: "seated_posture", label: "在合适桌椅支持下维持功能性坐姿5分钟", observe: "头颈、躯干、骨盆和脚部支撑" },
      { id: "antigravity", label: "能短时维持抗重力姿势完成爬、支撑或抬头活动", observe: "关注代偿、屏气与疲劳" },
      { id: "balance_reaction", label: "重心轻度偏移时能作出调整并恢复平衡", observe: "坐位、跪位和站位" },
      { id: "protective_response", label: "失衡时能出现保护性伸手或安全落地反应", observe: "仅在充分保护的任务中观察" },
      { id: "gaze_stability", label: "身体或头部轻度移动时仍能保持视线在任务目标上", observe: "抄写、投接和移动中看目标" }
    ]
  },
  {
    id: "bilateral",
    category: "sensorimotor",
    title: "双侧协调与跨中线",
    scope: "两侧身体配合、左右交替、跨中线和手的分工",
    strategies: [
      "从拍手、推拉、爬行等对称大动作过渡到左右交替，再迁移到剪纸、穿衣和稳定纸张等双手任务。",
      "材料放置应鼓励自然跨中线，避免用固定手强迫完成；观察优势手是否在任务中逐步稳定。"
    ],
    items: [
      { id: "symmetric", label: "两侧身体能同时完成拍、推、拉、跳等对称动作", observe: "从慢速节律开始" },
      { id: "alternating", label: "能完成左右交替的爬、踏步或拍击动作", observe: "关注顺序和持续轮次" },
      { id: "midline", label: "操作时能自然跨越身体中线取放物品", observe: "不频繁换手或转动全身代偿" },
      { id: "helper_hand", label: "双手任务中，一手操作、一手稳定材料，分工较清楚", observe: "剪纸、穿珠、开盒和穿衣" },
      { id: "hand_preference", label: "在熟悉精细任务中逐步形成较一致的操作手", observe: "不强行指定左右手" }
    ]
  },
  {
    id: "praxis",
    category: "sensorimotor",
    title: "动作计划与序列",
    scope: "动作构想、模仿、顺序执行、问题解决与迁移",
    strategies: [
      "使用示范、图片流程和固定动作口令，把新动作拆成可成功的小步骤，稳定后逐步减少提示。",
      "在相同动作目标下更换材料、方向或场地，观察学生能否迁移，而不是只记住单一训练套路。"
    ],
    items: [
      { id: "imitate", label: "观察示范后能模仿新的单步或组合身体动作", observe: "记录观察时间、提示和准确度" },
      { id: "idea", label: "面对熟悉材料能想出并开始一种合适的玩法或操作方式", observe: "减少等待成人直接安排" },
      { id: "sequence", label: "按图片或示范完成3步动作或操作序列", observe: "顺序、遗漏与重复" },
      { id: "adjust_plan", label: "动作失败后能在提示下调整姿势、方向或用力再次尝试", observe: "关注挫折耐受和问题解决" },
      { id: "generalize_motor", label: "能把已学动作迁移到新的材料、人员或环境中", observe: "至少比较两个情境" }
    ]
  },
  {
    id: "fineMotor",
    category: "sensorimotor",
    title: "精细动作与视觉运动",
    scope: "抓放、双手操作、工具使用、图形复制和生活操作",
    strategies: [
      "精细任务前先建立肩肘稳定和手掌觉醒，材料由大到小、由阻力明显到精细控制逐级调整。",
      "以真实学习和自理任务为载体，记录完成质量、时间和提示等级，避免只练脱离情境的手部动作。"
    ],
    items: [
      { id: "grasp_release", label: "能根据物品大小调整抓握并准确放到指定位置", observe: "积木、夹子、硬币和小物投放" },
      { id: "in_hand", label: "能在一只手内进行简单转移、调整或捏取操作", observe: "掌指转移、旋转笔或整理小物" },
      { id: "visual_motor", label: "能仿画或拼搭与能力水平相符的线条、形状或结构", observe: "质量优先于速度" },
      { id: "tool_use", label: "能安全使用剪刀、夹子、勺子或书写工具完成任务", observe: "关注握持、方向和辅助程度" },
      { id: "fasteners", label: "能参与拉链、按扣、旋盖或穿脱等双手精细步骤", observe: "选择符合当前生活目标的项目" }
    ]
  },
  {
    id: "regulation",
    category: "participation",
    title: "唤醒调节、注意与转衔",
    scope: "进入可学习状态、持续参与、等待、求助和恢复",
    strategies: [
      "把调节策略固定在课前准备、课中短休和活动结束三个节点，使用视觉日程、先后板和明确结束信号。",
      "教授可替代行为，如出示休息卡、请求帮助、深压或短暂重力工作，并记录恢复到任务的时间。"
    ],
    items: [
      { id: "ready_state", label: "在成人支持下进入适合当前活动的清醒与稳定状态", observe: "区分低唤醒、过度兴奋和焦虑" },
      { id: "sustain", label: "在匹配能力的任务中维持参与5-10分钟", observe: "记录有效参与时间和提示次数" },
      { id: "transition", label: "在预告和视觉支持下从一项活动转换到下一项", observe: "关注等待、结束和进入新活动" },
      { id: "request_break", label: "感觉负荷过高时能用约定方式请求休息、帮助或停止", observe: "口语、手势、图片或设备均可" },
      { id: "recover", label: "出现挫折或失调后，能借助已教策略恢复并重新参与", observe: "记录恢复时间和所需支持" }
    ]
  },
  {
    id: "participation",
    category: "participation",
    title: "课堂、生活与社会参与",
    scope: "学习任务、自理流程、游戏互动、安全与跨情境迁移",
    strategies: [
      "优先在课堂、进餐、穿脱、游戏等真实任务中嵌入支持，目标同时写明活动、情境、提示和完成标准。",
      "由治疗师、教师和家庭使用同一提示层级与记录方式，先稳定一个关键步骤，再扩展完整流程。"
    ],
    items: [
      { id: "class_task", label: "在课堂常规中进入座位、准备材料并完成约定任务片段", observe: "记录独立步骤和成人提示" },
      { id: "self_care", label: "按图片或环境线索参与一项穿脱、如厕、洗手或用餐流程", observe: "以真实自理优先事项选择" },
      { id: "play_social", label: "在游戏或小组活动中与同伴共享空间、材料或轮次", observe: "可使用成人支持和视觉规则" },
      { id: "safety", label: "在移动和器械活动中遵守停止、等待和边界等安全规则", observe: "不同人员和环境下复核" },
      { id: "generalization", label: "把已掌握的调节或动作策略应用到至少两个自然情境", observe: "比较训练室、课堂与家庭" }
    ]
  }
];

const form = document.getElementById("assessmentForm");
const domainList = document.getElementById("domainList");
const recordList = document.getElementById("recordList");
const toast = document.getElementById("toast");
const searchRecords = document.getElementById("searchRecords");
const cloudToggle = document.getElementById("cloudSyncToggle");
const consentDialog = document.getElementById("cloudConsentDialog");
const methodDialog = document.getElementById("methodDialog");

let records = loadRecords();
let activeId = null;
let draftTimer = null;
let cloudSyncTimer = null;
let toastTimer = null;
let cloudSettings = loadCloudSettings();
let lastAnalysis = null;
let lastCloudSyncAt = 0;
let lastSyncedSignature = "";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
    primaryNeed: record.primaryNeed === "智力发育迟缓" ? "全面发育迟缓/智力障碍" : (record.primaryNeed || "全面发育迟缓/智力障碍"),
    assessmentDate: record.assessmentDate || today(),
    evaluator: record.evaluator || "",
    setting: record.setting || "综合观察",
    cooperation: record.cooperation || "状态波动，需结合多次观察",
    communicationMode: "口语沟通",
    mobility: "独立移动",
    observationSources: [],
    background: record.background || "",
    medicalPrecautions: "",
    domains: nextDomains,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    migratedFrom: "v1"
  };
}

function loadRecords() {
  const current = readJsonStorage(STORAGE_KEY, []);
  if (Array.isArray(current) && current.length) return current;
  const legacy = readJsonStorage(LEGACY_STORAGE_KEY, []);
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const migrated = legacy.map(migrateLegacyRecord);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

function loadDraft() {
  const current = readJsonStorage(DRAFT_KEY, null);
  if (current) return current;
  const legacy = readJsonStorage(LEGACY_DRAFT_KEY, null);
  return legacy ? migrateLegacyRecord(legacy) : null;
}

function loadCloudSettings() {
  const value = readJsonStorage(CLOUD_SETTINGS_KEY, null);
  return value && typeof value === "object"
    ? { enabled: Boolean(value.enabled), deidentified: value.deidentified !== false, consentAt: value.consentAt || "" }
    : { enabled: false, deidentified: true, consentAt: "" };
}

function persistCloudSettings() {
  localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(cloudSettings));
}

function defaultDomainValue() {
  return { items: {}, impact: 0, support: "部分提示", note: "" };
}

function renderDomains() {
  const categoryLabels = {
    modulation: "感觉调节",
    sensorimotor: "感觉运动",
    participation: "调节与参与"
  };
  domainList.innerHTML = domains.map((domain, index) => `
    <details class="domain-card" data-domain-card="${domain.id}" data-category="${domain.category}" ${index === 0 ? "open" : ""}>
      <summary class="domain-summary">
        <span class="domain-title-block">
          <span class="domain-number">${String(index + 1).padStart(2, "0")}</span>
          <span>
            <h3>${escapeHtml(domain.title)}</h3>
            <p>${escapeHtml(categoryLabels[domain.category])} · ${escapeHtml(domain.scope)}</p>
          </span>
        </span>
        <span class="domain-score-summary">
          <span class="domain-average"><strong id="${domain.id}Average">—</strong><span id="${domain.id}Answered">0/5项</span></span>
          <span class="domain-state" id="${domain.id}State">未评</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </summary>
      <div class="domain-body">
        <div class="domain-controls">
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
          <div class="impact-control">
            <label for="${domain.id}Impact">对参与的影响</label>
            <select id="${domain.id}Impact" data-domain-impact="${domain.id}">
              ${impactLabels.map((label, impact) => `<option value="${impact}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </div>
        </div>
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
  `).join("");
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
  const data = {
    id: activeId,
    studentName: form.studentName.value.trim(),
    studentCode: form.studentCode.value.trim(),
    gender: form.gender.value,
    age: form.age.value.trim(),
    className: form.className.value.trim(),
    primaryNeed: form.primaryNeed.value,
    assessmentDate: form.assessmentDate.value || today(),
    evaluator: form.evaluator.value.trim(),
    setting: form.setting.value,
    cooperation: form.cooperation.value,
    communicationMode: form.communicationMode.value,
    mobility: form.mobility.value,
    observationSources,
    background: form.background.value.trim(),
    medicalPrecautions: form.medicalPrecautions.value.trim(),
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
  activeId = data.id || null;
  setField("studentName", data.studentName || "");
  setField("studentCode", data.studentCode || "");
  setField("gender", data.gender || "");
  setField("age", data.age || "");
  setField("className", data.className || "");
  setField("primaryNeed", data.primaryNeed || "全面发育迟缓/智力障碍");
  setField("assessmentDate", data.assessmentDate || today());
  setField("evaluator", data.evaluator || "");
  setField("setting", data.setting || "综合观察");
  setField("cooperation", data.cooperation || "资料充分，表现较稳定");
  setField("communicationMode", data.communicationMode || "口语沟通");
  setField("mobility", data.mobility || "独立移动");
  setField("background", data.background || "");
  setField("medicalPrecautions", data.medicalPrecautions || "");

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
  const rows = domains.map((domain) => {
    const value = data.domains?.[domain.id] || defaultDomainValue();
    const itemScores = domain.items.map((item) => ({ ...item, score: Number(value.items?.[item.id]) || null }));
    const rated = itemScores.filter((item) => item.score !== null);
    const average = rated.length ? rated.reduce((sum, item) => sum + item.score, 0) / rated.length : null;
    const valid = rated.length >= 3;
    const impact = Number(value.impact || 0);
    const priority = valid ? ((5.25 - average) * 1.2) + (impact * .65) : -1;
    return { ...domain, ...value, itemScores, answered: rated.length, average, valid, impact, priority };
  });

  const totalItems = domains.reduce((sum, domain) => sum + domain.items.length, 0);
  const answeredItems = rows.reduce((sum, row) => sum + row.answered, 0);
  const coverage = Math.round((answeredItems / totalItems) * 100);
  const validRows = rows.filter((row) => row.valid);
  const average = validRows.length ? validRows.reduce((sum, row) => sum + row.average, 0) / validRows.length : null;
  const student = data.studentName || data.studentCode || "该学生";

  let level = "资料不足";
  let summary = "至少完成3个领域、每个领域3项后生成综合分析。";
  if (average !== null) {
    if (average < 2) level = "高强度支持需求";
    else if (average < 3) level = "显著支持需求";
    else if (average < 4) level = "发展中";
    else level = "整体较稳定";

    const contextText = data.observationSources.length >= 2
      ? `结果综合了${data.observationSources.length}类观察来源`
      : "当前观察情境较少，建议补充课堂、生活或家庭资料";
    summary = `${contextText}。综合分反映当前支持条件下的功能表现，应结合各领域参与影响与具体观察解释。`;
  }

  const sortedPriority = validRows.slice().sort((a, b) => b.priority - a.priority);
  const stableRows = validRows.filter((row) => row.average >= 4 && row.impact <= 1).sort((a, b) => b.average - a.average);
  const relativeStrengths = stableRows.length ? stableRows : validRows.slice().sort((a, b) => b.average - a.average).slice(0, 2);
  const focusRows = sortedPriority.filter((row) => row.average < 4 || row.impact >= 2).slice(0, 4);

  const strengths = relativeStrengths.map((row) => {
    const bestItems = row.itemScores.filter((item) => item.score >= 4).slice(0, 2).map((item) => item.label);
    const detail = bestItems.length ? `较稳定表现包括：${bestItems.join("；")}` : "该领域为当前相对较好的功能基础";
    return `${row.title}（${row.average.toFixed(1)}分）：${detail}。`;
  });

  const needs = focusRows.map((row) => {
    const lowest = row.itemScores.filter((item) => item.score !== null).sort((a, b) => a.score - b.score).slice(0, 2);
    const detail = lowest.map((item) => `${item.label}（${item.score}级）`).join("；");
    return `${row.title}（${row.average.toFixed(1)}分，${impactLabels[row.impact]}）：优先关注${detail || "已记录的低分项目"}。`;
  });

  const goals = [];
  focusRows.slice(0, 4).forEach((row) => {
    const targetItem = row.itemScores.filter((item) => item.score !== null && item.score < 5).sort((a, b) => a.score - b.score)[0];
    if (!targetItem) return;
    const targetScore = Math.min(5, targetItem.score + 1);
    const support = targetItem.score <= 2
      ? "示范、视觉提示与必要身体协助"
      : targetItem.score === 3
        ? "视觉流程与少量语言提示"
        : "自然情境提示";
    const settings = data.observationSources.length >= 2 ? "至少2个自然情境" : "训练与一个自然情境";
    goals.push(`8周内，${student}在${support}下，能${targetItem.label}；在${settings}连续3次记录达到${targetScore}级（${scoreLevels[targetScore].label}），并记录提示次数与成功比例。`);
  });

  const strategies = [];
  focusRows.slice(0, 4).forEach((row) => {
    row.strategies.forEach((strategy) => {
      const item = `${row.title}：${strategy}`;
      if (!strategies.includes(item)) strategies.push(item);
    });
  });
  if (validRows.length) {
    strategies.push("跨专业记录：每次使用同一评分标准记录任务、情境、提示等级、成功比例和恢复时间；4-8周后按相同条件复评。");
  }

  if (!strengths.length) strengths.push("完成更多领域后，将显示学生当前相对稳定的能力和可用于带动训练的资源。");
  if (!needs.length) needs.push("完成更多领域后，将按功能分数和参与影响自动排序支持优先级。");
  if (!goals.length) goals.push("完成至少3个领域后，将根据具体低分项目生成可测量的8周阶段目标。");
  if (!strategies.length) strategies.push("完成评估后，将根据优先领域生成训练、课堂和生活情境支持策略。");

  return {
    average,
    coverage,
    answeredItems,
    totalItems,
    validDomainCount: validRows.length,
    level,
    summary,
    rows,
    strengths,
    needs,
    goals,
    strategies,
    priorities: focusRows,
    domainScores: Object.fromEntries(validRows.map((row) => [row.id, {
      title: row.title,
      score: Number(row.average.toFixed(2)),
      impact: row.impact,
      answered: row.answered
    }]))
  };
}

function refreshAnalysis() {
  const data = collectData();
  const result = analyze(data);
  lastAnalysis = result;

  document.getElementById("coverageText").textContent = `${result.coverage}%`;
  document.getElementById("coverageBar").style.width = `${result.coverage}%`;
  document.getElementById("averageScore").textContent = result.average === null ? "—" : result.average.toFixed(1);
  document.getElementById("overallLevel").textContent = result.level;
  document.getElementById("overallSummary").textContent = result.summary;
  document.getElementById("scoreRing").style.setProperty("--score-angle", `${result.average === null ? 0 : (result.average / 5) * 360}deg`);
  const state = document.getElementById("analysisState");
  state.textContent = result.average === null ? "等待评估" : `${result.validDomainCount}个有效领域`;
  state.classList.toggle("ready", result.average !== null);

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

  const tags = result.priorities.length
    ? result.priorities.map((row) => `<span class="${row.average < 2.5 || row.impact >= 3 ? "urgent" : ""}">${escapeHtml(row.title)} ${row.average.toFixed(1)}</span>`).join("")
    : "<span>完成评估后显示优先领域</span>";
  document.getElementById("priorityTags").innerHTML = tags;
  renderList("strengthList", result.strengths);
  renderList("needList", result.needs);
  renderList("goalList", result.goals);
  renderList("strategyList", result.strategies);
  queueDraftSave(data, result);
}

function renderList(id, values) {
  document.getElementById(id).innerHTML = values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");
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
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  document.getElementById("currentRecordTitle").textContent = data.studentName || data.studentCode;
  document.getElementById("lastSavedText").textContent = `更新于 ${formatDateTime(now)}`;
  return data;
}

function syncSignature(data, analysis) {
  const { createdAt, updatedAt, ...stableRecord } = data;
  return JSON.stringify({ deidentified: cloudSettings.deidentified, record: stableRecord, analysis });
}

function queueCloudSync(data, analysis, { immediate = false } = {}) {
  clearTimeout(cloudSyncTimer);
  if (!cloudSettings.enabled) return;
  if (!data.studentName && !data.studentCode) {
    updateSyncStatus("pending", "填写姓名或学生编号后自动上传");
    return;
  }
  if (cloudSettings.deidentified && !data.studentCode) {
    updateSyncStatus("pending", "已自动保存本机 · 填写学生编号后上传");
    return;
  }
  if (analysis.validDomainCount < 3) {
    updateSyncStatus("pending", "已自动保存本机 · 完成3个有效领域后上传");
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
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    const saved = saveRecordLocally(data);
    document.getElementById("draftState").textContent = saved ? "已自动保存" : "草稿已自动暂存";
    if (saved) queueCloudSync(saved, analysis);
  }, AUTO_SAVE_DELAY);
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
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
  if (silent && signature === lastSyncedSignature) return;
  if (!data.studentName && !data.studentCode) {
    updateSyncStatus("pending", "填写姓名或学生编号后自动上传");
    return;
  }
  if (cloudSettings.deidentified && !data.studentCode) {
    updateSyncStatus("pending", "已自动保存本机 · 填写学生编号后上传");
    if (!silent) showToast("本机已保存；填写学生编号后才能去标识化同步。 ");
    return;
  }
  if (analysis.validDomainCount < 3) {
    updateSyncStatus("pending", "已自动保存本机 · 完成3个有效领域后上传");
    return;
  }

  updateSyncStatus("enabled", "正在安全同步…");
  try {
    const response = await fetch(`${API_ORIGIN}/api/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent: true,
        deidentified: cloudSettings.deidentified,
        sessionId: getSessionId(),
        record: data,
        analysis
      }),
      keepalive
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "同步失败");
    lastCloudSyncAt = Date.now();
    lastSyncedSignature = signature;
    updateSyncStatus("enabled", `${cloudSettings.deidentified ? "去标识化" : "完整"}记录已自动上传 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    if (!silent) showToast("云端同步完成。 ");
  } catch (error) {
    updateSyncStatus("error", error.message || "云端暂时不可用");
    if (!silent) showToast("本机保存成功，但云端同步未完成。 ");
    if (silent && !keepalive && cloudSettings.enabled) {
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
  downloadFile(`${safeFilename(data.studentName || data.studentCode)}-感觉统合评估.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  showToast("已导出当前评估 JSON。 ");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportAllCsv() {
  const source = records.length ? records : [collectData()];
  const header = [
    "姓名", "学生编号", "性别", "年龄", "班级", "主要发展需要", "评估日期", "评估人", "主要情境", "观察来源", "综合分", "完成度", "总体等级",
    ...domains.map((domain) => `${domain.title}均分`),
    ...domains.map((domain) => `${domain.title}参与影响`),
    "优势摘要", "支持需要", "阶段目标"
  ];
  const rows = source.map((record) => {
    const result = analyze(record);
    return [
      record.studentName, record.studentCode, record.gender, record.age, record.className, record.primaryNeed,
      record.assessmentDate, record.evaluator, record.setting, (record.observationSources || []).join("、"),
      result.average === null ? "" : result.average.toFixed(2), `${result.coverage}%`, result.level,
      ...domains.map((domain) => {
        const row = result.rows.find((item) => item.id === domain.id);
        return row?.valid ? row.average.toFixed(2) : "";
      }),
      ...domains.map((domain) => impactLabels[record.domains?.[domain.id]?.impact || 0]),
      result.strengths.join("；"), result.needs.join("；"), result.goals.join("；")
    ];
  });
  const csv = "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadFile(`感觉统合评估数据-${today()}.csv`, csv, "text/csv;charset=utf-8");
  showToast("已导出 CSV 数据。 ");
}

function buildReportHtml(record) {
  const result = analyze(record);
  const domainSections = result.rows.map((row) => {
    const itemRows = row.itemScores.map((item) => `
      <tr><td>${escapeHtml(item.label)}</td><td>${item.score === null ? "未评" : `${item.score} · ${scoreLevels[item.score].label}`}</td></tr>
    `).join("");
    return `
      <section class="domain-report">
        <h3>${escapeHtml(row.title)} <span>${row.average === null ? "未形成领域分" : `${row.average.toFixed(1)}分 · ${impactLabels[row.impact]}`}</span></h3>
        <table><thead><tr><th>可观察表现</th><th>评分</th></tr></thead><tbody>${itemRows}</tbody></table>
        ${row.note ? `<p><b>观察记录：</b>${escapeHtml(row.note)}</p>` : ""}
      </section>
    `;
  }).join("");
  const list = (items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  const titleName = record.studentName || record.studentCode || "学生";

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(titleName)}-感觉统合功能评估报告</title>
  <style>
    body{margin:0;padding:30px;color:#1f2a33;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.65}
    header{border-bottom:2px solid #167b72;padding-bottom:14px}h1{margin:0;font-size:25px}header p{margin:5px 0 0;color:#687782}
    h2{margin:24px 0 9px;font-size:17px;border-bottom:1px solid #dfe5e8;padding-bottom:6px}h3{margin:16px 0 7px;font-size:14px}h3 span{float:right;color:#53616c;font-size:12px;font-weight:500}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px;margin:18px 0;padding:13px;border:1px solid #dfe5e8;background:#f8fafb}.meta b{color:#65737d}
    .score{font-size:28px;color:#167b72;font-weight:800}.notice{padding:9px 11px;border-left:4px solid #356b8c;background:#e8f0f6;color:#405f73}
    table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px;border:1px solid #dfe5e8;text-align:left;vertical-align:top}th{background:#f3f5f7}.domain-report{break-inside:avoid}
    ul{margin:7px 0;padding-left:20px}li{margin:4px 0}.foot{margin-top:25px;color:#77838d;font-size:10px}
    @media print{body{padding:0}.domain-report{break-inside:avoid}}
  </style></head><body>
  <header><h1>${escapeHtml(titleName)} 感觉统合功能评估报告</h1><p>学校场景功能性观察 · ${escapeHtml(record.assessmentDate || today())}</p></header>
  <p class="notice">本报告由功能性观察数据自动整理，不是标准化常模量表，不能替代医学诊断或完整作业治疗评估。</p>
  <div class="meta">
    <div><b>学生编号：</b>${escapeHtml(record.studentCode || "未填写")}</div><div><b>年龄：</b>${escapeHtml(record.age || "未填写")}</div><div><b>性别：</b>${escapeHtml(record.gender || "未填写")}</div>
    <div><b>班级：</b>${escapeHtml(record.className || "未填写")}</div><div><b>主要发展需要：</b>${escapeHtml(record.primaryNeed || "未填写")}</div><div><b>评估人：</b>${escapeHtml(record.evaluator || "未填写")}</div>
    <div><b>主要情境：</b>${escapeHtml(record.setting || "未填写")}</div><div><b>观察来源：</b>${escapeHtml((record.observationSources || []).join("、") || "未填写")}</div><div><b>完成度：</b>${result.coverage}%</div>
    <div><b>综合分：</b><span class="score">${result.average === null ? "—" : result.average.toFixed(1)}</span></div><div><b>总体等级：</b>${escapeHtml(result.level)}</div><div><b>有效领域：</b>${result.validDomainCount}/${domains.length}</div>
  </div>
  <h2>背景、安全与解释</h2><p><b>主要关切：</b>${escapeHtml(record.background || "未填写")}</p><p><b>医疗与安全：</b>${escapeHtml(record.medicalPrecautions || "未填写")}</p><p>${escapeHtml(result.summary)}</p>
  <h2>相对优势</h2>${list(result.strengths)}<h2>优先支持需要</h2>${list(result.needs)}<h2>8周阶段目标</h2>${list(result.goals)}<h2>训练、课堂与生活支持</h2>${list(result.strategies)}
  <h2>领域与项目明细</h2>${domainSections}
  <p class="foot">评分：1全程协助，2大量协助，3部分提示，4少量提示，5独立稳定；每个领域至少完成3项才形成领域分。建议由具备相关专业能力的人员结合多情境观察、家庭优先事项和跨专业资料解释。</p>
  </body></html>`;
}

function exportReport() {
  const data = collectData();
  downloadFile(`${safeFilename(data.studentName || data.studentCode)}-感觉统合功能评估报告.html`, buildReportHtml(data), "text/html;charset=utf-8");
  showToast("已导出 HTML 评估报告。 ");
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

function refreshCloudUi() {
  cloudToggle.checked = cloudSettings.enabled;
  const description = document.getElementById("cloudDescription");
  if (!cloudSettings.enabled) {
    description.textContent = "自动保存于本机；云同步未启用";
    updateSyncStatus("", "未启用 · 仅自动保存在本机");
    return;
  }
  description.textContent = cloudSettings.deidentified ? "已启用去标识化自动同步" : "已启用完整记录自动同步";
  updateSyncStatus("enabled", `${cloudSettings.deidentified ? "去标识化" : "完整"}同步已启用 · 更改后自动上传`);
}

function openConsentDialog() {
  document.getElementById("consentAuthority").checked = false;
  document.getElementById("confirmCloudBtn").disabled = true;
  const mode = cloudSettings.deidentified ? "deidentified" : "full";
  consentDialog.querySelector(`input[name="syncMode"][value="${mode}"]`).checked = true;
  consentDialog.showModal();
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

function attachEvents() {
  domainList.addEventListener("click", (event) => {
    const button = event.target.closest(".rating-button");
    if (!button) return;
    const scale = button.closest(".rating-scale");
    scale.dataset.value = button.dataset.score;
    updateRatingFeedback(scale);
    refreshAnalysis();
  });

  form.addEventListener("input", refreshAnalysis);
  form.addEventListener("change", refreshAnalysis);

  document.getElementById("categoryFilter").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    document.querySelectorAll("#categoryFilter button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".domain-card").forEach((card) => {
      card.hidden = button.dataset.category !== "all" && card.dataset.category !== button.dataset.category;
    });
  });

  document.querySelector(".result-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-result-tab]");
    if (!button) return;
    document.querySelectorAll(".result-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".result-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.resultPanel === button.dataset.resultTab));
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
  document.getElementById("printBtn").addEventListener("click", printReport);
  document.getElementById("exportJsonBtn").addEventListener("click", exportCurrentJson);
  document.getElementById("exportCsvBtn").addEventListener("click", exportAllCsv);
  document.getElementById("exportReportBtn").addEventListener("click", exportReport);
  document.getElementById("importJsonBtn").addEventListener("click", () => document.getElementById("importJsonInput").click());
  document.getElementById("importJsonInput").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importJson(file);
    event.target.value = "";
  });

  document.getElementById("methodBtn").addEventListener("click", () => methodDialog.showModal());
  document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.getElementById("privacyManageBtn").addEventListener("click", openConsentDialog);

  cloudToggle.addEventListener("change", () => {
    if (cloudToggle.checked) {
      cloudToggle.checked = cloudSettings.enabled;
      openConsentDialog();
    } else {
      clearTimeout(cloudSyncTimer);
      cloudSettings.enabled = false;
      persistCloudSettings();
      refreshCloudUi();
      showToast("云端同步已停用；本机档案不受影响。 ");
    }
  });

  document.getElementById("consentAuthority").addEventListener("change", (event) => {
    document.getElementById("confirmCloudBtn").disabled = !event.target.checked;
  });
  document.getElementById("confirmCloudBtn").addEventListener("click", () => {
    const selected = consentDialog.querySelector('input[name="syncMode"]:checked').value;
    cloudSettings = { enabled: true, deidentified: selected === "deidentified", consentAt: new Date().toISOString() };
    persistCloudSettings();
    consentDialog.close();
    refreshCloudUi();
    const data = collectData();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    const saved = saveRecordLocally(data);
    queueCloudSync(saved || data, analyze(saved || data), { immediate: true });
    showToast(`${cloudSettings.deidentified ? "去标识化" : "完整记录"}自动同步已启用。`);
  });

  methodDialog.addEventListener("click", (event) => {
    if (event.target === methodDialog) methodDialog.close();
  });
  consentDialog.addEventListener("click", (event) => {
    if (event.target === consentDialog) consentDialog.close();
  });

  const deleteButton = document.getElementById("deleteRecordBtn");
  if (deleteButton) deleteButton.addEventListener("click", deleteCurrentRecord);

  window.addEventListener("pagehide", () => {
    clearTimeout(draftTimer);
    const data = collectData();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    const saved = saveRecordLocally(data, { render: false });
    if (saved && cloudSettings.enabled) {
      clearTimeout(cloudSyncTimer);
      syncRecord(saved, analyze(saved), { silent: true, keepalive: true });
    }
  });
}

function init() {
  renderDomains();
  attachEvents();
  refreshCloudUi();
  const draft = loadDraft();
  applyData(draft || { assessmentDate: today(), domains: {} });
  if (records.some((record) => record.migratedFrom === "v1")) showToast("旧版评估档案已自动迁移到新版结构。 ");
  sendAnalytics("visit");
  setInterval(() => sendAnalytics("heartbeat"), 45_000);
}

init();
