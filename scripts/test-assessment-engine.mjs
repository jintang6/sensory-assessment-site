import assert from "node:assert/strict";
import { analyzeAssessment, compactAssessmentAnalysis, deidentifyAssessmentRecord } from "../assessment-engine.js";

const makeItems = (prefix) => [1, 2, 3].map((index) => ({
  id: `${prefix}_${index}`,
  label: `${prefix}功能项目${index}`,
  observe: "自然情境观察"
}));

const domains = [
  { id: "visual", title: "视觉调节与视觉辨别", category: "modulation", items: makeItems("视觉"), strategies: ["减少视觉拥挤并使用清晰边界。"] },
  { id: "fineMotor", title: "精细动作与视觉运动", category: "sensorimotor", items: makeItems("精细"), strategies: ["在真实学习任务中练习工具使用。"] },
  { id: "regulation", title: "唤醒调节、注意与转衔", category: "participation", items: makeItems("调节"), strategies: ["使用视觉日程和明确结束信号。"] }
];

const scoreLevels = {
  1: { label: "全程协助", range: "完成少于25%" },
  2: { label: "大量协助", range: "完成25-49%" },
  3: { label: "部分提示", range: "完成50-74%" },
  4: { label: "少量提示", range: "完成75-89%" },
  5: { label: "独立稳定", range: "完成至少90%" }
};

const data = {
  studentName: "测试学生",
  studentCode: "T001",
  primaryNeed: "全面发育迟缓/智力障碍",
  setting: "课堂",
  cooperation: "资料充分，表现较稳定",
  communicationMode: "辅助沟通设备",
  mobility: "需监督或扶持",
  observationSources: ["课堂观察", "结构化任务"],
  background: "教师关注活动转换和桌面任务持续时间。",
  medicalPrecautions: "运动活动需近身保护。",
  domains: {
    visual: { items: { "视觉_1": 5, "视觉_2": 4, "视觉_3": 4 }, impact: 0, support: "少量提示", note: "" },
    fineMotor: { items: { "精细_1": 3, "精细_2": 3, "精细_3": 3 }, impact: 1, support: "部分提示", note: "记录提示次数。" },
    regulation: { items: { "调节_1": 4, "调节_2": 3, "调节_3": 3 }, impact: 3, support: "全程协助", note: "转换时需要持续成人支持。" }
  }
};

const result = analyzeAssessment(data, {
  domains,
  scoreLevels,
  impactLabels: ["无明显影响", "轻度影响", "中度影响", "显著影响"]
});

assert.equal(result.methodVersion, "individualized-functional-v3");
assert.equal(result.validDomainCount, 3);
assert.equal(result.coverage, 100);
assert.equal(result.priorities[0].id, "regulation");
assert.match(result.summary, /测试学生.*课堂.*优先支持领域/);
assert.match(result.goals[0], /辅助沟通设备/);
assert.ok(result.strategies.some((item) => item.includes("近身保护")));
assert.ok(result.basis.some((item) => item.includes("当前支持等级")));
assert.ok(result.alerts.some((item) => item.includes("医疗与安全注意事项")));
assert.ok(result.domainScores.regulation.priority > result.domainScores.fineMotor.priority);

const partialResult = analyzeAssessment({ ...data, domains: { visual: data.domains.visual } }, {
  domains: domains.slice(0, 1),
  scoreLevels,
  impactLabels: ["无明显影响", "轻度影响", "中度影响", "显著影响"]
});
assert.equal(partialResult.average, null);
assert.match(partialResult.summary, /当前已有1个有效领域/);

const deidentifiedRecord = deidentifyAssessmentRecord({
  ...data,
  domains: {
    ...data.domains,
    regulation: { ...data.domains.regulation, note: "测试学生转换时需要持续成人支持。" }
  }
});
const deidentifiedResult = analyzeAssessment(deidentifiedRecord, {
  domains,
  scoreLevels,
  impactLabels: ["无明显影响", "轻度影响", "中度影响", "显著影响"]
});
const cloudAnalysis = compactAssessmentAnalysis(deidentifiedResult);
assert.equal(deidentifiedRecord.studentName, "");
assert.equal(deidentifiedRecord.background, "");
assert.equal(deidentifiedRecord.medicalPrecautions, "");
assert.match(deidentifiedRecord.domains.regulation.note, /^该学生/);
assert.doesNotMatch(JSON.stringify(cloudAnalysis), /测试学生|教师关注活动转换|运动活动需近身保护/);
assert.equal("rows" in cloudAnalysis, false);

process.stdout.write("assessment engine QA passed\n");
