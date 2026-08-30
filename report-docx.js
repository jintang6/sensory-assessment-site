const REPORT_WIDTH = 9360;
const TABLE_INDENT = 120;
const FONT_LATIN = "Arial Unicode MS";
const FONT_CJK = "Arial Unicode MS";
const COLORS = {
  ink: "1F2A33",
  soft: "53616C",
  faint: "77838D",
  teal: "167B72",
  tealDark: "0F5D57",
  tealSoft: "E5F3F0",
  navy: "294858",
  gold: "A98748",
  goldSoft: "F6F1E6",
  blue: "356B8C",
  blueSoft: "E8F0F6",
  line: "D9E1E5",
  tableFill: "F2F4F7",
  white: "FFFFFF"
};

function valueOr(value, fallback = "未填写") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDateTime(value) {
  if (!value) return "—";
  const source = String(value);
  const date = new Date(source.includes("T") ? source : `${source.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return source;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function safeFilename(value) {
  return String(value || "未命名学生").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 48);
}

function reportNumber(row, record) {
  const date = String(record.assessmentDate || "").replaceAll("-", "") || new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const identity = String(record.studentCode || row?.id || "REPORT").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(-10) || "REPORT";
  return `ZH-SI-${date}-${identity}`;
}

export function assessmentReportFilename(row) {
  const record = row?.assessment || {};
  const title = row?.student_label || record.studentName || record.studentCode || "未命名学生";
  return `${safeFilename(title)}-感觉统合功能评估报告.docx`;
}

export function buildAssessmentReportDocument(row, api) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
    LevelFormat,
    LineRuleType,
    PageNumber,
    PageOrientation,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType
  } = api || {};

  if (!Document || !Packer) throw new Error("DOCX 组件未能加载");

  const record = row?.assessment || {};
  const analysis = row?.analysis || {};
  const title = row?.student_label || record.studentName || record.studentCode || "评估记录";
  const organizationName = valueOr(record.organizationName, "知衡特殊教育康复评估");
  const documentNumber = reportNumber(row, record);
  const privacyMode = Number(row?.is_deidentified) === 1 ? "去标识化记录" : "完整记录";
  const impactLabels = ["无明显影响", "轻度影响", "中度影响", "显著影响"];
  const font = { ascii: FONT_LATIN, hAnsi: FONT_LATIN, eastAsia: FONT_CJK, cs: FONT_CJK, hint: "eastAsia" };
  const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: COLORS.line };
  const tableBorders = {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
    insideHorizontal: thinBorder,
    insideVertical: thinBorder
  };
  const cellMargins = { top: 80, bottom: 80, left: 120, right: 120, marginUnitType: WidthType.DXA };

  const run = (text, options = {}) => new TextRun({
    text: String(text ?? ""),
    font,
    size: options.size ?? 24,
    color: options.color || COLORS.ink,
    bold: options.bold,
    italics: options.italics,
    language: { value: "zh-CN", eastAsia: "zh-CN" }
  });

  const bodyParagraph = (text, options = {}) => new Paragraph({
    children: [run(text, options.run)],
    style: options.style || "ReportBody",
    alignment: options.alignment,
    keepNext: options.keepNext,
    spacing: options.spacing
  });

  const heading = (text) => new Paragraph({
    children: [run(text, { size: 32, bold: true, color: COLORS.navy })],
    style: "ReportHeading1",
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.teal } }
  });

  const numberingReferences = [
    "report-basis",
    "report-alerts",
    "report-strengths",
    "report-needs",
    "report-goals",
    "report-strategies"
  ];

  const numberedList = (items, reference) => (Array.isArray(items) && items.length ? items : ["暂无"]).map((item) => new Paragraph({
    children: [run(item)],
    numbering: { reference, level: 0 },
    style: "ReportNumbered"
  }));

  const metadataCell = (label, value) => new TableCell({
    width: { size: 3120, type: WidthType.DXA },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        spacing: { after: 20 },
        children: [run(label, { size: 19, bold: true, color: COLORS.faint })]
      }),
      new Paragraph({
        spacing: { after: 0 },
        children: [run(valueOr(value), { size: 22, bold: true, color: COLORS.ink })]
      })
    ]
  });

  const metadataRows = [
    [["学生标识", title], ["学生编号", record.studentCode], ["报告编号", documentNumber]],
    [["年龄", record.age], ["性别", record.gender], ["班级", record.className]],
    [["主要发展需要", record.primaryNeed], ["评估人", record.evaluator], ["评估日期", record.assessmentDate]],
    [["主要情境", record.setting], ["综合分", analysis.average == null ? "—" : Number(analysis.average).toFixed(1)], ["完成度", `${Number(analysis.coverage) || 0}%`]],
    [["沟通方式", record.communicationMode], ["移动能力", record.mobility], ["分析可信度", analysis.confidence]]
  ].map((cells) => new TableRow({
    cantSplit: true,
    children: cells.map(([label, value]) => metadataCell(label, value))
  }));

  const metadataTable = new Table({
    rows: metadataRows,
    width: { size: REPORT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    columnWidths: [3120, 3120, 3120],
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    margins: cellMargins
  });

  const signatureCell = (label, value) => new TableCell({
    width: { size: 3120, type: WidthType.DXA },
    margins: { top: 130, bottom: 130, left: 150, right: 150, marginUnitType: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({ spacing: { after: 180 }, children: [run(label, { size: 20, bold: true, color: COLORS.faint })] }),
      new Paragraph({ spacing: { after: 180 }, children: [run(valueOr(value, "________________"), { size: 22, bold: Boolean(value), color: COLORS.ink })] }),
      new Paragraph({ spacing: { after: 0 }, children: [run("日期：________________", { size: 18, color: COLORS.faint })] })
    ]
  });

  const signatureTable = new Table({
    rows: [new TableRow({
      cantSplit: true,
      children: [
        signatureCell("评估人签名", record.evaluator),
        signatureCell("复核人签名", record.reviewer),
        signatureCell("机构盖章", "")
      ]
    })],
    width: { size: REPORT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    columnWidths: [3120, 3120, 3120],
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    margins: cellMargins
  });

  const domainWidths = [1900, 720, 780, 1100, 1350, 3510];
  const domainHeader = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: ["领域", "均分", "项目", "参与影响", "当前支持", "观察记录"].map((label, index) => new TableCell({
      width: { size: domainWidths[index], type: WidthType.DXA },
      margins: cellMargins,
      shading: { fill: COLORS.blueSoft, type: ShadingType.CLEAR },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [run(label, { size: 20, bold: true, color: COLORS.blue })]
      })]
    }))
  });

  const domainRows = Object.entries(analysis.domainScores || {}).map(([id, domain]) => {
    const detail = record.domains?.[id] || {};
    const score = Number(domain?.score);
    const values = [
      valueOr(domain?.title, id),
      Number.isFinite(score) ? score.toFixed(1) : "—",
      `${Number(domain?.answered) || 0}项`,
      impactLabels[Number(domain?.impact) || 0] || impactLabels[0],
      valueOr(detail.support, "未记录"),
      valueOr(detail.note, "—")
    ];
    return new TableRow({
      cantSplit: true,
      children: values.map((value, index) => new TableCell({
        width: { size: domainWidths[index], type: WidthType.DXA },
        margins: cellMargins,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: index >= 1 && index <= 3 ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { after: 0, line: 240, lineRule: LineRuleType.AUTO },
          children: [run(value, { size: 20, color: index === 1 ? COLORS.tealDark : COLORS.ink, bold: index === 1 })]
        })]
      }))
    });
  });

  const domainTable = new Table({
    rows: [domainHeader, ...(domainRows.length ? domainRows : [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        columnSpan: 6,
        width: { size: REPORT_WIDTH, type: WidthType.DXA },
        margins: cellMargins,
        children: [bodyParagraph("暂无有效领域", { alignment: AlignmentType.CENTER })]
      })]
    })])],
    width: { size: REPORT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    columnWidths: domainWidths,
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    margins: cellMargins
  });

  const header = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 5, color: COLORS.line } },
      children: [
        run(organizationName, { size: 20, bold: true, color: COLORS.navy }),
        run(`    |    ${privacyMode} · 保密文件`, { size: 18, color: COLORS.faint })
      ]
    })]
  });

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 0 },
      children: [
        run("仅供获授权的教育康复团队使用    第 ", { size: 18, color: COLORS.faint }),
        new TextRun({ children: [PageNumber.CURRENT], font, size: 18, color: COLORS.faint }),
        run(" 页，共 ", { size: 18, color: COLORS.faint }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font, size: 18, color: COLORS.faint }),
        run(" 页", { size: 18, color: COLORS.faint })
      ]
    })]
  });

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 180 },
      children: [run(organizationName, { size: 26, bold: true, color: COLORS.navy })]
    }),
    new Paragraph({
      style: "ReportTitle",
      alignment: AlignmentType.CENTER,
      children: [run("感觉统合功能评估报告", { size: 46, bold: true, color: COLORS.ink })]
    }),
    new Paragraph({
      style: "ReportSubtitle",
      alignment: AlignmentType.CENTER,
      children: [run(`学生标识：${title}    报告编号：${documentNumber}`, { size: 22, color: COLORS.soft })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 250 },
      children: [run(`评估日期：${valueOr(record.assessmentDate)}    报告状态：待专业人员复核`, { size: 20, color: COLORS.faint })]
    }),
    new Paragraph({
      style: "ReportCallout",
      border: { left: { style: BorderStyle.SINGLE, size: 16, color: COLORS.gold } },
      shading: { fill: COLORS.goldSoft, type: ShadingType.CLEAR },
      children: [run("报告使用说明：本报告由功能性观察数据自动整理，供教育康复团队制定和复核个别化支持计划使用；不是标准化常模量表，不能替代医学诊断或完整作业治疗评估。", { size: 22, color: COLORS.navy })]
    }),
    metadataTable,
    heading("一、评估目的与方法"),
    bodyParagraph(`评估目的：描述${title}在${valueOr(record.setting, "学校与康复情境")}中的感觉调节、感觉运动和活动参与表现，识别相对优势与优先支持需要，并形成可测量的阶段目标。`),
    bodyParagraph(`资料来源：${Array.isArray(record.observationSources) && record.observationSources.length ? record.observationSources.join("、") : "未记录"}。评分反映学生在当前支持条件下完成可观察任务的程度，并结合参与影响、支持等级与具体观察解释。`),
    heading("二、评估摘要"),
    bodyParagraph(valueOr(analysis.summary, "尚未形成有效摘要。")),
    heading("三、个别化分析依据"),
    ...numberedList(analysis.basis, "report-basis"),
    heading("四、背景与安全信息"),
    bodyParagraph(`主要关切：${valueOr(record.background, "未填写或已去标识化")}`),
    bodyParagraph(`医疗与安全注意事项：${valueOr(record.medicalPrecautions, "未填写或已去标识化")}`),
    ...numberedList(analysis.alerts, "report-alerts"),
    heading("五、相对优势"),
    ...numberedList(analysis.strengths, "report-strengths"),
    heading("六、优先支持需要"),
    ...numberedList(analysis.needs, "report-needs"),
    heading("七、8周阶段目标"),
    ...numberedList(analysis.goals, "report-goals"),
    heading("八、康复、课堂与生活支持"),
    ...numberedList(analysis.strategies, "report-strategies"),
    heading("九、领域表现与观察记录"),
    domainTable,
    new Paragraph({
      style: "ReportNote",
      children: [run("评分说明：1=全程协助，2=大量协助，3=部分提示，4=少量提示，5=独立稳定。每个领域至少完成3项才形成领域分，结果应结合多情境观察、家庭优先事项和跨专业资料解释。", { size: 20, color: COLORS.faint })]
    }),
    new Paragraph({
      style: "ReportNote",
      children: [run(`文档生成时间：${formatDateTime(new Date().toISOString())}`, { size: 20, color: COLORS.faint })]
    }),
    heading("十、专业人员确认"),
    bodyParagraph("评估人与复核人应结合原始观察记录、家庭和教师意见及必要的跨专业资料，对本报告结论与目标进行确认。"),
    signatureTable,
    new Paragraph({
      style: "ReportNote",
      alignment: AlignmentType.CENTER,
      children: [run("本报告包含学生教育康复信息，请按照机构隐私制度妥善保管和传递。", { size: 18, color: COLORS.faint })]
    })
  ];

  return new Document({
    creator: "知衡感觉统合评估系统",
    lastModifiedBy: "知衡感觉统合评估系统",
    title: `${title} 感觉统合功能评估报告`,
    subject: "学校与康复场景功能性观察报告",
    description: "由授权同步的感觉统合功能评估数据生成。",
    styles: {
      default: {
        document: {
          run: { font, size: 24, color: COLORS.ink },
          paragraph: { spacing: { after: 140, line: 300, lineRule: LineRuleType.AUTO } }
        }
      },
      paragraphStyles: [
        {
          id: "ReportBody",
          name: "Report Body",
          basedOn: "Normal",
          next: "ReportBody",
          quickFormat: true,
          run: { font, size: 24, color: COLORS.ink },
          paragraph: { spacing: { before: 0, after: 140, line: 300, lineRule: LineRuleType.AUTO }, widowControl: true }
        },
        {
          id: "ReportTitle",
          name: "Report Title",
          basedOn: "Normal",
          next: "ReportSubtitle",
          quickFormat: true,
          run: { font, size: 44, bold: true, color: COLORS.ink },
          paragraph: { spacing: { before: 0, after: 80 }, keepNext: true }
        },
        {
          id: "ReportSubtitle",
          name: "Report Subtitle",
          basedOn: "Normal",
          next: "ReportBody",
          quickFormat: true,
          run: { font, size: 20, color: COLORS.soft },
          paragraph: { spacing: { before: 0, after: 240 }, keepNext: true }
        },
        {
          id: "ReportHeading1",
          name: "Report Heading 1",
          basedOn: "Normal",
          next: "ReportBody",
          quickFormat: true,
          run: { font, size: 32, bold: true, color: COLORS.teal },
          paragraph: { spacing: { before: 320, after: 160 }, keepNext: true, outlineLevel: 0 }
        },
        {
          id: "ReportNumbered",
          name: "Report Numbered",
          basedOn: "ReportBody",
          next: "ReportNumbered",
          quickFormat: true,
          run: { font, size: 24, color: COLORS.ink },
          paragraph: { spacing: { before: 0, after: 160, line: 300, lineRule: LineRuleType.AUTO }, widowControl: true }
        },
        {
          id: "ReportCallout",
          name: "Report Callout",
          basedOn: "ReportBody",
          next: "ReportBody",
          quickFormat: true,
          run: { font, size: 22, color: COLORS.blue },
          paragraph: { spacing: { before: 0, after: 220, line: 288, lineRule: LineRuleType.AUTO }, indent: { left: 180, right: 180 } }
        },
        {
          id: "ReportNote",
          name: "Report Note",
          basedOn: "ReportBody",
          next: "ReportNote",
          quickFormat: true,
          run: { font, size: 20, color: COLORS.faint },
          paragraph: { spacing: { before: 100, after: 60, line: 264, lineRule: LineRuleType.AUTO } }
        }
      ]
    },
    numbering: {
      config: numberingReferences.map((reference) => ({
        reference,
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: {
            run: { font, size: 24, bold: true, color: COLORS.teal },
            paragraph: {
              indent: { left: 720, hanging: 360 },
              spacing: { after: 160, line: 300, lineRule: LineRuleType.AUTO }
            }
          }
        }]
      }))
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 }
        }
      },
      headers: { default: header },
      footers: { default: footer },
      children
    }]
  });
}
