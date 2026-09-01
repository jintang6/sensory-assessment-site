export const referenceFrameworks = Object.freeze({
  schoolFunctionalObservation: {
    id: "schoolFunctionalObservation",
    title: "学校自然情境功能性观察框架",
    application: "用于记录学生在课堂、生活、游戏和校园活动中的实际完成、所需支持、参与影响与环境条件。",
    scoring: "本站统一使用1至5级功能表现评分，分数越高表示在当前条件下越独立、稳定。"
  },
  siPractical: {
    id: "siPractical",
    title: "《感统评估表-实操》",
    application: "参考其感觉调节类型、感觉辨别、姿势控制、眼动控制、动作计划、自我调节与参与总结结构。",
    scoring: "按可观察功能表现整理，不复制原表结论，也不输出原表总分。"
  },
  siQuestionnaire: {
    id: "siQuestionnaire",
    title: "《感统评估-问卷》",
    application: "参考近3个月的自我调节、注意学习和听觉、视觉、触觉、嗅味觉、前庭、本体觉频率回顾框架。",
    scoring: "原问卷的频率等级仅作为访谈线索，不直接换算为本站功能分。"
  },
  languageDelay: {
    id: "languageDelay",
    title: "《语言发育迟缓检查表》S-S法结构",
    application: "参考生理学检查、符号与指示内容关系、语言发展阶段、基础性过程、交流态度及理解表达任务。",
    scoring: "本站只作阶段线索和功能表现整理，正式阶段判定须依原表流程由具备能力的专业人员完成。"
  },
  articulation: {
    id: "articulation",
    title: "《构音障碍检查表》",
    application: "参考呼吸、发声、口腔外围结构与运动、构音部位方式、连续言语可懂度、错误类型和可诱导性。",
    scoring: "本站为学校筛查与记录，不据此单独诊断构音障碍、言语失用或嗓音疾病。"
  },
  upperLimbSchool: {
    id: "upperLimbSchool",
    title: "《上肢能力发展筛查表（学校自编）》",
    application: "参考双侧肌张力、关节与主动活动范围、双手协调、抓握捏取、自理和书写功能。",
    scoring: "原表0至3级项目在本站以统一1至5级支持程度记录，不等同原表102分总分。"
  },
  gmfm88: {
    id: "gmfm88",
    title: "《粗大运动功能评估表（GMFM-88）》",
    application: "参考卧位与翻身、坐位、爬与跪、站立、走跑跳五大维度安排结构化动作观察。",
    scoring: "本站为GMFM-88结构参考模式，未复制88项正式计分，不生成正式GMFM维度百分比或总分。"
  },
  schoolGrossMotor: {
    id: "schoolGrossMotor",
    title: "《粗大动作评估量表》",
    application: "参考单脚站、跨越、侧向与后退移动、变向跑、跳跃、下蹲、踢球和躯干伸取等校本任务。",
    scoring: "原表0至3级协助程度在本站以统一1至5级支持程度记录，用于阶段比较。"
  }
});

const upperLimbReferenceDomains = new Set([
  "otUpperLimbToneRange", "otPosturalUpperLimb", "otFineMotor", "otVisualMotor", "otBilateralPraxis",
  "otDressing", "otHygieneToileting", "otFeedingTools"
]);
const languageReferenceDomains = new Set([
  "stCommunicationFoundations", "stLanguageDevelopmentStage", "stLanguageFoundationalProcess",
  "stReceptiveLanguage", "stExpressiveLanguage", "stFunctionalAAC", "stSocialCommunication", "stCognitiveLiteracy"
]);
const articulationReferenceDomains = new Set([
  "stSpeechSound", "stMotorSpeech", "stOralPeripheralMechanism", "stVoiceResonance"
]);
const gmfmReferenceDomains = new Set([
  "ptGmfmLyingRolling", "ptGmfmSitting", "ptGmfmCrawlingKneeling", "ptGmfmStanding",
  "ptGmfmWalkingRunningJumping", "ptPostureAlignment", "ptRangeStrength", "ptMotorControl", "ptTransfers",
  "ptMobility", "ptStairsTerrain", "ptBalanceProtection", "ptCoordination"
]);
const schoolGrossMotorReferenceDomains = new Set([
  "ptSchoolGrossMotorSkills", "ptMobility", "ptStairsTerrain", "ptBalanceProtection", "ptCoordination"
]);

function referenceIdsFor(domain) {
  const ids = ["schoolFunctionalObservation"];
  if (domain.professional === "si") ids.push("siPractical", "siQuestionnaire");
  if (upperLimbReferenceDomains.has(domain.id)) ids.push("upperLimbSchool");
  if (languageReferenceDomains.has(domain.id)) ids.push("languageDelay");
  if (articulationReferenceDomains.has(domain.id)) ids.push("articulation");
  if (gmfmReferenceDomains.has(domain.id)) ids.push("gmfm88");
  if (schoolGrossMotorReferenceDomains.has(domain.id)) ids.push("schoolGrossMotor");
  return [...new Set(ids)];
}

function assessmentMethodFor(domain) {
  if (domain.professional === "si") return "教师/照护者回顾 + 自然情境观察 + 结构化感觉运动任务";
  if (domain.professional === "ot") return upperLimbReferenceDomains.has(domain.id)
    ? "真实作业任务 + 结构化上肢操作 + 左右侧比较"
    : "真实课堂与生活任务 + 活动分析 + 环境支持比较";
  if (articulationReferenceDomains.has(domain.id)) return "口腔外围机制观察 + 音节/词语/连续言语样本";
  if (domain.professional === "st") return "实物/图片/动作任务 + 自然沟通样本 + 教师或家庭访谈";
  if (domain.professional === "pt") return "结构化动作任务 + 校园移动观察 + 必要的近身保护";
  return "多情境功能性观察";
}

function scoringNoteFor(domain) {
  if (domain.id.startsWith("ptGmfm")) return "GMFM原表采用0至3级；本站1至5级仅反映任务支持程度，不能换算正式GMFM分数。";
  if (domain.id === "ptSchoolGrossMotorSkills") return "校本原表采用0至3级；本站1至5级用于统一跨专业报告和复评比较。";
  if (domain.id === "stLanguageDevelopmentStage") return "按最高稳定完成的阶段项目提供发展线索，不自动作S-S法正式阶段诊断。";
  if (upperLimbReferenceDomains.has(domain.id)) return "记录左右侧、动作质量、疼痛及代偿；本站分数不等同校本上肢筛查原始总分。";
  if (domain.professional === "si") return "感觉行为频率只作背景；项目分数统一表示功能完成和恢复程度，分数越高越稳定。";
  return "1至5级按完成比例、提示程度和跨次稳定性综合选择；未观察保留未评。";
}

const makeItems = (rows) => rows.map(([id, label, observe, metadata = {}]) => ({ id, label, observe, ...metadata }));

const makeDomain = ({ items, ...domain }) => {
  const referenceIds = domain.referenceIds || referenceIdsFor(domain);
  return {
    ...domain,
    assessmentMethod: domain.assessmentMethod || assessmentMethodFor(domain),
    scoringNote: domain.scoringNote || scoringNoteFor(domain),
    referenceIds,
    references: referenceIds.map((id) => referenceFrameworks[id]).filter(Boolean),
    minimumItems: Math.max(3, Math.ceil(items.length * 0.6)),
    items: makeItems(items)
  };
};

