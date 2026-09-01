const supportWeights = {
  "自然情境独立": 0,
  "少量提示": 1,
  "部分提示": 2,
  "大量协助": 3,
  "全程协助": 4
};

const leverageByDomain = {
  tactile: "材料操作、生活自理与精细活动",
  vestibular: "活动转换、运动参与与唤醒调节",
  proprioceptive: "姿势准备、力量控制与任务投入",
  auditory: "课堂指令、环境适应与安全回应",
  visual: "桌面学习、视觉搜索与空间操作",
  oral: "口腔照护、进餐流程与生活参与",
  postural: "坐姿学习、移动活动与手部操作",
  bilateral: "双手任务、穿脱自理与工具使用",
  praxis: "新任务学习、动作序列与跨情境迁移",
  fineMotor: "书写准备、工具使用与生活操作",
  regulation: "课堂准备、持续参与与活动转衔",
  participation: "课堂、自理、游戏与社会参与"
};

const communicationSupports = {
  "口语沟通": "清晰短句、动作示范和必要的视觉提示",
  "短语/单词": "单步指令、关键词图片和充足反应时间",
  "手势或图片沟通": "团队统一的手势、图片流程和选择板",
  "辅助沟通设备": "可随时取用的辅助沟通设备，并预置继续、停止、帮助和休息词汇",
  "沟通方式有限": "实物或图片二选一、身体信号观察和一致的停止反应"
};

const mobilitySupports = {
  "独立移动": "在清晰边界和安全规则下允许主动探索与自主停止",
  "需监督或扶持": "提供近身保护、稳定扶持和足够的姿势调整时间",
  "使用辅助器具": "围绕辅助器具、转移路径和稳定支撑调整任务环境",
  "主要依赖成人协助": "先建立稳定体位和可预测的成人协助，再安排主动参与步骤"
};

const professionalModuleProfiles = [
  {
    id: "si",
    label: "感觉统合 SI",
    courseTitle: "感觉统合个训（SI）",
    focus: "感觉调节、身体觉、活动转换与可学习状态",
    minimumDomains: 5,
    domainWeights: {
      tactile: 1,
      vestibular: 1,
      proprioceptive: 1,
      auditory: 0.8,
      regulation: 1,
      visual: 0.35,
      postural: 0.35,
      participation: 0.45
    }
  },
  {
    id: "ot",
    label: "作业治疗 OT",
    courseTitle: "作业治疗个训（OT）",
    focus: "生活自理、精细操作、动作计划与课堂任务参与",
    minimumDomains: 5,
    domainWeights: {
      visual: 0.75,
      bilateral: 1,
      praxis: 1,
      fineMotor: 1,
      participation: 1,
      tactile: 0.35,
      proprioceptive: 0.35,
      postural: 0.45,
      regulation: 0.4
    }
  },
  {
    id: "st",
    label: "言语语言 ST",
    courseTitle: "言语语言个训（ST）",
    focus: "语言理解与表达、功能沟通、社会沟通与辅助沟通",
    minimumDomains: 5,
    domainWeights: {
      receptiveExpressive: 1,
      functionalCommunication: 1,
      oral: 0.7,
      auditory: 0.45,
      participation: 0.35,
      regulation: 0.25
    }
  },
  {
    id: "pt",
    label: "运动功能 / PT",
    courseTitle: "运动功能个训（PT）",
    focus: "姿势、粗大运动、平衡、校园移动与活动耐力",
    minimumDomains: 5,
    domainWeights: {
      postural: 1,
      grossMotorMobility: 1,
      balanceEndurance: 1,
      vestibular: 0.4,
      proprioceptive: 0.35,
      bilateral: 0.3,
      participation: 0.3
    }
  }
];

function compactText(value, maxLength = 100) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function scoreValue(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
}

function supportWeight(value) {
  return supportWeights[value] ?? 2;
}

function confidenceFor(data, coverage, validDomainCount, sourceCount) {
  const cooperation = String(data.cooperation || "");
  if (cooperation.includes("暂无法") || validDomainCount < 3 || coverage < 25) return "有限";
  if (cooperation.includes("状态波动") || sourceCount < 2 || coverage < 60) return "中等";
  return "较高";
}

