import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildAssessmentReportDocument } from "../report-docx.js";

const modulePath = process.env.DOCX_MODULE_PATH;
const outputPath = process.env.REPORT_OUTPUT_PATH;
if (!modulePath || !outputPath) throw new Error("DOCX_MODULE_PATH and REPORT_OUTPUT_PATH are required");

const importedModule = await import(pathToFileURL(modulePath));
const docx = importedModule.Document
  ? importedModule
  : importedModule.default?.Document
    ? importedModule.default
    : globalThis.docx;
if (!docx?.Document || !docx?.Packer) throw new Error("DOCX module did not expose the expected API");
const domainDefinitions = [
  ["触觉调节与辨别", "si"], ["前庭调节与运动耐受", "si"], ["本体觉处理与力量调节", "si"],
  ["听觉调节与辨别", "si"], ["唤醒水平与情绪调节", "si"],
  ["视觉调节与视觉运动", "ot"], ["双侧协调与身体中线", "ot"], ["动作计划与执行", "ot"],
  ["精细动作与书写准备", "ot"], ["日常活动与社会参与", "ot"],
  ["口腔感觉与进食参与", "st"], ["语言理解与表达", "st"], ["功能性沟通与互动", "st"],
  ["姿势控制与平衡", "pt"], ["粗大运动与移动", "pt"], ["平衡、耐力与运动参与", "pt"]
];
const domainScores = {};
const domains = {};
domainDefinitions.forEach(([title, professional], index) => {
  const id = `domain_${index + 1}`;
  domainScores[id] = {
    title,
    professional,
    score: Number((2.2 + (index % 5) * 0.55).toFixed(1)),
    answered: 5,
    impact: index % 4
  };
  domains[id] = {
    support: ["全程协助", "大量协助", "部分提示", "少量提示"][index % 4],
    note: `在课堂、训练室和生活活动中完成三次观察。第${index + 1}领域在任务开始、持续参与和转换环节的表现存在差异，需要结合提示次数、成功比例和恢复时间继续记录。`
  };
});

const row = {
  student_label: "测试学生A001",
  is_deidentified: 1,
  updated_at: "2026-08-30T04:00:00.000Z",
  assessment: {
    studentCode: "A001",
    age: "9岁4个月",
    gender: "男",
    className: "启智三班",
    organizationName: "示例特殊教育学校",
    primaryNeed: "全面发育迟缓/智力障碍",
    evaluator: "测试评估人",
    reviewer: "测试复核人",
    assessmentDate: "2026-08-30",
    professionalAssessors: {
      si: { evaluator: "李老师", assessmentDate: "2026-08-26" },
      ot: { evaluator: "周老师", assessmentDate: "2026-08-27" },
      st: { evaluator: "王老师", assessmentDate: "2026-08-28" },
      pt: { evaluator: "陈老师", assessmentDate: "2026-08-29" }
    },
    setting: "综合观察",
    communicationMode: "口语沟通",
    mobility: "独立移动",
    observationSources: ["课堂观察", "结构化任务", "教师访谈"],
    background: "主要关注课堂坐姿维持、活动转换、双手操作以及面对声音干扰时的学习参与。",
    medicalPrecautions: "无已知运动禁忌；旋转活动需观察面色、眼神和恢复时间。",
    domains
  },
  analysis: {
    average: 3.2,
    coverage: 100,
    level: "发展中",
    confidence: "较高",
    courseRecommendations: [
      {
        rank: 1,
        courseId: "st",
        title: "言语语言个训（ST）",
        priorityLabel: "首选",
        needIndex: 78,
        rationale: "语言理解、功能性表达与互动参与对课堂指令执行的影响最明显。",
        focus: "理解单步至两步指令、主动表达需要、轮替互动"
      },
      {
        rank: 2,
        courseId: "ot",
        title: "作业治疗个训（OT）",
        priorityLabel: "第二建议",
        needIndex: 69,
        rationale: "精细操作、动作计划与日常任务独立性需要进一步支持。",
        focus: "双手协作、任务步骤组织、生活与课堂操作"
      }
    ],
    courseRecommendationNotes: [
      "建议优先安排ST个训，并由OT作为第二支持方向。",
      "课程建议用于团队讨论，不替代治疗师面谈、禁忌筛查与实际排课决策。"
    ],
    moduleReadiness: {
      si: { label: "感觉统合", ready: true, validDomainCount: 12, totalDomainCount: 12, requiredDomainCount: 5, coverage: 100 },
      ot: { label: "作业治疗", ready: true, validDomainCount: 13, totalDomainCount: 13, requiredDomainCount: 5, coverage: 100 },
      st: { label: "言语语言", ready: true, validDomainCount: 11, totalDomainCount: 11, requiredDomainCount: 4, coverage: 100 },
      pt: { label: "运动功能", ready: true, validDomainCount: 11, totalDomainCount: 11, requiredDomainCount: 4, coverage: 100 }
    },
    summary: "学生在当前支持条件下能够完成部分熟悉活动，在本体觉输入后的姿势控制和双手操作中表现相对稳定；声音干扰、活动转换和新动作计划仍会明显影响课堂参与。",
    basis: [
      "学生情况：全面发育迟缓/智力障碍；沟通方式为口语沟通；移动能力为独立移动。",
      "优先级综合考虑领域均分、参与影响、当前支持等级和关键项目最低表现。"
    ],
    alerts: [
      "本结果基于功能性观察自动整理，不是标准化常模量表，不能单独用于医学诊断。"
    ],
    strengths: [
      "在熟悉流程和清晰视觉提示下，能维持任务参与并完成主要步骤。",
      "接受推、拉、搬运等本体觉活动后，坐姿稳定性和双手操作质量有所提升。",
      "能够使用简单口语或图片表达停止、继续和需要帮助。"
    ],
    needs: [
      "面对突然声音或多人环境时容易分心，需要建立可预测的听觉调节与回到任务策略。",
      "从偏好活动转换到课堂任务时需要较多成人提示，独立使用视觉流程的能力不足。",
      "新颖动作任务中动作构思和顺序组织较慢，需要分步示范与重复练习。"
    ],
    goals: [
      "8周内，在视觉流程和一次语言提醒下，学生能从偏好活动转换到指定课堂任务，并在连续3次观察中于2分钟内开始任务。",
      "8周内，在轻度环境噪声条件下，学生能使用已教的调节策略并回到桌面任务，连续3次记录达到4级表现。",
      "8周内，在少量示范下完成包含3个步骤的双手操作活动，连续3次记录成功率达到80%以上。"
    ],
    strategies: [
      "课堂转换前提供倒计时、视觉流程和明确结束标志，转换完成后立即给予具体反馈。",
      "每天安排短时、可预测的推拉搬运活动，并记录活动后10分钟内的坐姿、注意和任务完成情况。",
      "新动作先用完整示范建立整体概念，再使用图片或实物提示拆分步骤，逐步减少提示。",
      "家校使用相同的停止、帮助和休息信号，每周汇总成功比例、提示等级和恢复时间。"
    ],
    domainScores
  }
};

const fontData = await readFile(new URL("../assets/NotoSansSC-Regular-GB2312.ttf", import.meta.url));
const documentFile = buildAssessmentReportDocument(row, docx, fontData);
const arrayBuffer = await docx.Packer.toArrayBuffer(documentFile);
await writeFile(outputPath, Buffer.from(arrayBuffer));
process.stdout.write(`${outputPath}\n`);