export const domains = [
  // SI: 12 domains, preserving the original domain ids for existing records.
  makeDomain({
    id: "tactile", category: "modulation", professional: "si",
    title: "触觉调节与触觉辨别", scope: "轻触与深压反应、材料探索、身体照护、触觉定位与辨别",
    strategies: [
      "先使用可预测的深压和本体觉准备，再由干爽、熟悉材料逐步过渡到湿黏、颗粒或轻触活动。",
      "身体照护前进行视觉预告并建立明确的继续、暂停和停止信号，避免突然或不可控的触碰。"
    ],
    items: [
      ["touch_people", "在预告后接受成人为穿衣、摆位或安全保护而进行的必要触碰", "比较熟悉与不熟悉人员，记录回避、僵硬和恢复时间"],
      ["light_touch", "面对他人轻触或近距离经过时能保持活动，不持续防御或分心", "排队、同伴接近、衣物轻擦和拥挤环境"],
      ["deep_pressure", "能接受并利用合适的深压、拥抱替代或负重活动帮助身体稳定", "必须尊重学生主动同意和停止信号"],
      ["touch_materials", "主动接触并操作不同温度和质地的学习、游戏或生活材料", "干湿、软硬、光滑粗糙及颗粒材料"],
      ["grooming", "耐受洗手、擦脸、梳头、剪指甲等日常身体照护步骤", "记录可完成步骤、工具、时长和支持方式"],
      ["tactile_discrimination", "能在视觉辅助减少时定位触碰部位或凭触觉辨认熟悉物品特征", "双侧身体定位、袋中取物、大小形状或质地区分"]
    ]
  }),
  makeDomain({
    id: "vestibular", category: "modulation", professional: "si",
    title: "前庭调节与重力安全感", scope: "姿势变化、双脚离地、线性与旋转移动、停止控制及活动后恢复",
    strategies: [
      "从可预测、可主动停止的慢速线性移动开始，逐步改变方向、幅度或速度，每次只增加一个变量。",
      "旋转活动须严格控制并观察面色、眼神、呼吸、恶心或异常兴奋，活动后连接稳定的本体觉任务。"
    ],
    items: [
      ["position_change", "接受坐、跪、趴、站及头位变化，并保持情绪与身体稳定", "地面活动、器械活动和课堂体位转换"],
      ["gravity_security", "面对台阶、斜坡、低高度器械或重心变化时有与风险相称的安全反应", "区分过度恐惧、动作冻结与缺乏危险意识"],
      ["feet_off_ground", "在充分保护下参与双脚离地或支撑面移动的活动", "秋千、滑板、平衡台或替代性活动"],
      ["linear_motion", "耐受前后、左右和上下的线性移动，不出现持续回避或失控兴奋", "记录可接受的速度、幅度、时长和方向"],
      ["rotary_motion", "在专业人员控制下对少量旋转刺激作出适度反应", "记录次数、眼震、眩晕、恶心及恢复表现"],
      ["stop_recover", "能响应停止信号，并在运动结束后较快恢复定向和进入下一任务", "记录停止所需提示及2分钟内的恢复状态"]
    ]
  }),
  makeDomain({
    id: "proprioceptive", category: "modulation", professional: "si",
    title: "本体觉与身体觉", scope: "身体位置、关节稳定、力量分级、空间距离与重力工作后的组织",
    strategies: [
      "在桌面学习和转衔前安排推、拉、搬运、支撑等有目的的重力工作，并比较活动前后参与变化。",
      "使用轻、中、重的视觉刻度和即时结果反馈练习力量分级，避免单纯追求更强刺激。"
    ],
    items: [
      ["body_position", "在视觉辅助减少时大致判断四肢位置并调整身体姿势", "模仿姿势、穿衣、闭眼定位及器械活动"],
      ["force_grade", "拿取、推拉、投掷和书写时能按物品与任务调整用力大小", "观察过轻掉落、过重损坏或动作僵硬"],
      ["space_body", "移动时注意自己与人、物和边界的距离，减少无意碰撞", "走廊、排队、操场和训练室"],
      ["joint_stability", "肩、肘、腕、髋和躯干能为移动或操作提供较稳定支撑", "爬行、推撑、站立和桌面精细任务"],
      ["heavy_work_response", "适量抗阻活动后唤醒水平、动作控制或注意表现更有组织", "比较活动前后5至10分钟，不预设一定有效"],
      ["seek_pressure_safely", "需要用力或挤压时能选择安全方式，不撞人、撞物或过度用力", "教授并观察可替代的推墙、搬运或握压方式"]
    ]
  }),
  makeDomain({
    id: "auditory", category: "modulation", professional: "si",
    title: "听觉调节与听觉信息处理", scope: "声音耐受、声源定位、呼名与安全回应、背景声过滤和节律反应",
    strategies: [
      "减少无关背景声，确认注意后使用短句、停顿和视觉支持，并记录重复次数和反应延迟。",
      "对不可避免的声音提前预告，提供降噪、安静位置或短暂离开的选择，再逐步建立功能性耐受。"
    ],
    items: [
      ["sound_tolerance", "耐受课堂和校园常见声音，不因普通声响持续中断活动", "铃声、谈话、拖椅、器材声和广播"],
      ["unexpected_sound", "面对突发但非危险声音时能在支持下恢复，而非长时间惊吓或失控", "记录诱因、恢复时间和有效支持"],
      ["sound_location", "能寻找并大致定位呼名、提示音或环境声来源", "比较左右、前后及不同距离"],
      ["name_safety", "在适当音量下回应姓名以及停止、等待、过来等安全指令", "排除听力状态和理解困难后解释"],
      ["noise_filter", "存在低至中等背景谈话时仍能关注主要教师或任务声音", "比较安静、小组和集体情境"],
      ["auditory_sequence", "能模仿简单节律或按顺序回应2至3个声音信息", "拍击节律、声音配对和短序列"]
    ]
  }),
  makeDomain({
    id: "visual", category: "modulation", professional: "si",
    title: "视觉调节与视觉信息处理", scope: "光线与移动视觉耐受、注视追踪、扫描、辨别及视觉空间组织",
    strategies: [
      "减少桌面视觉拥挤，使用清晰边界、适度对比和由左到右的扫描提示，再逐步增加材料数量。",
      "视觉任务与姿势稳定、休息和照明调整结合，避免在疲劳或高唤醒状态下持续增加负荷。"
    ],
    items: [
      ["visual_tolerance", "适应常见室内光线、反光、颜色和屏幕亮度，不持续回避或寻求", "比较自然光、灯光、投影和屏幕"],
      ["moving_visual", "在人群移动或动态画面中能保持定向，不明显眩晕、追视或失去任务", "走廊、操场、视频和窗外移动信息"],
      ["fixation", "能把视线短时保持在与活动相关的人、物或符号上", "允许以适合学生的注视方式完成任务"],
      ["tracking", "头部相对稳定时，双眼能跟随缓慢移动目标", "横向、纵向、斜向和跨中线"],
      ["visual_scan", "能按一定顺序扫描桌面或空间并找到目标物", "从2至4个物品逐步增加到复杂背景"],
      ["visual_discrimination", "能辨认常见形状、大小、颜色、图形或空间位置的相同与不同", "配对、分类、拼图和实际取物"]
    ]
  }),
  makeDomain({
    id: "oral", category: "modulation", professional: "si",
    title: "口腔、嗅味觉调节与进食参与", scope: "口周照护、气味味道、质地接受、口腔寻求及安全进餐参与",
    strategies: [
      "从学生已接受食物的相近气味、形状或质地做微小变化，不强迫、不以撤走食物作为惩罚。",
      "出现呛咳、湿嗓、呼吸变化、反复肺部感染或明显吞咽困难时，停止自行训练并转介吞咽专业评估。"
    ],
    items: [
      ["oral_care", "接受擦口、刷牙和口周清洁等日常照护", "记录工具、时长、可接受区域和自主停止信号"],
      ["smell_tolerance", "面对校园和进餐常见气味时能维持活动，不持续恶心、回避或强烈寻求", "食堂、厕所、颜料和清洁用品等情境"],
      ["taste_range", "在安全和自愿前提下接受一定范围的味道，不因单一偏好严重限制参与", "记录可接受味道，不以数量代替安全判断"],
      ["texture_range", "接受与当前咀嚼和吞咽能力相符的若干食物质地", "只在已确认安全的食物范围内观察"],
      ["oral_seeking", "能用安全方式满足咬、吸或口腔探索需要", "减少咬衣物、手或非食物物品"],
      ["mealtime_participation", "在合适坐姿和唤醒状态下参与进餐流程并表达继续、停止或不适", "观察餐具、等待、节奏、时长和同伴参与"]
    ]
  }),
  makeDomain({
    id: "postural", category: "sensorimotor", professional: "si",
    title: "姿势控制与眼动稳定", scope: "抗重力姿势、坐姿耐力、平衡保护反应、眼动控制与头眼协调",
    strategies: [
      "先提供脚、骨盆和前臂支撑，再逐步延长姿势维持时间；优先调整桌椅和任务位置。",
      "在充分保护下练习缓慢重心转移、爬行和支撑，强调对称、呼吸和动作质量。"
    ],
    items: [
      ["seated_posture", "在合适桌椅支持下维持功能性坐姿并参与任务5分钟", "观察头颈、躯干、骨盆、脚部及代偿"],
      ["antigravity", "能短时维持趴卧伸展、仰卧屈曲、爬或支撑等抗重力姿势", "关注屏气、颤抖、疲劳和动作质量"],
      ["balance_reaction", "重心轻度偏移时能调整身体并恢复稳定", "坐位、跪位和站位，须有安全保护"],
      ["protective_response", "失衡时出现与方向相符的保护性伸手或安全落地反应", "不得通过高风险推倒方式诱发"],
      ["gaze_stability", "头部或身体轻度移动时仍能保持视线在任务目标上", "看板书、投接、移动中看目标"],
      ["eye_movement", "能完成基本注视转换、追踪和扫视而不过度依赖头部整体转动", "近远目标、左右目标和寻找任务"]
    ]
  }),
  makeDomain({
    id: "bilateral", category: "sensorimotor", professional: "si",
    title: "双侧协调、节律与跨中线", scope: "两侧身体同步、左右交替、跨中线、双手分工和优势侧稳定",
    strategies: [
      "从拍手、推拉和爬行等对称动作过渡到左右交替，再迁移到穿衣、剪纸和稳定材料等双手任务。",
      "通过材料位置鼓励自然跨中线，观察优势手逐步稳定，不强迫指定左右手。"
    ],
    items: [
      ["symmetric", "两侧身体能同时完成拍、推、拉、支撑或跳等对称动作", "从慢速和短序列开始"],
      ["alternating", "能完成左右交替的爬、踏步、拍击或器械动作", "记录顺序、节律和持续轮次"],
      ["rhythm", "能跟随简单视觉或听觉节律连续完成动作", "拍手、踏步、传球或替代性动作"],
      ["midline", "操作时能自然跨越身体中线取放物品", "观察频繁换手或转动全身代偿"],
      ["helper_hand", "双手任务中一手操作、一手稳定材料，分工较清楚", "开盒、穿珠、剪纸、穿衣和用餐"],
      ["hand_preference", "在熟悉精细任务中呈现较一致的操作手和辅助手", "跨多次观察判断，不以单次表现定侧"]
    ]
  }),
  makeDomain({
    id: "praxis", category: "sensorimotor", professional: "si",
    title: "动作构想、计划与序列", scope: "动作构想、模仿、顺序执行、双侧整合、问题解决和动作迁移",
    strategies: [
      "使用示范、图片流程和固定关键词把新动作拆成可成功步骤，稳定后逐步减少一种提示。",
      "保持动作目标不变而更换材料、方向或场地，观察真正迁移，而非只记住单一训练套路。"
    ],
    items: [
      ["idea", "面对熟悉材料能想出并开始一种合适玩法或操作方式", "观察是否总等待成人直接安排"],
      ["imitate", "观察示范后能模仿新的单步或组合身体动作", "记录观察时间、提示类型和准确度"],
      ["sequence", "按图片、口令或示范完成3步动作或操作序列", "记录遗漏、颠倒、重复和中断"],
      ["motor_timing", "能在合适时间启动、停止并衔接连续动作", "障碍路线、接球、节律或生活流程"],
      ["adjust_plan", "动作失败后能在提示下调整姿势、方向或用力再次尝试", "关注问题解决和挫折恢复"],
      ["generalize_motor", "把已学动作迁移到新的材料、人员或环境", "至少比较两个情境和两次观察"]
    ]
  }),
  makeDomain({
    id: "fineMotor", category: "sensorimotor", professional: "si",
    title: "精细动作与视觉运动整合", scope: "抓放、掌内操作、手眼协调、工具使用、图形复制和生活操作",
    strategies: [
      "精细任务前建立肩肘稳定和手掌觉醒，材料由大到小、由阻力明显到精细控制逐步调整。",
      "以真实学习和自理任务为载体，同时记录完成质量、时间和提示等级。"
    ],
    items: [
      ["grasp_release", "能根据物品大小调整抓握并准确放到指定位置", "积木、夹子、硬币和小物投放"],
      ["finger_isolation", "能分化使用手指完成按、捏、拨、指等动作", "触屏、按钮、贴纸和小物操作"],
      ["in_hand", "能在一只手内进行简单转移、调整或旋转", "掌指转移、旋转笔和整理小物"],
      ["visual_motor", "能仿画或拼搭与能力水平相符的线条、形状或结构", "质量优先于速度"],
      ["tool_use", "能安全使用剪刀、夹子、勺子或书写工具完成任务", "观察握持、方向、力度和辅助程度"],
      ["fasteners", "能参与拉链、按扣、旋盖、穿脱等双手精细步骤", "选择与当前生活目标相关的项目"]
    ]
  }),
  makeDomain({
    id: "regulation", category: "participation", professional: "si",
    title: "唤醒调节、内感受与注意", scope: "清醒水平、身体内部信号、持续注意、自我调节、求助和失调后恢复",
    strategies: [
      "把调节策略固定在活动前准备、活动中短休和结束恢复三个节点，并用简单视觉刻度记录效果。",
      "教授学生识别饥饿、口渴、如厕、疼痛、疲劳和情绪信号，并用现有沟通方式表达。"
    ],
    items: [
      ["ready_state", "在成人支持下进入适合当前活动的清醒、稳定状态", "区分低唤醒、过度兴奋、焦虑和疲劳"],
      ["body_signal", "能注意并以动作、图片或语言表达基本身体内部信号", "口渴、饥饿、如厕、疼痛、冷热和疲劳"],
      ["sustain", "在匹配能力的活动中维持有效参与5至10分钟", "记录有效参与时间和提示次数"],
      ["choose_strategy", "在支持下选择一种已教的调节方式并观察是否有效", "休息、深压、重力工作、安静位置或呼吸节奏"],
      ["request_break", "感觉负荷过高时能用约定方式请求休息、帮助或停止", "口语、手势、图片或设备均可"],
      ["recover", "出现挫折或失调后能借助已教策略恢复并重新参与", "记录恢复时间、支持和再次进入任务质量"]
    ]
  }),
  makeDomain({
    id: "participation", category: "participation", professional: "si",
    title: "感觉调节在自然活动中的参与", scope: "课堂准备、转衔、自理、游戏互动、安全和跨情境策略迁移",
    strategies: [
      "把感觉支持嵌入课堂、进餐、穿脱和游戏等真实活动，目标同时写明情境、提示和可观察完成标准。",
      "由治疗师、教师和家庭使用一致的调节词汇与记录方式，先验证策略是否真正改善参与。"
    ],
    items: [
      ["class_task", "借助合适感觉与环境支持进入座位、准备材料并完成任务片段", "记录策略前后参与质量而非只看安静程度"],
      ["transition", "在预告和视觉支持下从一项活动转换到下一项", "关注等待、结束和进入新活动"],
      ["self_care", "调节状态足以参与穿脱、如厕、洗手或进餐中的约定步骤", "选择一个真实自理优先事项"],
      ["play_social", "在游戏或小组活动中共享空间、材料或轮次", "观察感觉负荷对同伴参与的影响"],
      ["safety", "在移动和器械活动中回应停止、等待和边界等安全规则", "不同人员和环境下复核"],
      ["generalization", "把已掌握的感觉调节策略用于至少两个自然情境", "比较训练室、课堂、家庭或社区"]
    ]
  }),

  // OT: occupation-centered school functional assessment.
  makeDomain({
    id: "otClassroomParticipation", category: "occupation", professional: "ot",
    title: "课堂常规与学习参与", scope: "入座准备、听从课堂流程、任务启动、完成、整理和跨活动参与",
    strategies: ["使用清晰的任务起点、完成盒、视觉流程和有限材料，逐步减少一种成人提示。"],
    items: [
      ["enter_prepare", "进入课堂后到达指定位置并准备本节所需材料", "记录环境线索和成人提示"],
      ["task_start", "接收指令后在合理等待时间内启动熟悉任务", "区分理解、动作和调节因素"],
      ["task_persist", "在匹配能力的学习任务中持续参与至约定结束", "记录时长、中断原因和恢复"],
      ["task_complete", "按质量要求完成任务的主要步骤，而非只追求速度", "比较独立步骤和提示步骤"],
      ["organize_materials", "取用、保管和归位常用学习材料", "书包、文具、作业和个人物品"],
      ["class_generalize", "在不同教师、座位或课程中使用已掌握的课堂常规", "至少比较两个课堂情境"]
    ]
  }),
  makeDomain({
    id: "otExecutiveFunction", category: "occupation", professional: "ot",
    title: "任务组织与执行功能", scope: "目标理解、工作记忆、步骤计划、时间感、抑制控制和问题解决",
    strategies: ["把任务外化为图片步骤、清单和可见时间，先减少记忆负担，再训练独立计划与检查。"],
    items: [
      ["understand_goal", "能确认任务要完成什么以及何时算完成", "使用示例、完成标准或视觉结果"],
      ["remember_steps", "在支持下记住并执行2至3个连续步骤", "记录重复和回看提示次数"],
      ["plan_sequence", "开始前能选择材料并安排基本操作顺序", "熟悉学习或生活任务"],
      ["time_awareness", "借助计时器或日程理解开始、持续和结束", "观察等待、拖延和过快结束"],
      ["inhibit_shift", "能暂停不合适动作并在提示下转换策略", "游戏规则、错误修正和活动转换"],
      ["self_check", "完成后能按图片或示例检查遗漏并作简单修正", "不由成人直接指出全部答案"]
    ]
  }),
  makeDomain({
    id: "otUpperLimbToneRange", category: "performance", professional: "ot",
    title: "上肢肌张力、关节与主动活动范围", scope: "左右肩、肘、腕与拇指的肌张力表现、挛缩风险、主动活动范围、疼痛和代偿",
    strategies: [
      "先在安静、稳定体位下比较左右侧，再把结果放回伸取、承重、抓握、书写和自理任务中解释。",
      "出现疼痛、持续关节受限、明显不对称、皮肤问题或功能突然退步时，停止强行活动并转介进一步检查。"
    ],
    items: [
      ["shoulder_tone", "左右肩部肌张力表现允许学生主动伸取、承重或摆位", "分别记录左、右侧偏高、偏低、波动及对功能的影响"],
      ["elbow_tone", "左右肘部肌张力表现允许屈伸并把手带到任务位置", "比较主动与协助运动，记录联带、阻力和代偿"],
      ["wrist_tone", "左右腕手肌张力表现允许腕部稳定和手指分化操作", "观察屈曲、伸展、偏斜和持续握拳等表现"],
      ["joint_integrity", "肩、肘、腕和手部无明显挛缩、疼痛或结构问题限制当前作业", "记录关节活动终末感觉、疼痛表达和已知医学限制，不作强力牵伸"],
      ["shoulder_elbow_arom", "左右肩肘主动活动范围足以完成伸取、送手到口和穿脱等任务", "分别比较达到完整范围、超过80%、50至80%或不足50%的功能表现"],
      ["wrist_thumb_arom", "左右腕部与拇指主动活动范围足以完成抓放、捏取和工具操作", "记录腕伸、拇指外展对掌、左右差异及疲劳后的变化"]
    ]
  }),
  makeDomain({
    id: "otPosturalUpperLimb", category: "performance", professional: "ot",
    title: "坐姿、上肢稳定与操作耐力", scope: "功能坐姿、肩肘腕稳定、伸取、承重、双手支撑和操作耐力",
    strategies: ["先调整桌椅、脚踏和材料高度，再通过短时承重与伸取活动建立操作基础。"],
    items: [
      ["functional_sit", "在合适支持下维持头颈和躯干对齐的功能坐姿", "完成桌面任务5至10分钟"],
      ["shoulder_stability", "肩带稳定足以支持手在桌面进行精细操作", "观察耸肩、贴桌和过度代偿"],
      ["reach", "能向前、侧方和跨中线伸手取物后回到稳定姿势", "不同高度和距离"],
      ["upper_weight_bear", "能通过前臂、手掌或辅助方式承重参与活动", "关注疼痛、关节过伸和疲劳"],
      ["wrist_position", "操作工具时腕部位置有利于手指分化和控制", "书写、夹取、餐具和按钮"],
      ["work_endurance", "上肢操作能持续到任务结束且质量无明显快速下降", "记录时长、休息和代偿"]
    ]
  }),
  makeDomain({
    id: "otFineMotor", category: "performance", professional: "ot",
    title: "手功能与精细操作", scope: "抓握、手指分化、掌内操作、双手分工、力度和速度准确性",
    strategies: ["选择与课堂、自理直接相关的材料，由大到小、由稳定到移动目标逐级练习。"],
    items: [
      ["grasp_pattern", "根据物品大小和用途采用有效抓握", "积木、笔、勺、夹子和拉环"],
      ["finger_skill", "使用拇指与各手指完成捏、拨、按和分离动作", "贴纸、纽扣、键盘和小物"],
      ["in_hand_manipulation", "能在一只手内进行简单转移、移位或旋转", "硬币、笔、积木和小零件"],
      ["bilateral_hand", "一手操作、一手稳定，双手分工有效", "剪纸、开盒、穿衣和用餐"],
      ["force_control", "手部用力与任务相称，不频繁掉落或损坏物品", "不同阻力与易碎材料"],
      ["speed_accuracy", "在合理时间内完成精细任务并保持可接受准确性", "分别记录时间、错误和提示"]
    ]
  }),
  makeDomain({
    id: "otVisualPerceptual", category: "performance", professional: "ot",
    title: "视觉知觉与空间操作", scope: "辨别、视觉记忆、图形背景、空间关系、恒常性和顺序扫描",
    strategies: ["先减少视觉背景和选择数量，再逐步增加相似度、位置变化和记忆间隔。"],
    items: [
      ["visual_discrimination", "辨认形状、大小、方向或细节的相同与不同", "实物、图片、符号和字形"],
      ["figure_ground", "在较复杂背景中找到指定物品、图片或符号", "桌面、书页、抽屉和教室"],
      ["visual_memory", "短暂观看后能找回或重现2至4个视觉信息", "物品位置、图形或简单序列"],
      ["spatial_relation", "理解并操作上下、里外、前后、左右等空间关系", "拼搭、摆放、路线和纸笔"],
      ["form_constancy", "物品大小、颜色或方向变化后仍能识别其类别或形状", "实物与图片间迁移"],
      ["systematic_scan", "按固定方向扫描并减少遗漏或重复", "找物、配对、阅读前准备"]
    ]
  }),
  makeDomain({
    id: "otVisualMotor", category: "performance", professional: "ot",
    title: "视觉运动整合与书写准备", scope: "手眼协调、临摹复制、线内控制、书写工具、版面和键盘替代",
    strategies: ["根据学生功能水平选择画线、拼搭、书写或键盘等有效输出方式，不以单一书写速度判定学习能力。"],
    items: [
      ["eye_hand", "眼睛引导手准确取放、插入、连接或追随路径", "投放、拼插、穿线和迷宫"],
      ["copy_forms", "按能力水平临摹或复制线条、基本形状、结构或字符", "记录起点、方向和完整性"],
      ["boundary_control", "在区域、格线或路径范围内控制笔或工具", "涂色、连线、书写和剪切"],
      ["writing_grip", "使用有效且可持续的书写工具握持", "允许辅助握笔器或替代工具"],
      ["page_layout", "能在纸面或作业版面中找到起始位置并保持基本间距", "姓名、数字、图形或符号任务"],
      ["alternative_output", "需要时能使用键盘、触屏、印章或选择方式完成学习输出", "评估效率、准确性和独立性"]
    ]
  }),
  makeDomain({
    id: "otBilateralPraxis", category: "performance", professional: "ot",
    title: "双侧协调与动作计划", scope: "跨中线、双手分工、模仿、动作构想、顺序和新任务调整",
    strategies: ["先用熟悉材料建立成功动作，再以图片或示范支持新序列，并逐步更换材料和情境。"],
    items: [
      ["cross_midline", "能跨身体中线取放或操作而不频繁换手", "桌面、穿衣和大型活动"],
      ["hand_roles", "双手在任务中形成操作手与辅助手分工", "剪、撕、穿、开合和餐具"],
      ["imitate_action", "能模仿新的手部或全身动作", "单步到3步组合"],
      ["motor_idea", "面对熟悉材料能提出或开始合适操作方案", "减少等待成人手把手安排"],
      ["sequence_action", "按顺序完成3至5个动作或生活步骤", "图片、实物或口语支持"],
      ["adapt_action", "任务条件变化或失败后能调整方法再次尝试", "记录需要的提示和迁移"]
    ]
  }),
  makeDomain({
    id: "otDressing", category: "selfcare", professional: "ot",
    title: "穿脱衣物与个人物品", scope: "衣物辨认、穿脱顺序、扣件、鞋袜、整理和情境独立性",
    strategies: ["选择家庭和学校最常用的衣物，采用固定摆放、图片步骤和后向连锁逐步增加独立步骤。"],
    items: [
      ["select_orientation", "辨认衣物前后、内外及所属位置", "使用标签、图标或固定摆放"],
      ["upper_dress", "参与上衣穿脱并完成当前目标步骤", "套头、袖口、拉平和整理"],
      ["lower_dress", "参与裤子或裙装穿脱并保持安全姿势", "坐位、扶持和重心控制"],
      ["fasteners", "操作当前生活需要的拉链、按扣、纽扣或魔术贴", "记录完成哪一段和所需协助"],
      ["shoes_socks", "参与穿脱鞋袜并辨认左右或固定方式", "考虑矫形器和特殊鞋具"],
      ["dress_generalize", "在如厕、体育、更衣等实际情境完成已掌握步骤", "不同衣物与人员下复核"]
    ]
  }),
  makeDomain({
    id: "otHygieneToileting", category: "selfcare", professional: "ot",
    title: "如厕、洗手与个人卫生", scope: "身体信号、路线与转移、衣物管理、清洁、洗手和隐私安全",
    strategies: ["将如厕和卫生流程拆成可见步骤，明确隐私边界与求助方式，并保持团队提示一致。"],
    items: [
      ["toilet_signal", "能注意或按日程表达如厕需要", "口语、动作、图片、设备或行为信号"],
      ["toilet_access", "安全到达厕所并完成坐下、站起或必要转移", "考虑扶手、脚踏和成人保护"],
      ["clothing_manage", "如厕前后参与裤装和内衣管理", "记录独立步骤和顺序"],
      ["cleaning", "在尊重隐私下参与擦拭、冲水和整理", "使用视觉步骤和适配工具"],
      ["handwashing", "按顺序完成开水、取皂、搓洗、冲净和擦干", "记录遗漏、时长和提示"],
      ["privacy_safety", "理解基本隐私边界并能在需要时求助", "不同人员和场所的一致规则"]
    ]
  }),
  makeDomain({
    id: "otFeedingTools", category: "selfcare", professional: "ot",
    title: "自主进餐与餐具操作", scope: "坐姿、开合容器、餐具、杯具、进餐节奏、清理及辅助器具",
    strategies: ["先确保吞咽安全与稳定坐姿，再选择合适餐具、容器和防滑支持，训练自主进餐步骤。"],
    items: [
      ["meal_position", "在合适座椅和脚部支持下保持进餐姿势", "头颈、躯干、骨盆和疲劳"],
      ["open_container", "打开或参与打开常用餐盒、包装和瓶盖", "允许适配工具和预松处理"],
      ["utensil_use", "使用勺、叉、筷或适配餐具把食物送入口中", "观察洒落、力度和效率"],
      ["cup_use", "使用适合的杯具完成取杯、饮用和放回", "不评价吞咽生理，仅记录功能操作"],
      ["meal_pacing", "在支持下维持合适进餐节奏并表达继续、停止或帮助", "出现呛咳等风险立即转介"],
      ["meal_cleanup", "完成餐后收纳、擦拭和归位中的约定步骤", "真实食堂或教室情境"]
    ]
  }),
  makeDomain({
    id: "otPlayLeisure", category: "occupation", professional: "ot",
    title: "游戏、休闲与同伴参与", scope: "选择活动、探索玩法、轮流共享、规则、挫折恢复和社区休闲",
    strategies: ["从学生兴趣出发设计共同目标，通过视觉轮次和角色分工扩大同伴参与，而非只训练独处操作。"],
    items: [
      ["choose_activity", "能从可接受选项中选择并开始一种游戏或休闲活动", "观察主动性和持续时间"],
      ["functional_play", "以与材料功能相符或有意义的方式探索和使用物品", "允许个体化玩法并关注安全"],
      ["shared_space", "能与同伴共享空间和材料而不过度退出或冲突", "成人可提供边界和示范"],
      ["turn_rules", "在视觉支持下等待轮次并遵守简单规则", "2至4人活动"],
      ["cope_change", "游戏受阻、输赢或规则变化时能在支持下恢复", "记录恢复时间和策略"],
      ["leisure_generalize", "在课间、社团、家庭或社区使用已掌握休闲技能", "至少两个自然情境"]
    ]
  }),
  makeDomain({
    id: "otCommunityDailyLiving", category: "selfcare", professional: "ot",
    title: "校园与社区日常生活", scope: "路线、购物模拟、金钱与物品、简单家务、时间安排和安全求助",
    strategies: ["围绕校园真实路线、值日和简单购买任务分步练习，并使用一致的安全标识和求助流程。"],
    items: [
      ["campus_route", "按标识或视觉路线到达校园常用地点", "教室、厕所、食堂、办公室和操场"],
      ["carry_items", "安全携带、分发和归位个人或班级物品", "考虑重量、双手和移动能力"],
      ["simple_purchase", "参与选择商品、排队、付款或核对物品等步骤", "实景或学校模拟商店"],
      ["daily_chore", "完成一种整理、清洁或值日任务的主要步骤", "工具选择、安全和结束检查"],
      ["schedule_follow", "借助日程按时间前往或准备下一活动", "计时器、图片和环境提示"],
      ["community_safety", "遵守边界、等待、跟随和向可信成人求助等规则", "校园及社区不同情境"]
    ]
  }),
  makeDomain({
    id: "otAssistiveEnvironment", category: "occupation", professional: "ot",
    title: "环境适配、辅具与技能泛化", scope: "座椅桌面、视觉支持、工具适配、辅助技术、自我倡导和跨情境应用",
    strategies: ["记录每项适配对独立性、效率、安全和参与的实际影响，保留有效支持并逐步撤除无效限制。"],
    items: [
      ["seating_fit", "使用与身体尺寸和任务要求相符的座椅、桌面或脚部支持", "观察姿势和操作变化"],
      ["visual_support", "能理解并使用日程、先后板、步骤图或完成标记", "不同活动中保持符号一致"],
      ["adapted_tool", "能有效使用握笔器、防滑垫、加粗手柄等适配工具", "比较使用前后表现"],
      ["access_technology", "能通过触屏、键盘、开关或其他方式访问学习活动", "位置、准确性、速度和疲劳"],
      ["request_accommodation", "能用现有沟通方式表达需要调整、休息或帮助", "建立团队一致回应"],
      ["skill_generalization", "把已掌握活动技能迁移到不同人员、材料和场所", "至少两个自然情境和三次记录"]
    ]
  }),

  // ST: functional communication, speech, language, AAC and feeding risk screening.
  makeDomain({
    id: "stCommunicationFoundations", category: "communication", professional: "st",
    title: "沟通基础与共同注意", scope: "沟通意图、注意共享、模仿、轮流、因果理解和沟通对象意识",
    strategies: ["跟随学生兴趣，在自然活动中等待和回应所有有效沟通信号，再逐步塑造更清晰的表达方式。"],
    items: [
      ["intent", "通过目光、动作、声音、手势、图片或口语表达明确沟通意图", "请求、拒绝、分享和求助"],
      ["joint_attention", "能在支持下与他人共同关注同一人、物或事件", "回应指向并主动分享注意"],
      ["social_response", "对熟悉沟通对象的接近、招呼或互动邀请作出可识别回应", "不强求持续眼神接触"],
      ["imitation", "模仿与活动相关的动作、声音或简单符号", "从同步动作到延迟模仿"],
      ["turn_exchange", "在熟悉游戏或互动中完成至少2至3轮来回", "物品、动作、声音或信息轮流"],
      ["cause_effect", "理解自己的沟通行为会引起他人回应或活动变化", "继续、停止、再来和帮助"]
    ]
  }),
  makeDomain({
    id: "stLanguageDevelopmentStage", category: "communication", professional: "st",
    title: "语言符号发展阶段线索", scope: "从物品功能关系、词汇符号到两词句、三词句、语序与被动关系的理解和表达",
    strategies: [
      "从学生当前稳定理解的阶段开始，使用实物、动作和图片建立关系，再扩展到口语或AAC表达。",
      "阶段判断应同时比较理解与表达，并以多次稳定表现为准，不因单次模仿直接提升阶段。"
    ],
    items: [
      ["stage2_object_relation", "能理解并按功能使用熟悉物品，完成放入、配对或选择等物品关系任务", "对应物品基础概念，控制成人手势与情境猜测", { stageRank: 2, stageLabel: "阶段2：物品关系" }],
      ["stage3_object_action", "能在实物或图片中理解或表达常见物品、身体部位和动作词", "分别记录成人语、儿童语、手势、图片或AAC方式", { stageRank: 3, stageLabel: "阶段3：事物与动作符号" }],
      ["stage3_attribute", "能理解或表达大小、颜色等基本属性并与事物正确组合", "比较单独属性词与属性加事物的理解表达", { stageRank: 3.5, stageLabel: "阶段3：属性符号" }],
      ["stage4_two_word", "能理解或表达人物加动作、动作加对象或属性加事物等两词关系", "使用图片选择和自然表达分别验证，避免只记固定短语", { stageRank: 4.1, stageLabel: "阶段4-1：两词关系" }],
      ["stage4_three_word", "能理解或表达人物加动作加对象或多属性组合等三词关系", "记录关键信息是否完整以及词序是否稳定", { stageRank: 4.2, stageLabel: "阶段4-2：三词关系" }],
      ["stage5_grammar", "能理解或表达依赖语序、主动与被动关系的句子信息", "用角色互换图片排除仅凭词汇猜测，分别记录理解和表达", { stageRank: 5, stageLabel: "阶段5：语序与句法规则" }]
    ]
  }),
  makeDomain({
    id: "stLanguageFoundationalProcess", category: "communication", professional: "st",
    title: "语言学习基础性过程", scope: "物品关系、延迟反应、图形与积木操作、视动复制、听觉记忆及言语手势模仿",
    strategies: [
      "在语言任务前确认学生是否理解物品关系、能维持表征并具备相应模仿和短时记忆基础。",
      "将任务材料数量和等待时间逐步调整，分别记录理解困难、记忆负荷、动作限制与配合状态。"
    ],
    items: [
      ["object_permanence", "能完成放入、寻找或延迟后取回熟悉物品等物品关系任务", "记录延迟时间、搜索策略和是否依赖即时提示"],
      ["shape_matching", "能在3个起逐步增加的选择中完成基本形状镶嵌、配对或辨别", "记录选择数量、旋转尝试、错误修正和视觉提示"],
      ["block_construction", "能观察范例后完成与能力相符的积木搭建或空间组合", "比较直接仿搭、延迟仿搭和口语指令条件"],
      ["visual_copy", "能描线或复制直线、曲线和基本图形，反映视动整合基础", "记录起点、方向、连续性及是否受运动限制"],
      ["auditory_memory", "能保持并按顺序回应2至3个与能力相符的声音、词语或动作信息", "由2个单位开始，记录复述、执行和遗漏位置"],
      ["verbal_gesture_imitation", "能模仿与当前发展水平相符的手势、口部动作、声音或词语", "区分同时模仿、延迟模仿和自发表达"]
    ]
  }),
  makeDomain({
    id: "stReceptiveLanguage", category: "communication", professional: "st",
    title: "语言理解", scope: "词汇、指令、概念、提问、句意和课堂信息理解",
    strategies: ["确认注意后使用短句和关键词，配合实物、动作或图片，并给予足够反应时间再重复。"],
    items: [
      ["familiar_words", "理解与日常人、物、动作和地点相关的熟悉词语", "比较实物、图片、手势和口语"],
      ["one_step", "在自然情境中理解并执行一个功能性指令", "控制手势和情境猜测的影响"],
      ["multi_step", "借助支持理解并完成2至3步相关指令", "记录长度、重复和遗漏"],
      ["basic_concepts", "理解大小、数量、颜色、位置、时间等当前学习所需概念", "在操作和课堂任务中观察"],
      ["questions", "理解谁、什么、哪里、做什么及简单为什么等提问", "可用选择、指认或表达回应"],
      ["sentence_meaning", "理解与能力相符的句子关系、否定或简单故事信息", "从短句到连贯语段逐级观察"]
    ]
  }),
  makeDomain({
    id: "stExpressiveLanguage", category: "communication", professional: "st",
    title: "语言表达与叙事", scope: "词汇、词语组合、句式、信息表达、事件描述和语法功能",
    strategies: ["接受口语、手势、图片或AAC等有效表达方式，成人扩展学生信息而不要求机械重复。"],
    items: [
      ["express_needs", "主动表达需要、拒绝、帮助、休息和身体不适", "不同人员均能理解"],
      ["vocabulary", "使用与日常活动相关的人、物、动作和描述词", "口语或符号词汇均可"],
      ["combine", "将两个以上意义单位组合表达关系", "如人物加动作、动作加物品"],
      ["sentence", "使用与能力相符的句式表达完整信息", "不以方言或语言差异误判"],
      ["describe_event", "描述正在发生或刚发生的简单事件", "包含至少两个关键信息"],
      ["retell", "借助图片或提问按基本顺序复述熟悉经历或短故事", "关注信息完整和听者理解"]
    ]
  }),
  makeDomain({
    id: "stSpeechSound", category: "speech", professional: "st",
    title: "言语清晰度与语音系统", scope: "音节结构、语音产生、清晰度、错误一致性和跨情境可懂度",
    strategies: ["在有意义词语和真实沟通中选择少量目标音，记录听者可懂度，不因方言或双语差异直接判为障碍。"],
    items: [
      ["syllable_shape", "能产生与当前语言水平相符的音节和词形", "单音节、双音节及常用词"],
      ["sound_inventory", "能够产生一定范围的辅音、元音或声调对比", "由具备语音专业能力者判断"],
      ["consistency", "同一熟悉词在多次表达中的语音形式较一致", "区分不一致错误和偶发失误"],
      ["word_intelligibility", "熟悉听者能理解多数常用单词或短语", "记录无需情境猜测的比例"],
      ["connected_intelligibility", "在句子或连续表达中保持可接受清晰度", "比较熟悉与不熟悉听者"],
      ["self_monitor_speech", "沟通未被理解时能放慢、重说或改用其他方式", "不以反复纠正降低沟通意愿"]
    ]
  }),
  makeDomain({
    id: "stMotorSpeech", category: "speech", professional: "st",
    title: "言语运动计划与协调", scope: "口部动作、发音姿势转换、音节序列、语速韵律和言语努力程度",
    strategies: ["疑似儿童言语失用或构音运动障碍时，应由具备相关资质人员进一步评估，不凭本表单作诊断。"],
    items: [
      ["oral_movement", "在言语任务中唇、舌、下颌动作范围与协调能支持当前发音", "不把非言语口部动作等同言语能力"],
      ["movement_transition", "能从一个发音姿势平稳转换到下一个", "重复音节、多音节词和短语"],
      ["sequence_accuracy", "随着音节或词长度增加仍能维持一定准确性", "观察长度效应和错误变化"],
      ["prosody", "语速、重音、节律和停顿有助于听者理解", "自然表达而非机械模仿"],
      ["effort_fatigue", "言语时无明显过度用力或快速疲劳导致可懂度下降", "记录时长和恢复"],
      ["stimulability", "在视觉、听觉或触觉提示下能改善部分目标发音", "记录最有效提示，不作为独立诊断"]
    ]
  }),
  makeDomain({
    id: "stOralPeripheralMechanism", category: "speech", professional: "st",
    title: "呼吸发声与口腔外围机制", scope: "呼吸、发声、面唇、腭咽、舌、下颌的结构对称、活动范围、力量、协调和言语影响",
    strategies: [
      "先观察自然呼吸、发声和进食外观，再进行短时结构化动作；非言语口部动作结果不能直接等同言语能力。",
      "持续嘶哑、呼吸困难、明显鼻漏气、疼痛、结构异常或吞咽风险应优先转介医学及相应专业评估。"
    ],
    items: [
      ["respiratory_support", "自然呼吸模式、呼吸频率和控制性呼气能够支持当前长度的发声", "观察胸腹协调、快速呼气和最长舒适呼气，不进行危险憋气"],
      ["phonation_control", "起声、持续发声、响度和音高调节能够支持听者理解", "记录最长舒适发声、气息声、粗糙、紧张、震颤和疲劳"],
      ["face_lip_function", "面部对称、唇闭合、展唇圆唇及唇部力量协调能够支持发音", "同时记录流涎、口呼吸、鼓腮漏气和双侧差异"],
      ["velopharyngeal_function", "软腭运动和腭咽闭合表现能够支持吹气、口腔压力及正常共鸣", "观察软腭抬高、鼻漏气、口鼻共鸣和结构外观，异常时转介"],
      ["tongue_function", "舌的伸出、回缩、左右和上下运动范围与速度能够支持目标音转换", "记录偏斜、抖动、代偿、力量和连续动作协调"],
      ["jaw_oral_reflex", "下颌开合、稳定、咀嚼相关运动及口腔反射不明显限制当前言语", "观察开口范围、稳定性、咬合、反射和疼痛，不以非言语动作作诊断"]
    ]
  }),
  makeDomain({
    id: "stFunctionalAAC", category: "communication", professional: "st",
    title: "功能沟通与辅助沟通 AAC", scope: "沟通功能、符号理解、系统访问、词汇可用性、跨伙伴使用和沟通修复",
    strategies: ["AAC应随时可用，沟通伙伴同步示范核心词；不能因学生会说少量词就撤除有效辅助沟通。"],
    items: [
      ["functions", "使用现有方式完成请求、拒绝、评论、提问、求助和社交等多种功能", "不只统计请求物品"],
      ["symbol_use", "理解并选择与能力相符的实物、图片、符号或文字", "评估符号类型、大小和数量"],
      ["access", "能以稳定动作访问沟通本、图片板或设备", "考虑视力、姿势和精细运动"],
      ["vocabulary_available", "常用核心词和个性化词汇在需要时可以快速找到", "继续、停止、帮助、疼痛和人物地点"],
      ["partner_generalize", "能与不同沟通伙伴在至少两个情境使用系统", "课堂、生活、个训和家庭"],
      ["repair", "信息未被理解时能重复、补充或改换沟通方式", "伙伴应等待并确认信息"]
    ]
  }),
  makeDomain({
    id: "stSocialCommunication", category: "communication", professional: "st",
    title: "社会沟通与语用", scope: "发起回应、轮流、话题、非字面线索、情境调整和同伴互动",
    strategies: ["在真实同伴活动中教授可见规则、角色和修复策略，不以强迫眼神接触作为社会沟通目标。"],
    items: [
      ["initiate_respond", "能适度发起并回应与当前活动相关的沟通", "比较成人和同伴情境"],
      ["conversation_turn", "能维持至少2至4轮相互关联的互动", "口语、手势、图片或设备均可"],
      ["topic", "能在支持下维持或转换共同话题", "减少完全无关重复但尊重兴趣"],
      ["context_adjust", "根据对象和场合调整音量、距离或表达方式", "课堂、食堂和公共空间"],
      ["social_inference", "理解与能力相符的表情、语气、规则或简单隐含信息", "避免仅凭文化差异判断"],
      ["peer_problem", "发生误解、拒绝或冲突时能使用已教沟通策略", "求助、解释、协商或离开"]
    ]
  }),
  makeDomain({
    id: "stFluency", category: "speech", professional: "st",
    title: "言语流畅度", scope: "重复、延长、阻塞、伴随用力、情绪影响和情境变化",
    strategies: ["关注沟通参与和学生感受，给予充足表达时间；不得要求反复重说或用“慢一点”简单纠正所有不流畅。"],
    items: [
      ["flow", "在自然表达中言语流动足以完成信息", "记录典型语样而非单个句子"],
      ["repetition", "音、音节、词或短语重复不显著阻碍沟通", "区分发展性不流畅和异常模式"],
      ["prolong_block", "较少出现明显延长、阻塞或难以启动声音", "由具备资质者进一步分析"],
      ["physical_tension", "表达时面部、颈部或身体无明显伴随用力和逃避动作", "记录发生情境"],
      ["participation_impact", "不流畅对课堂回答、同伴交流和自我表达影响较小", "结合学生主观感受"],
      ["strategy_use", "能在支持下使用适合自己的流畅沟通或自我倡导策略", "不把完全流利设为唯一目标"]
    ]
  }),
  makeDomain({
    id: "stVoiceResonance", category: "speech", professional: "st",
    title: "嗓音、共鸣与呼吸支持", scope: "响度、音质、音高、共鸣、呼吸配合和嗓音耐力",
    strategies: ["持续声音嘶哑、疼痛、失声、异常鼻音或呼吸困难应先转介耳鼻喉或相关医学评估。"],
    items: [
      ["loudness", "响度与场合相称，听者可在合理距离听清", "课堂、小组和安静对话"],
      ["quality", "音质较清晰，无持续明显嘶哑、气息声或紧张挤压", "比较一天中不同时间"],
      ["pitch", "音高适合个体且变化能够支持表达", "不以性别刻板标准判断"],
      ["resonance", "口鼻共鸣不显著影响可懂度", "异常时结合结构和听力转介"],
      ["breath_speech", "呼吸与说话配合足以完成当前长度表达", "观察短句和连续表达"],
      ["voice_endurance", "课堂交流后嗓音质量无明显快速下降或不适", "记录时长、清嗓和疼痛"]
    ]
  }),
  makeDomain({
    id: "stCognitiveLiteracy", category: "communication", professional: "st",
    title: "认知沟通与读写相关语言", scope: "注意记忆、分类推理、问题解决、叙事组织、语音意识和功能读写",
    strategies: ["在学生真实课程和生活材料中评估语言加工，区分语言理解、记忆负荷和知识经验。"],
    items: [
      ["verbal_memory", "能保持并使用与能力相符的口头或符号信息", "简短指令、人物地点和步骤"],
      ["categorize", "按功能、类别或特征组织词汇和概念", "实物、图片或文字"],
      ["reason", "回答与日常事件相关的原因、预测或解决办法", "允许视觉选择和AAC"],
      ["narrative_structure", "表达人物、事件和结果等基本叙事关系", "个人经历、图片序列或短故事"],
      ["phonological_awareness", "按当前学习水平辨认押韵、音节或首音等声音结构", "仅适用于有相应学习目标者"],
      ["functional_literacy", "理解或使用姓名、标志、日程、菜单等功能性图文信息", "结合实际生活需要"]
    ]
  }),
  makeDomain({
    id: "stFeedingSafety", category: "feeding", professional: "st",
    title: "进食、饮水与吞咽风险筛查", scope: "清醒姿势、口腔控制、咀嚼、吞咽呼吸协调、效率和风险信号",
    strategies: ["本领域仅作学校风险筛查；任何呛咳、湿嗓、呼吸改变、反复感染或体重营养风险均需转介完整吞咽评估。"],
    items: [
      ["alert_position", "进食时保持足够清醒和稳定的头颈躯干姿势", "比较不同餐椅和疲劳状态"],
      ["oral_control", "能控制唇闭合、食物或液体在口内的保持与转移", "由具备相应能力者观察"],
      ["chewing", "对当前获准质地进行有效、持续且相对对称的咀嚼", "不以高风险食物测试能力"],
      ["swallow_breathe", "吞咽与呼吸配合稳定，进食中无明显呛咳、湿嗓或呼吸改变", "出现异常立即停止并转介"],
      ["efficiency", "在学校可用时间内摄入足够且不过度疲劳", "记录时长、休息和食量变化"],
      ["communicate_feeding", "能表达饥饱、继续、停止、疼痛或不适", "口语、动作、图片或AAC均可"]
    ]
  }),

  // PT: school mobility and participation-focused movement assessment.
  makeDomain({
    id: "ptGmfmLyingRolling", category: "movement", professional: "pt", profileGroup: "gmfm88", profileDimension: "A 卧位与翻身",
    title: "GMFM结构参考 A：卧位与翻身", scope: "仰卧头位与四肢中线活动、侧翻、俯卧抬头、前臂或手掌支撑及卧位转换",
    strategies: ["在平整安全垫面按学生主动能力观察左右侧，允许充分等待；不把治疗师完成的被动动作计为学生完成。"],
    items: [
      ["supine_head_midline", "仰卧时能把头保持或转回中线并主动看向左右目标", "分别观察自主启动、保持和左右差异"],
      ["supine_midline_limbs", "仰卧时能把双手带到中线、手到口或主动抬动下肢", "记录动作幅度、对称性和是否需要摆位"],
      ["roll_to_side", "能从仰卧主动转向左、右侧卧并保持身体连续转动", "分别评左、右方向，记录头、肩、骨盆启动顺序"],
      ["roll_prone_supine", "能在仰卧与俯卧之间主动翻身并完成主要步骤", "比较左右方向、上肢受压和所需协助"],
      ["prone_head_forearm", "俯卧时能抬头并以前臂支撑观察前方或伸手取物", "记录头控时间、胸部离垫和呼吸状态"],
      ["prone_extended_arm", "俯卧时能以较伸展的上肢支撑、转移重心或向前移动身体", "观察肘伸、肩带稳定、左右承重和疲劳"]
    ]
  }),
  makeDomain({
    id: "ptGmfmSitting", category: "movement", professional: "pt", profileGroup: "gmfm88", profileDimension: "B 坐位",
    title: "GMFM结构参考 B：坐位", scope: "辅助与独立坐位、上肢自由、不同方向伸取、坐位转换和凳面坐位",
    strategies: ["先提供足够安全支撑，再逐步减少手部或躯干支持；同时记录保持时间、上肢是否可用于活动及失衡后的恢复。"],
    items: [
      ["supported_sit_head", "在骨盆或躯干获得支持时能维持头部控制并观察环境", "记录支持位置、头控时间和疲劳"],
      ["floor_sit_hands_free", "在适合自身的地面坐姿中能短时保持平衡并释放双手活动", "允许长坐、环坐或适配坐姿，记录保持时间"],
      ["sit_reach_forward", "坐位时能向前伸手取物并回到稳定位置", "物品放在肩高与可达范围，记录保护反应"],
      ["sit_reach_side", "坐位时能向左、右及身后适度伸取并恢复稳定", "比较双侧、跨中线和躯干旋转"],
      ["sit_transition_floor", "能在坐位与俯卧、四点跪或侧坐之间主动转换", "记录启动方式、上肢支撑和所需协助"],
      ["bench_sit_transition", "能在凳面保持坐位并参与从地面到凳面或凳面到地面的转换", "记录脚部支持、手扶和控制性落地"]
    ]
  }),
  makeDomain({
    id: "ptGmfmCrawlingKneeling", category: "movement", professional: "pt", profileGroup: "gmfm88", profileDimension: "C 爬与跪",
    title: "GMFM结构参考 C：爬行与跪位", scope: "俯卧到四点跪、四点支撑伸取、腹爬或手膝爬、台阶爬、跪位与半跪位",
    strategies: ["根据学生能力使用腹爬、手膝爬或适配移动方式，重点记录主动承重、左右交替、距离和安全。"],
    items: [
      ["attain_four_point", "能从俯卧或坐位主动进入四点跪或功能相近的承重姿势", "记录头躯干控制、髋膝位置和协助部位"],
      ["hold_four_point", "能在四点跪中保持上、下肢承重并稳定头躯干", "记录保持时间、关节对齐和疼痛"],
      ["four_point_reach", "四点跪时能转移重心并抬起一侧手伸取物品", "分别观察左右侧和失衡恢复"],
      ["crawl_forward", "能以腹爬、手膝爬或适配方式连续向前移动", "记录距离、左右交替、速度和休息"],
      ["crawl_steps", "在充分保护下能参与向上或向下爬越低台阶", "记录领先侧、转身下阶和成人保护"],
      ["kneel_half_kneel", "能进入、维持并离开高跪或半跪位参与活动", "比较左右半跪、上肢扶持和躯干稳定"]
    ]
  }),
  makeDomain({
    id: "ptGmfmStanding", category: "movement", professional: "pt", profileGroup: "gmfm88", profileDimension: "D 站立",
    title: "GMFM结构参考 D：站立", scope: "扶物起立、扶持与独立站立、单脚负重、坐站转换、下蹲取物和地面起立",
    strategies: ["按学生常用支撑条件评估，明确记录扶物、扶手、矫形器和成人保护，不以移除必要辅具换取所谓独立。"],
    items: [
      ["pull_to_stand", "能通过跪位、半跪或其他安全方式主动参与扶物起立", "记录领先侧、上肢拉拽、下肢承重和协助"],
      ["supported_stand", "在双手、单手或辅助器具支持下保持站立并调整身体", "记录支撑条件、时间和对齐"],
      ["independent_stand", "无需手扶时能短时保持站立并安全恢复", "仅在适合学生时评估，近身保护"],
      ["single_leg_loading", "站立时能短时把重量移向一侧并抬起另一脚", "分别评左右侧，可使用规定支撑并记录时间"],
      ["sit_to_stand_control", "能从合适高度座位主动站起并控制坐回", "记录手扶、脚位、速度和落座控制"],
      ["squat_floor_rise", "能下蹲取物、恢复站立或从地面参与起立", "允许家具或成人支持，记录路径和安全"]
    ]
  }),
  makeDomain({
    id: "ptGmfmWalkingRunningJumping", category: "movement", professional: "pt", profileGroup: "gmfm88", profileDimension: "E 走跑跳",
    title: "GMFM结构参考 E：走、跑与跳", scope: "扶持与独立步行、后退与变向、跨越、楼梯、快速移动、双脚跳和单脚跳",
    strategies: ["仅对具备相应承重与医学安全条件的学生进行跑跳任务；可用助行或轮椅功能移动结果补充校园参与解释。"],
    items: [
      ["cruise_supported_walk", "能扶家具侧移或在双手、单手支持下向前行走", "记录距离、手部支持、步态连续性和方向"],
      ["independent_walk", "能在平地独立向前行走并安全停止", "记录距离、速度、偏离路线和跌倒风险"],
      ["backward_turn_walk", "能后退、转弯或掉头后继续移动并保持安全", "比较左右转向和狭窄空间"],
      ["step_over_stairs", "能跨越障碍并以当前方式参与上下台阶或楼梯", "记录障碍高度、扶手、交替步和保护"],
      ["run_stop_return", "能以跑、快走或适配快速移动完成启动、停止和返回", "记录路线、变向、速度控制和耐力"],
      ["jump_hop", "能参与双脚离地跳、向前跳、上下跳或单脚跳中的适合项目", "按实际能力选择，不适用项目保持未评并确保近身保护"]
    ]
  }),
  makeDomain({
    id: "ptPostureAlignment", category: "movement", professional: "pt",
    title: "姿势对齐与体位维持", scope: "头颈、躯干、骨盆、四肢对齐，坐站体位和姿势耐力",
    strategies: ["先调整支撑面、座椅和足部位置，再评估学生主动维持与参与，避免把被动摆正当作独立能力。"],
    items: [
      ["head_control", "在当前体位中维持头部控制以观察环境和参与活动", "坐、站、移动或辅助体位"],
      ["trunk_control", "躯干稳定足以支持上肢操作、沟通或移动", "观察依靠、塌陷和过度僵硬"],
      ["pelvic_alignment", "在合适支撑下维持有利于坐站功能的骨盆位置", "记录座椅和脚部支持"],
      ["symmetry", "主要体位中两侧负重和身体对齐相对均衡", "结合个体骨骼和神经情况解释"],
      ["position_hold", "能在安全范围维持功能体位到活动结束", "记录时长、提示和疲劳"],
      ["position_change", "能够主动调整姿势减轻不适或改善参与", "沟通需要摆位协助也计入能力"]
    ]
  }),
  makeDomain({
    id: "ptRangeStrength", category: "movement", professional: "pt",
    title: "关节活动、肌力与负重能力", scope: "功能活动范围、主动运动、抗重力控制、承重、力量对称和任务用力",
    strategies: ["在功能任务中观察主动范围和力量；疼痛、关节不稳或明显活动受限应由专业人员进一步检查。"],
    items: [
      ["functional_rom", "主要关节活动范围足以完成当前坐、站、转移和移动任务", "不替代关节角度测量"],
      ["active_motion", "能主动启动并完成与任务相关的肢体运动", "区分理解、选择和运动限制"],
      ["antigravity_strength", "能对抗重力维持或移动身体主要部位", "头、躯干、上肢和下肢"],
      ["weight_bearing", "能通过上肢或下肢安全承重参与功能活动", "关注关节对齐和疼痛"],
      ["strength_symmetry", "两侧力量差异不会明显限制主要校园活动", "记录偏侧使用和代偿"],
      ["functional_force", "用力大小足以完成起立、推拉、跨步或器械任务", "质量与安全优先于次数"]
    ]
  }),
  makeDomain({
    id: "ptMotorControl", category: "movement", professional: "pt",
    title: "肌张力表现与运动控制", scope: "动作选择、分离运动、速度控制、协调、异常模式和姿势转换质量",
    strategies: ["记录动作质量和功能后果，不凭本表单诊断肌张力类型；明显变化或退步须医学转介。"],
    items: [
      ["selective_control", "能选择并控制完成任务所需的肢体动作", "减少整体联动或无关动作"],
      ["movement_grade", "能平稳调整动作速度、幅度和方向", "起停、伸取、跨步和落座"],
      ["coordination", "多关节动作能按需要协同完成", "爬、走、起立、投踢等"],
      ["involuntary_impact", "不自主动作或异常姿势对主要活动影响较小", "记录频率、诱因和安全影响"],
      ["transition_quality", "体位转换过程连续、可控且不过度代偿", "质量与所需协助并列记录"],
      ["motor_learning", "重复练习和反馈后动作质量或独立性有所提高", "跨三次机会观察"]
    ]
  }),
  makeDomain({
    id: "ptTransfers", category: "movement", professional: "pt",
    title: "体位转换与转移", scope: "翻身、卧坐、坐站、地面起立、座椅转移和照护者协助安全",
    strategies: ["围绕学生每天必须完成的转移练习，明确手位、器具和口令，保护学生和协助者双方安全。"],
    items: [
      ["rolling", "能主动参与左右翻身或床垫上调整位置", "记录需要的引导和空间"],
      ["lie_sit", "能参与卧位与坐位之间转换", "关注头控、上肢支撑和眩晕"],
      ["sit_stand", "能从合适高度座椅参与坐到站和站到坐", "记录扶手、协助和控制性落座"],
      ["floor_rise", "能从地面通过适合自身的方式转到坐或站", "允许家具或成人支持"],
      ["seat_transfer", "能安全完成椅子、轮椅、厕所或其他座位间转移", "结合真实设备"],
      ["direct_assistance", "能理解、配合或指示成人提供安全转移协助", "包括表达疼痛、停止和调整"]
    ]
  }),
  makeDomain({
    id: "ptMobility", category: "movement", professional: "pt",
    title: "步行、轮椅与功能移动", scope: "启动停止、直线移动、转弯、速度、辅助器具和校园目的性移动",
    strategies: ["使用学生日常移动方式评估，包括独走、扶行、助行器或轮椅；目标是安全有效到达，而非统一步态形式。"],
    items: [
      ["start_stop", "能安全启动、停止并等待移动", "响应环境和安全指令"],
      ["level_route", "在平整校园路线以当前方式到达目标地点", "记录距离、时间和协助"],
      ["turn_direction", "能转弯、掉头并调整方向而保持安全", "狭窄与开阔环境"],
      ["speed_control", "根据人流、边界和任务调整移动速度", "走廊、教室和操场"],
      ["device_use", "正确使用助行器、轮椅或其他移动辅助器具", "刹车、脚踏、方向和摆放"],
      ["dual_task_move", "移动时能同时关注路线、携带物品或回应必要信息", "根据能力选择，不增加危险"]
    ]
  }),
  makeDomain({
    id: "ptStairsTerrain", category: "movement", professional: "pt",
    title: "楼梯、坡道与复杂地面", scope: "台阶、楼梯、坡道、门槛、草地与拥挤环境的适应和安全判断",
    strategies: ["从熟悉路线和充分扶持开始，每次只增加距离、地面或人流中的一个难度。"],
    items: [
      ["single_step", "在合适支持下上、下单级台阶或门槛", "观察领先脚、控制和扶持"],
      ["stairs", "使用扶手或辅助方式参与连续楼梯", "记录步态方式、休息和保护"],
      ["ramp", "能控制速度和方向通过校园坡道", "上坡、下坡和轮椅操控"],
      ["uneven_surface", "适应草地、软垫或轻度不平地面", "按学生真实活动需要选择"],
      ["obstacle", "能识别并跨越、绕开或请求协助处理障碍", "门槛、地面物品和狭窄处"],
      ["crowd_navigation", "在人流变化中保持路线并避免碰撞或走失", "近身保护和边界提示"]
    ]
  }),
  makeDomain({
    id: "ptBalanceProtection", category: "movement", professional: "pt",
    title: "静态平衡、动态平衡与保护反应", scope: "坐站稳定、重心转移、跨步、转向、保护反应和跌倒风险",
    strategies: ["在安全保护和合适支撑面上观察平衡，禁止通过突然推倒或超出能力的高风险任务测试。"],
    items: [
      ["sitting_balance", "在当前坐位支撑条件下保持平衡并进行上肢活动", "不同方向伸取"],
      ["standing_balance", "在当前站立支撑条件下维持稳定", "双脚、辅助器具或成人扶持"],
      ["weight_shift", "能向前后左右转移重心并回到稳定位置", "坐、站或替代性体位"],
      ["dynamic_balance", "行进、转向或跨越时调整身体保持安全", "记录扶物、停顿和失衡"],
      ["protective_step", "轻度失衡时出现跨步、伸手或其他安全保护反应", "仅在低风险环境观察"],
      ["fall_awareness", "能识别跌倒风险并请求支持或使用安全策略", "地面变化、疲劳和拥挤"]
    ]
  }),
  makeDomain({
    id: "ptCoordination", category: "movement", professional: "pt",
    title: "粗大动作协调与物体控制", scope: "双侧动作、节律、跑跳替代、投接踢推和动作时机",
    strategies: ["根据学生能力允许快走、轮椅推进、支撑跳或其他替代动作，比较功能目标而非统一动作形式。"],
    items: [
      ["bilateral_gross", "两侧身体能同步或交替完成粗大动作", "爬、踏步、推拉或轮椅推进"],
      ["rhythm_sequence", "能跟随简单节律连续完成2至4个动作", "视觉、口令或音乐提示"],
      ["run_alternative", "参与与能力相符的快速移动活动", "跑、快走、滑行或轮椅加速"],
      ["jump_alternative", "参与离地、跨越或替代性上下运动", "重视安全与承重限制"],
      ["throw_catch", "在稳定姿势下完成推、投、滚或接物", "调整球体大小、速度和距离"],
      ["kick_target", "完成踢、推或其他方式使物体朝目标移动", "观察支撑、时机和准确性"]
    ]
  }),
  makeDomain({
    id: "ptSchoolGrossMotorSkills", category: "movement", professional: "pt", profileGroup: "school-gross-motor",
    title: "校本粗大动作专项任务", scope: "单脚站、跨越、侧向后退移动、变向跑、多种跳跃、下蹲蛙跳、踢球与坐位躯干伸取",
    strategies: [
      "只选择与学生身体状况和教学目标相符的任务，先示范并明确路线；不适用的跑跳项目保持未评。",
      "同一任务记录独立、少量提示、部分协助、大量协助或不能完成，并同步记录动作质量和安全。"
    ],
    items: [
      ["single_leg_stance", "能在充分保护下以左、右脚分别完成与能力相符的单脚站立", "记录支撑条件、左右侧和最长稳定时间"],
      ["obstacle_side_backward", "能跨过低障碍，并完成侧向走或后退走中的适合任务", "分别记录跨越高度、方向、路线和协助"],
      ["directional_run", "能完成跑或快走后的停止返回，以及S形路线变向", "记录启动、制动、绕点、碰撞和失衡"],
      ["jump_series", "能完成双脚跳、单脚跳、原地上下跳或连续向前跳中的适合项目", "逐项记录距离、次数、双脚同步和落地控制"],
      ["squat_frog_jump", "能完成下蹲起立，并在适用时完成连续蛙跳", "记录蹲深、足跟、膝髋对齐、上肢代偿和疲劳"],
      ["kick_trunk_reach", "能朝目标踢球，并在坐位完成向后约45度的躯干伸取后返回", "分别记录支撑脚、准确性、坐位平衡和保护反应"]
    ]
  }),
  makeDomain({
    id: "ptEndurance", category: "movement", professional: "pt",
    title: "心肺耐力、活动耐受与恢复", scope: "持续活动、速度保持、休息、呼吸面色、疼痛疲劳表达和恢复",
    strategies: ["使用活动时长、距离、休息次数、呼吸、面色、疼痛和恢复时间监测，不把疲劳解释为不配合。"],
    items: [
      ["sustain_activity", "以适合自身的方式持续参与5至10分钟活动", "根据基线和医学限制调整"],
      ["pace", "能采用可持续速度完成校园路线或集体活动", "避免起始过快导致退出"],
      ["planned_rest", "能按计划使用短休后重新加入活动", "记录休息时长和恢复质量"],
      ["physiologic_stability", "活动中呼吸、面色和反应保持在安全范围", "异常立即停止并转介"],
      ["pain_fatigue_report", "能表达疼痛、疲劳、头晕或需要停止", "口语、动作、图片或设备均可"],
      ["recovery", "活动结束后在合理时间恢复到基线状态", "记录心肺表现、姿势和参与"]
    ]
  }),
  makeDomain({
    id: "ptEquipmentAccess", category: "movement", professional: "pt",
    title: "辅具、矫形器与环境通达", scope: "设备匹配、穿戴、操作、维护、教室通道、应急疏散和成人协助",
    strategies: ["定期核查设备尺寸、皮肤、姿势和使用场景；任何压红、疼痛、设备损坏或生长不匹配需及时处理。"],
    items: [
      ["equipment_fit", "轮椅、助行器、站立架或座椅尺寸与当前身体状况相符", "专业人员定期核查"],
      ["orthosis_tolerance", "按计划安全使用矫形器或支具，无持续疼痛和皮肤问题", "记录穿戴时长和压红"],
      ["device_operation", "能独立或在支持下操作刹车、脚踏、把手和其他关键部件", "真实校园任务"],
      ["environment_access", "教室、厕所、食堂和活动区域通道支持其移动方式", "门宽、坡道、桌距和地面"],
      ["caregiver_handling", "相关成人使用一致且安全的扶持、转移和设备操作方法", "培训和现场复核"],
      ["emergency_plan", "团队有适合学生移动能力的应急疏散和替代路线方案", "学生知道可用求助方式"]
    ]
  }),
  makeDomain({
    id: "ptParticipation", category: "movement", professional: "pt",
    title: "校园活动与体育参与", scope: "上课路线、排队集会、体育游戏、课间、社区活动和自我倡导",
    strategies: ["通过规则、距离、器材和角色调整让学生参与共同活动，避免因动作形式不同而被排除。"],
    items: [
      ["class_access", "按时、安全到达课程和校园主要活动地点", "记录路线、时长和协助"],
      ["line_assembly", "参与排队、集会和转换中的移动与等待", "边界、疲劳和人流"],
      ["pe_activity", "以适合自身的角色和动作形式参与体育课", "共同目标和合理适配"],
      ["recess_play", "在课间参与移动、游戏或同伴活动", "观察环境障碍和同伴支持"],
      ["community_trip", "在校外或社区活动中使用安全有效的移动方案", "交通、距离、厕所和应急"],
      ["self_advocacy", "能表达移动、休息、疼痛、设备或环境调整需要", "不同人员和场合均可理解"]
    ]
  })
];

export const domainCounts = Object.freeze(domains.reduce((counts, domain) => {
  const current = counts[domain.professional] || { domains: 0, items: 0 };
  counts[domain.professional] = {
    domains: current.domains + 1,
    items: current.items + domain.items.length
  };
  return counts;
}, {}));