function priorityReason(row, impactLabels) {
  const reasons = [`领域均分${row.average.toFixed(1)}分`, impactLabels[row.impact] || impactLabels[0], `当前需${row.support || "部分提示"}`];
  if (row.lowestScore <= 2) reasons.push(`关键项目最低${row.lowestScore}级`);
  return reasons.join("、");
}

function bestItemsFor(row) {
  const rated = row.itemScores.filter((item) => item.score !== null).sort((a, b) => b.score - a.score);
  const stable = rated.filter((item) => item.score >= 4);
  return (stable.length ? stable : rated).slice(0, 2);
}

function targetItemFor(row) {
  return row.itemScores
    .filter((item) => item.score !== null && item.score < 5)
    .sort((a, b) => a.score - b.score)[0] || null;
}

function professionalAssessor(data, moduleId) {
  const value = data.professionalAssessors?.[moduleId];
  return value && typeof value === "object" ? value : {};
}

function uniqueReferences(rows) {
  const references = new Map();
  rows.filter((row) => row.answered > 0).forEach((row) => {
    list(row.references).forEach((reference) => {
      if (reference?.id && !references.has(reference.id)) references.set(reference.id, reference);
    });
  });
  return [...references.values()];
}

function languageStageInterpretation(rows) {
  const row = rows.find((item) => item.id === "stLanguageDevelopmentStage" && item.valid);
  if (!row) return "";
  const ratedStages = row.itemScores
    .filter((item) => item.score !== null && item.stageRank)
    .sort((left, right) => Number(left.stageRank) - Number(right.stageRank));
  const stable = ratedStages.filter((item) => item.score >= 4).at(-1);
  const emerging = ratedStages.filter((item) => item.score === 3).at(-1);
  if (!stable && !emerging) return "语言阶段线索：已评项目仍需较多支持，暂不推定稳定阶段。";
  const stableText = stable ? `较稳定表现最高见于${stable.stageLabel}` : "尚未见达到4级的稳定阶段项目";
  const emergingText = emerging ? `，${emerging.stageLabel}表现正在发展` : "";
  return `语言阶段线索：${stableText}${emergingText}；这是本站功能映射，不等同S-S法正式阶段判定。`;
}

function gmfmReferenceInterpretation(rows) {
  const dimensionRows = rows.filter((row) => row.profileGroup === "gmfm88" && row.valid);
  if (!dimensionRows.length) return "";
  const values = dimensionRows.map((row) => `${row.profileDimension}${row.average.toFixed(1)}级`);
  return `GMFM结构参考：${values.join("、")}；这些是本站1至5级支持程度，不能换算正式GMFM维度百分比或总分。`;
}

function buildProfessionalFindings(rows) {
  return professionalModuleProfiles.map((profile) => {
    const moduleRows = rows.filter((row) => row.professional === profile.id);
    const validRows = moduleRows.filter((row) => row.valid);
    const references = uniqueReferences(moduleRows);
    if (!validRows.length) {
      return {
        id: profile.id,
        label: profile.label,
        status: "资料不足",
        summary: `${profile.label}尚无达到最低项目量的有效领域，不能据此判断该专业无需要。`,
        evidence: [],
        referenceTitles: references.map((item) => item.title)
      };
    }

    const strongest = validRows.slice().sort((left, right) => right.average - left.average)[0];
    const priority = validRows.slice().sort((left, right) => right.priority - left.priority)[0];
    const strongestItems = bestItemsFor(strongest).map((item) => `${item.label}（${item.score}级）`);
    const priorityItems = priority.itemScores
      .filter((item) => item.score !== null)
      .sort((left, right) => left.score - right.score)
      .slice(0, 2)
      .map((item) => `${item.label}（${item.score}级）`);
    const average = validRows.reduce((sum, row) => sum + row.average, 0) / validRows.length;
    const specialInterpretation = profile.id === "st"
      ? languageStageInterpretation(rows)
      : profile.id === "pt"
        ? gmfmReferenceInterpretation(rows)
        : "";
    return {
      id: profile.id,
      label: profile.label,
      status: "已形成结论",
      average: Number(average.toFixed(2)),
      validDomainCount: validRows.length,
      totalDomainCount: moduleRows.length,
      strengthDomainId: strongest.id,
      priorityDomainId: priority.id,
      summary: `${profile.label}完成${validRows.length}/${moduleRows.length}个有效领域，功能观察均分${average.toFixed(1)}级。相对稳定为${strongest.title}：${strongestItems.join("；") || "已评项目"}。优先支持为${priority.title}：${priorityItems.join("；") || "已评低分项目"}。${specialInterpretation}`,
      evidence: [
        `相对稳定证据：${strongestItems.join("；") || "暂无"}。`,
        `优先支持证据：${priorityItems.join("；") || "暂无"}。`
      ],
      referenceTitles: references.map((item) => item.title)
    };
  });
}

