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
    const valid = rated.length >= 3;
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
      average,
      valid,
      impact,
      supportWeight: currentSupportWeight,
      lowestScore,
      priority
    };
  });

  const totalItems = domains.reduce((sum, domain) => sum + domain.items.length, 0);
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

  let level = "资料不足";
  if (average !== null) {
    if (average < 2) level = "高强度支持需求";
    else if (average < 3) level = "显著支持需求";
    else if (average < 4) level = "发展中";
    else level = "整体较稳定";
  }

  const sortedPriority = validRows.slice().sort((a, b) => b.priority - a.priority);
  const stableRows = validRows
    .filter((row) => row.average >= 4 && row.impact <= 1 && row.supportWeight <= 1)
    .sort((a, b) => b.average - a.average);
  const relativeStrengths = (stableRows.length ? stableRows : validRows.slice().sort((a, b) => b.average - a.average)).slice(0, 3);
  let focusRows = sortedPriority.filter((row) => row.average < 4 || row.impact >= 2 || row.supportWeight >= 3).slice(0, 4);
  if (!focusRows.length) focusRows = sortedPriority.filter((row) => row.average < 4.5 || row.impact > 0).slice(0, 2);

  const strengthTitles = relativeStrengths.map((row) => row.title).join("、") || "尚未形成稳定领域";
  const focusTitles = focusRows.map((row) => row.title).join("、") || "暂未发现显著优先领域";
  let summary = `当前有${validRows.length}个有效领域。至少完成3个领域，且每个领域不少于3项，才能生成综合分析。`;
  if (average !== null) {
    summary = `综合表现：${level}。本次完成${validRows.length}个有效领域、${answeredItems}项观察。相对优势：${strengthTitles}。优先支持：${focusTitles}。结果可信度：${confidence}，请结合课堂、家庭等自然情境和团队复核后使用。`;
  }

  const basis = [
    `基本情况：年龄${data.age || "未填写"}；主要发展需要为${data.primaryNeed || "未填写"}；沟通方式为${data.communicationMode || "未填写"}；移动能力为${data.mobility || "未填写"}。`,
    observationSources.length
      ? `观察情况：来源为${observationSources.join("、")}；情境为${setting}；配合情况为${data.cooperation || "未填写"}；结果可信度为${confidence}。`
      : `观察情况：尚未选择观察来源；当前仅依据${setting}中的记录，结果可信度为${confidence}。`,
    "支持优先级：综合参考领域均分、参与影响、当前支持等级和最低项目表现。",
    `目标设定：以当前能力为起点，8周内先提高1级，并适配${data.communicationMode || "当前沟通方式"}和${data.mobility || "当前移动能力"}。`
  ];
  if (data.background) basis.push("目标内容已结合家庭或教师关切，并优先选择有实际意义的活动。");
  if (rows.some((row) => compactText(row.note))) basis.push("复核时需对照原观察记录，核对任务、提示、持续时间和不同情境表现。");

  const strengths = relativeStrengths.map((row) => {
    const items = bestItemsFor(row).map((item) => `${item.label}（${item.score}级）`);
    return `${row.title}（${row.average.toFixed(1)}分，${impactLabels[row.impact]}）：较稳定项目为${items.join("；") || "已评项目"}。可用于支持${leverageByDomain[row.id] || "自然活动参与"}。`;
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
  alerts.push("本结果来自功能性观察，不是标准化常模量表，不能单独用于医学诊断、教育安置或服务资格判定。");

  if (!strengths.length) strengths.push("完成更多领域后，将显示学生较稳定的能力和可利用的支持资源。");
  if (!needs.length) needs.push("当前未发现明显的优先支持领域。建议继续观察学生在不同人员、材料和自然情境中的表现。");
  if (!goals.length) goals.push("完成至少3个领域后，系统将根据当前能力、参与影响和支持等级生成8周阶段目标。");

  return {
    methodVersion: "individualized-functional-v4",
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
    priorities: focusRows,
    domainScores: Object.fromEntries(validRows.map((row) => [row.id, {
      title: row.title,
      score: Number(row.average.toFixed(2)),
      impact: row.impact,
      answered: row.answered,
      support: row.support || "部分提示",
      priority: Number(row.priority.toFixed(2))
    }]))
  };
}