function buildCourseDecision(data, domains, rows, impactLabels) {
  const moduleReadiness = {};
  const candidates = professionalModuleProfiles.map((profile) => {
    const coreDomains = domains.filter((domain) => domain.professional === profile.id);
    const coreRows = rows.filter((row) => row.professional === profile.id);
    const validCoreRows = coreRows.filter((row) => row.valid);
    const totalItems = coreDomains.reduce((sum, domain) => sum + domain.items.length, 0);
    const answeredItems = coreRows.reduce((sum, row) => sum + row.answered, 0);
    const requiredDomains = Math.min(profile.minimumDomains || 4, coreDomains.length || profile.minimumDomains || 4);
    const ready = validCoreRows.length >= requiredDomains;
    const weightFor = (row) => profile.domainWeights[row.id] ?? (row.professional === profile.id ? 1 : 0);
    const evidenceRows = rows.filter((row) => row.valid && weightFor(row) > 0);
    const weightedTotal = evidenceRows.reduce((sum, row) => sum + weightFor(row), 0);
    const needIndex = weightedTotal
      ? evidenceRows.reduce((sum, row) => sum + row.priority * weightFor(row), 0) / weightedTotal
      : null;
    const significant = evidenceRows.some((row) => row.average < 3 || row.impact >= 2 || row.supportWeight >= 3);
    const assessor = professionalAssessor(data, profile.id);

    moduleReadiness[profile.id] = {
      label: profile.label,
      validDomainCount: validCoreRows.length,
      totalDomainCount: coreDomains.length,
      requiredDomainCount: requiredDomains,
      answeredItems,
      totalItems,
      coverage: totalItems ? Math.round((answeredItems / totalItems) * 100) : 0,
      ready,
      evaluator: String(assessor.evaluator || ""),
      assessmentDate: String(assessor.assessmentDate || "")
    };

    const strongestEvidence = evidenceRows
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 2);
    return {
      ...profile,
      ready,
      needIndex,
      significant,
      strongestEvidence
    };
  });

  const eligible = candidates
    .filter((candidate) => candidate.ready && candidate.needIndex !== null && (candidate.needIndex >= 3.2 || candidate.significant))
    .sort((left, right) => right.needIndex - left.needIndex);
  const selected = [];
  if (eligible[0]) selected.push(eligible[0]);
  if (eligible[1]) {
    const closeToPrimary = eligible[1].needIndex >= eligible[0].needIndex * 0.82;
    if (eligible[1].needIndex >= 3.5 && (closeToPrimary || eligible[1].significant)) selected.push(eligible[1]);
  }

  const recommendations = selected.slice(0, 2).map((candidate, index) => {
    const evidence = candidate.strongestEvidence.map((row) => `${row.title}${row.average.toFixed(1)}分、${impactLabels[row.impact] || impactLabels[0]}`);
    const priorityLabel = index === 0 ? "首选" : "第二建议";
    return {
      courseId: candidate.id,
      title: candidate.courseTitle,
      rank: index + 1,
      priorityLabel,
      needIndex: Number(candidate.needIndex.toFixed(2)),
      rationale: evidence.length
        ? `主要依据：${evidence.join("；")}。`
        : "当前模块已完成有效观察。",
      focus: candidate.focus,
      decisionNote: "由跨专业团队结合医学安全、家庭优先事项、学生承受度和学校课时资源复核后排课。"
    };
  });

  const notes = [];
  if (!recommendations.length) {
    const anyReady = Object.values(moduleReadiness).some((item) => item.ready);
    notes.push(anyReady
      ? "当前结果暂不支持仅凭本次观察新增个训课，建议先采用课堂与生活情境支持，并按目标追踪后复评。"
      : "尚无专业模块达到分流所需的最低资料量；请先达到相应模块标注的有效领域数后再形成个训建议。");
  } else {
    notes.push(`系统本次建议${recommendations.length}项个训方向，按功能需要而非诊断名称排序。`);
  }
  const incomplete = Object.values(moduleReadiness).filter((item) => !item.ready).map((item) => item.label);
  if (incomplete.length) notes.push(`未充分评估的模块：${incomplete.join("、")}；不能据此判断这些专业是否不需要。`);
  notes.push("个训推荐属于校内服务分流决策支持，不替代相应专业的完整评估，也不应自动生成最终课表。");

  return { moduleReadiness, recommendations, notes };
}

export function deidentifyAssessmentRecord(data) {
  const name = String(data.studentName || "");
  const scrub = (value) => name ? String(value || "").split(name).join("该学生") : String(value || "");
  return {
    ...data,
    studentName: "",
    className: "",
    organizationName: "",
    evaluator: "",
    reviewer: "",
    background: "",
    medicalPrecautions: "",
    domains: Object.fromEntries(Object.entries(data.domains || {}).map(([id, domain]) => [id, {
      ...domain,
      note: scrub(domain.note)
    }]))
  };
}

export function compactAssessmentAnalysis(result) {
  return {
    methodVersion: result.methodVersion,
    average: result.average,
    coverage: result.coverage,
    level: result.level,
    confidence: result.confidence,
    summary: result.summary,
    basis: result.basis,
    alerts: result.alerts,
    strengths: result.strengths,
    needs: result.needs,
    goals: result.goals,
    strategies: result.strategies,
    courseRecommendations: result.courseRecommendations,
    courseRecommendationNotes: result.courseRecommendationNotes,
    moduleReadiness: result.moduleReadiness,
    moduleSummaries: result.moduleSummaries,
    professionalFindings: result.professionalFindings,
    referenceSummaries: result.referenceSummaries,
    domainScores: result.domainScores
  };
}

export function analyzeAssessment(data, { domains, scoreLevels, impactLabels }) {
  const observationSources = list(data.observationSources);
  const rows = domains.map((domain) => {
    const value = data.domains?.[domain.id] || { items: {}, impact: 0, support: "部分提示", note: "" };
    const itemScores = domain.items.map((item) => ({ ...item, score: scoreValue(value.items?.[item.id]) }));
    const rated = itemScores.filter((item) => item.score !== null);
    const average = rated.length ? rated.reduce((sum, item) => sum + item.score, 0) / rated.length : null;
    const minimumItems = Number(domain.minimumItems) || Math.max(3, Math.ceil(domain.items.length * 0.6));
    const valid = rated.length >= minimumItems;
    const impact = Math.max(0, Math.min(3, Number(value.impact) || 0));
    const currentSupportWeight = supportWeight(value.support);
    const lowestScore = rated.length ? Math.min(...rated.map((item) => item.score)) : null;
    const priority = valid
      ? ((5.25 - average) * 1.1) + (impact * 0.75) + (currentSupportWeight * 0.35) + ((5 - lowestScore) * 0.18)
      : -1;
    return {
      ...domain,
      ...value,
      itemScores,
      answered: rated.length,
      minimumItems,
      average,
      valid,
      impact,
      supportWeight: currentSupportWeight,
      lowestScore,
      priority
    };
  });

  const startedProfessionalIds = new Set(rows.filter((row) => row.answered > 0).map((row) => row.professional));
  const assessedDomains = startedProfessionalIds.size
    ? domains.filter((domain) => startedProfessionalIds.has(domain.professional))
    : domains;
  const totalItems = assessedDomains.reduce((sum, domain) => sum + domain.items.length, 0);
  const answeredItems = rows.reduce((sum, row) => sum + row.answered, 0);
  const coverage = totalItems ? Math.round((answeredItems / totalItems) * 100) : 0;
  const validRows = rows.filter((row) => row.valid);
  const average = validRows.length >= 3 ? validRows.reduce((sum, row) => sum + row.average, 0) / validRows.length : null;
  const student = data.studentName || data.studentCode || "该学生";
  const setting = data.setting || "当前评估情境";
  const communicationSupport = communicationSupports[data.communicationMode] || communicationSupports["口语沟通"];
  const goalCommunicationSupport = data.communicationMode || "现有沟通方式";
  const mobilitySupport = mobilitySupports[data.mobility] || mobilitySupports["独立移动"];
  const confidence = confidenceFor(data, coverage, validRows.length, observationSources.length);
  const courseDecision = buildCourseDecision(data, domains, rows, impactLabels);
  const referenceSummaries = uniqueReferences(rows);
  const professionalFindings = buildProfessionalFindings(rows);

  const levelForAverage = (value) => {
    if (value === null) return "资料不足";
    if (value < 2) return "高强度支持需求";
    if (value < 3) return "显著支持需求";
    if (value < 4) return "发展中";
    return "整体较稳定";
  };
  const moduleSummaries = Object.fromEntries(professionalModuleProfiles.map((profile) => {
    const moduleRows = rows.filter((row) => row.professional === profile.id);
    const validModuleRows = moduleRows.filter((row) => row.valid);
    const moduleAverage = validModuleRows.length >= 3
      ? validModuleRows.reduce((sum, row) => sum + row.average, 0) / validModuleRows.length
      : null;
    const priorities = validModuleRows.slice().sort((left, right) => right.priority - left.priority);
    const strengths = validModuleRows.slice().sort((left, right) => right.average - left.average);
    return [profile.id, {
      average: moduleAverage,
      level: levelForAverage(moduleAverage),
      validDomainCount: validModuleRows.length,
      totalDomainCount: moduleRows.length,
      priorityDomainIds: priorities.slice(0, 4).map((row) => row.id),
      strengthDomainIds: strengths.slice(0, 3).map((row) => row.id)
    }];
  }));

  const level = levelForAverage(average);

  const sortedPriority = validRows.slice().sort((a, b) => b.priority - a.priority);
  const stableRows = validRows
    .filter((row) => row.average >= 4 && row.impact <= 1 && row.supportWeight <= 1)
    .sort((a, b) => b.average - a.average);
  const relativeStrengths = (stableRows.length ? stableRows : validRows.slice().sort((a, b) => b.average - a.average)).slice(0, 3);
  let focusRows = sortedPriority.filter((row) => row.average < 4 || row.impact >= 2 || row.supportWeight >= 3).slice(0, 4);
  if (!focusRows.length) focusRows = sortedPriority.filter((row) => row.average < 4.5 || row.impact > 0).slice(0, 2);

  const strengthTitles = relativeStrengths.map((row) => row.title).join("、") || "尚未形成稳定领域";
  const focusTitles = focusRows.map((row) => row.title).join("、") || "暂未发现显著优先领域";
  let summary = `当前有${validRows.length}个有效领域。至少完成3个领域，且每个领域达到页面标注的最低项目量，才能生成综合分析。`;
  if (average !== null) {
    summary = `综合表现：${level}。本次完成${validRows.length}个有效领域、${answeredItems}项观察。相对优势：${strengthTitles}。优先支持：${focusTitles}。结果可信度：${confidence}，请结合课堂、家庭等自然情境和团队复核后使用。`;
    if (courseDecision.recommendations.length) {
      summary += ` 个训方向建议：${courseDecision.recommendations.map((item) => item.title).join("、")}。`;
    }
  }

  const basis = [
    `基本情况：年龄${data.age || "未填写"}；主要发展需要为${data.primaryNeed || "未填写"}；沟通方式为${data.communicationMode || "未填写"}；移动能力为${data.mobility || "未填写"}。`,
    observationSources.length
      ? `观察情况：来源为${observationSources.join("、")}；情境为${setting}；配合情况为${data.cooperation || "未填写"}；结果可信度为${confidence}。`
      : `观察情况：尚未选择观察来源；当前仅依据${setting}中的记录，结果可信度为${confidence}。`,
    "支持优先级：综合参考领域均分、参与影响、当前支持等级和最低项目表现。",
    `目标设定：以当前能力为起点，8周内先提高1级，并适配${data.communicationMode || "当前沟通方式"}和${data.mobility || "当前移动能力"}。`
  ];
  if (referenceSummaries.length) {
    basis.push(`评估参考：${referenceSummaries.map((reference) => reference.title).join("、")}；各参考表仅用于组织任务与解释证据，本站统一分数不替代原表正式计分。`);
  }
  const assignedModules = professionalModuleProfiles.map((profile) => {
    const assessor = professionalAssessor(data, profile.id);
    if (!assessor.evaluator) return "";
    return `${profile.label}由${assessor.evaluator}负责${assessor.assessmentDate ? `（${assessor.assessmentDate}）` : ""}`;
  }).filter(Boolean);
  if (assignedModules.length) basis.push(`专业分工：${assignedModules.join("；")}。`);
  if (data.background) basis.push("目标内容已结合家庭或教师关切，并优先选择有实际意义的活动。");
  if (rows.some((row) => compactText(row.note))) basis.push("复核时需对照原观察记录，核对任务、提示、持续时间和不同情境表现。");

  const strengths = relativeStrengths.map((row) => {
    const items = bestItemsFor(row).map((item) => `${item.label}（${item.score}级）`);
    return `${row.title}（${row.average.toFixed(1)}分，${impactLabels[row.impact]}）：较稳定项目为${items.join("；") || "已评项目"}。可用于支持${leverageByDomain[row.id] || row.scope || "自然活动参与"}。`;
  });

  const needs = focusRows.map((row) => {
    const lowest = row.itemScores.filter((item) => item.score !== null).sort((a, b) => a.score - b.score).slice(0, 2);
    const detail = lowest.map((item) => `${item.label}（${item.score}级）`).join("；");
    const noteStatus = compactText(row.note) ? "实施前请核对原记录中的诱因和有效支持。" : "建议补记任务、提示次数和恢复时间。";
    return `${row.title}：优先原因为${priorityReason(row, impactLabels)}。重点项目：${detail || "已记录的低分项目"}。${noteStatus}`;
  });

  const naturalContexts = observationSources.length >= 2
    ? observationSources.slice(0, 2).join("与")
    : `${setting}和另一个自然情境`;
  const goals = [];
  focusRows.forEach((row) => {
    const targetItem = targetItemFor(row);
    if (!targetItem) return;
    const targetScore = Math.min(5, targetItem.score + 1);
    goals.push(`8周内，在${naturalContexts}中，${student}借助${goalCommunicationSupport}完成“${targetItem.label}”。所需支持不超过“${scoreLevels[targetScore].label}”，连续3次观察达到${targetScore}级；每次记录成功率、提示次数和恢复时间。`);
  });
  if (!goals.length && validRows.length) {
    goals.push(`8周内，${student}在至少2个自然情境中保持现有能力，并将已掌握策略用于新的人员、材料或活动；连续3次记录达到4级或以上。`);
  }

  const strategies = [];
  focusRows.forEach((row) => {
    const targetItem = targetItemFor(row);
    if (targetItem) {
      strategies.push(`${row.title}训练：围绕“${targetItem.label}”，从当前${targetItem.score}级和“${row.support || "部分提示"}”开始；每次只减少一种提示，并观察参与质量和恢复时间。`);
    }
  });
  focusRows.slice(0, 2).forEach((row) => {
    const domainStrategy = list(row.strategies)[0];
    if (domainStrategy) strategies.push(`${row.title}环境支持：${domainStrategy}`);
  });
  strategies.push(`沟通支持：使用${communicationSupport}；明确教会学生表达“继续、停止、帮助、休息”。`);
  strategies.push(`体位与移动：${mobilitySupport}。`);
  if (data.background) strategies.push("活动选择：将学生兴趣、家庭关切和课堂任务结合起来，优先练习真实生活活动，避免脱离生活情境的单一感觉刺激。");
  strategies.push("进展记录：团队统一目标和提示等级；每周记录成功率、提示次数、参与时长和恢复时间，4至8周后复评。");

  const alerts = [];
  if (confidence === "有限") alerts.push("资料或配合度不足。本次自动结果仅供初步参考，不应直接用于高风险活动或长期方案。");
  else if (confidence === "中等") alerts.push("结果可能受观察情境或状态波动影响。建议补充另一自然情境后，再确认支持顺序。");
  if (data.medicalPrecautions) alerts.push("已填写医疗与安全注意事项。开展运动、口腔或进食活动前，须由具备相应资质的专业人员核对风险。");
  if (focusRows.some((row) => row.id === "vestibular")) alerts.push("前庭活动中应允许学生主动停止，并观察面色、眼神、眩晕、恶心和活动后恢复；出现异常应立即停止并转介。");
  if (focusRows.some((row) => row.id === "oral")) alerts.push("本报告中的口腔与进食建议不能替代吞咽评估。若出现呛咳、湿嗓或呼吸改变，应先转介医学或吞咽专业评估。");
  const feedingSafety = rows.find((row) => row.id === "stFeedingSafety");
  if (feedingSafety?.itemScores.some((item) => item.score !== null && item.score <= 2)) alerts.push("进食与吞咽风险筛查存在低等级项目。开展食物或液体训练前，应核对呛咳、湿嗓、呼吸改变、反复感染和营养风险，并由具备相应资质的专业人员决定是否需要完整吞咽评估。");
  const movementSafetyRows = rows.filter((row) => ["ptEndurance", "ptEquipmentAccess", "ptTransfers"].includes(row.id));
  if (movementSafetyRows.some((row) => row.itemScores.some((item) => item.score !== null && item.score <= 2))) alerts.push("运动功能记录提示较高支持需要。实施转移、耐力或辅具活动前，应核对疼痛、心肺反应、皮肤情况、设备匹配和照护者操作安全。");
  if (rows.some((row) => row.id.startsWith("ptGmfm") && row.answered > 0)) alerts.push("GMFM结构参考领域使用本站统一1至5级评分，不能转换为正式GMFM-88维度百分比、总分或疗效结论；需要正式结果时应按原表完整施测与计分。");
  if (rows.some((row) => row.id === "stLanguageDevelopmentStage" && row.answered > 0)) alerts.push("语言发展阶段仅提供S-S法结构线索。正式阶段、症状分类和诊断结论应由具备相应能力的言语语言专业人员依据原表流程确认。");
  alerts.push("本结果来自功能性观察，不是标准化常模量表，不能单独用于医学诊断、教育安置或服务资格判定。");

  if (!strengths.length) strengths.push("完成更多领域后，将显示学生较稳定的能力和可利用的支持资源。");
  if (!needs.length) needs.push("当前未发现明显的优先支持领域。建议继续观察学生在不同人员、材料和自然情境中的表现。");
  if (!goals.length) goals.push("完成至少3个领域后，系统将根据当前能力、参与影响和支持等级生成8周阶段目标。");

  return {
    methodVersion: "multidisciplinary-functional-v7-scale-informed",
    average,
    coverage,
    answeredItems,
    totalItems,
    validDomainCount: validRows.length,
    level,
    confidence,
    summary,
    basis,
    alerts,
    rows,
    strengths,
    needs,
    goals,
    strategies: strategies.slice(0, 10),
    courseRecommendations: courseDecision.recommendations,
    courseRecommendationNotes: courseDecision.notes,
    moduleReadiness: courseDecision.moduleReadiness,
    moduleSummaries,
    professionalFindings,
    referenceSummaries,
    priorities: focusRows,
    domainScores: Object.fromEntries(validRows.map((row) => [row.id, {
      title: row.title,
      professional: row.professional || "",
      score: Number(row.average.toFixed(2)),
      impact: row.impact,
      answered: row.answered,
      support: row.support || "部分提示",
      priority: Number(row.priority.toFixed(2)),
      assessmentMethod: row.assessmentMethod || "多情境功能性观察",
      scoringNote: row.scoringNote || "",
      referenceTitles: list(row.references).map((reference) => reference.title),
      evidenceItems: row.itemScores
        .filter((item) => item.score !== null)
        .sort((left, right) => left.score - right.score)
        .slice(0, 3)
        .map((item) => ({ label: item.label, score: item.score }))
    }]))
  };
}
