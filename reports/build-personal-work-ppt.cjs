const path = require('node:path');
const os = require('node:os');
const PptxGenJS = require(path.join(os.tmpdir(), 'qiye-pptx-tools/node_modules/pptxgenjs'));

const ppt = new PptxGenJS();
ppt.layout = 'LAYOUT_WIDE';
ppt.author = 'Project contributor';
ppt.subject = '课程设计个人工作汇报：临床 AI、RAG 与 DDInter';
ppt.title = '临床 AI 与 RAG：个人工作汇报';
ppt.company = 'EnterpriseTeamEngineering';
ppt.lang = 'zh-CN';
ppt.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei', lang: 'zh-CN' };

const W = 13.333333, H = 7.5;
const C = { bg: 'F8FAFB', paper: 'FFFFFF', ink: '203038', mute: '62727A', teal: '087E80', pale: 'E6F2F1', blue: '487B9C', amber: 'B17A12', yellow: 'FFF4DD', red: 'B64457', line: 'DDE5E8', gray: 'A8B5BD' };
const bounds = [];
const rect = (s, x, y, w, h, fill = C.paper, line = fill) => s.addShape(ppt.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: line, width: 0.6 } });
const text = (s, value, x, y, w, h, size = 18, color = C.ink, bold = false, extra = {}) => {
  bounds.push({ slide: ppt._slides.length, value: typeof value === 'string' ? value.slice(0, 36) : 'rich text', x, y, w, h });
  s.addText(value, { x, y, w, h, fontFace: 'Microsoft YaHei', fontSize: size, color, bold, margin: 0, valign: 'mid', breakLine: false, fit: 'shrink', ...extra });
};
const line = (s, x, y, w, color = C.line) => s.addShape(ppt.ShapeType.line, { x, y, w, h: 0, line: { color, width: 1 } });
const pill = (s, label, x, y, w, color = C.teal, fill = C.pale) => { rect(s, x, y, w, 0.33, fill); text(s, label, x, y, w, 0.33, 11, color, true, { align: 'center' }); };
const metric = (s, value, label, x, y, w, color = C.teal) => { text(s, value, x, y, w, 0.63, 34, color, true); text(s, label, x, y + 0.73, w, 0.42, 14, C.mute); };
const note = (s, value) => s.addNotes(value);
function slide(section, title, subtitle = '') {
  const s = ppt.addSlide();
  s.background = { color: C.bg };
  rect(s, 0, 0, 0.12, H, C.teal);
  text(s, section.toUpperCase(), 0.55, 0.34, 11.8, 0.3, 11, C.teal, true);
  text(s, title, 0.55, 0.86, 12.15, 0.57, 29, C.ink, true);
  if (subtitle) text(s, subtitle, 0.56, 1.52, 12.05, 0.42, 14, C.mute);
  line(s, 0.55, 7.02, 12.2);
  text(s, '个人工作汇报  /  临床 AI 与知识工程  /  非商业课程设计', 0.55, 7.12, 10.8, 0.2, 9, C.mute);
  text(s, `${String(ppt._slides.length).padStart(2, '0')} / 13`, 11.65, 7.09, 1.1, 0.25, 10, C.mute, false, { align: 'right' });
  return s;
}
function block(s, title, body, x, y, w, h, color = C.teal) {
  rect(s, x, y, w, h, C.paper, C.line);
  rect(s, x, y, 0.05, h, color);
  text(s, title, x + 0.22, y + 0.18, w - 0.44, 0.4, 19, color, true);
  text(s, body, x + 0.22, y + 0.76, w - 0.44, h - 0.94, 16, C.ink, false, { valign: 'top', paraSpaceAfterPt: 8 });
}
function table(s, headers, rows, x, y, widths, rowHeight = 0.58, size = 15) {
  const w = widths.reduce((a, b) => a + b, 0);
  rect(s, x, y, w, 0.46, C.teal);
  let xx = x;
  headers.forEach((h, i) => { text(s, h, xx + 0.13, y, widths[i] - 0.26, 0.46, 12, C.paper, true); xx += widths[i]; });
  rows.forEach((r, ri) => {
    const yy = y + 0.46 + ri * rowHeight;
    rect(s, x, yy, w, rowHeight, ri % 2 ? 'EEF3F5' : C.paper);
    let pos = x;
    r.forEach((v, ci) => { text(s, v, pos + 0.13, yy + 0.05, widths[ci] - 0.26, rowHeight - 0.1, size, ci === 0 ? C.ink : C.mute, ci === 0); pos += widths[ci]; });
  });
}

// 01: Cover.
{
  const s = slide('PERSONAL CONTRIBUTION', '');
  text(s, '智慧医养大数据公共服务平台医生服务系统', 0.65, 1.0, 11.9, 0.45, 18, C.mute);
  text(s, '临床 AI 助手\n个人工作汇报', 0.65, 1.84, 11.9, 1.75, 39, C.ink, true);
  text(s, 'RAG 知识库  /  DDInter 医嘱核查  /  后端与算法集成', 0.68, 3.88, 11.8, 0.44, 20, C.teal);
  line(s, 0.65, 4.75, 11.95);
  metric(s, '4', '临床 AI 工作流', 0.68, 5.1, 2.8);
  metric(s, '3', 'RAG 检索范围', 3.7, 5.1, 2.8, C.blue);
  metric(s, '295,184', 'DDInter 相互作用对', 6.7, 5.1, 3.1);
  metric(s, '48', 'AI / RAG 核心测试', 10.1, 5.1, 2.6, C.amber);
  text(s, '2026.09.28  |  仅统计个人负责范围', 0.68, 6.5, 11.8, 0.26, 12, C.mute);
  note(s, '开场：我的主要工作是临床 AI 助手、RAG 知识库和 DDInter 医嘱核查的后端与算法集成。四个工作流包括病历草稿、问诊摘要、相似病例和医嘱核查。295184 是当前本地数据快照规模；48 是本轮优化后核心测试项数，总后端测试为61。未代填汇报人姓名。');
}

// 02: Ownership and stack.
{
  const s = slide('01 / 工作范围', '我的职责：后端服务、知识工程与评测', '定位：减少重复整理与资料检索，让医生保留最终判断和复核。');
  block(s, '独立负责方向', '临床 AI 四项业务能力\nRAG 导入、检索与回答\nDDInter 数据接入与查询\n安全校验与量化评测', 0.55, 2.12, 3.9, 2.55);
  block(s, '接口与协作', '医生工作台接口对接\n病历草稿编辑与提交衔接\n权限校验、审计记录衔接\nGitHub 提交与合并联调', 4.68, 2.12, 3.9, 2.55, C.blue);
  block(s, '不计为个人独立成果', '组员负责的登录注册界面\n患者管理业务模块\n图文问诊业务界面\n整体前端设计', 8.81, 2.12, 3.95, 2.55, C.amber);
  text(s, '核心技术栈', 0.56, 5.02, 12, 0.35, 18, C.ink, true);
  text(s, 'Node.js + TypeScript + Express 5  |  MySQL / MariaDB  |  火山方舟\nDoubao Seed 2.0 Lite + 1024 维 Embedding  |  Vue 3 接口适配  |  Node Test Runner', 0.56, 5.55, 12, 0.85, 17, C.mute);
  note(s, '个人贡献边界是本报告的前提。现有身份系统与患者管理由团队协作完成，本报告不把组员成果全部归为个人开发。我的核心工作是服务、知识数据、算法流程及工程验证。对应 backend/src/ai、backend/src/rag 和相关 routes。');
}

// 03: Architecture.
{
  const s = slide('02 / 技术架构', '生成式 AI 与确定性核查分开设计', '文本生成依托原始记录和检索证据；相互作用查询依托药物知识索引。');
  rect(s, 0.55, 2.14, 12.2, 0.65, C.ink);
  text(s, '医生工作台  →  JWT / 医生角色校验  →  临床 AI 服务  →  审计与医生复核', 0.77, 2.14, 11.77, 0.65, 20, C.paper, true, { align: 'center' });
  const xs = [0.55, 3.68, 6.81, 9.94];
  const data = [
    ['病历草稿 / 摘要', '服务器模拟问诊\n模型整理 + 内容校验\n异常回退原始记录', C.teal],
    ['RAG 知识问答', '文档与向量\n范围过滤 + 混合检索\n来源聚合 + 引用回答', C.blue],
    ['相似病历', 'Synthea 模拟病例\n病例文档聚合\n关联指南独立展示', C.teal],
    ['医嘱安全核查', '成分解析与过敏规则\nDDInter 药物对索引\n可替换产品规则接口', C.amber],
  ];
  data.forEach((d, i) => block(s, d[0], d[1], xs[i], 3.15, 2.81, 2.45, d[2]));
  rect(s, 0.55, 5.94, 12.2, 0.63, C.pale);
  text(s, 'MariaDB：知识文档 / 文本片段 / 向量 / 导入检查点 / 审计记录    +    本地 DDInter 索引', 0.76, 5.94, 11.8, 0.63, 17, C.teal, true, { align: 'center' });
  note(s, 'RAG 并不承担自由推断所有用药风险的任务。医嘱核查使用结构化数据和固定知识源，便于重复验证。向量存储在 MariaDB，应用层执行余弦相似度扫描，没有部署专用向量数据库。');
}

// 04: Doctor workflows.
{
  const s = slide('03 / 业务交付', '四项医生工作流与四个临床 AI 接口', '输出可编辑、可追溯的辅助结果，不自动形成诊断或处方。');
  const data = [
    ['01  病历草稿', '将问诊记录整理为可编辑草稿\n保留来源，待医生诊断与复核', '/api/ai/record-draft', C.teal],
    ['02  问诊摘要', '归纳已记录内容和后续重点\n区分患者陈述与诊断结论', '/api/ai/consultation-summary', C.blue],
    ['03  相似病历', '最多 5 个模拟病例 + 2 条指南\n相似度用于排序，不是诊断概率', '/api/ai/similar-cases', C.blue],
    ['04  医嘱核查', '过敏警告与药物相互作用\n呈现已核查项和剩余信息缺口', '/api/ai/order-check', C.amber],
  ];
  data.forEach((d, i) => {
    const x = i % 2 ? 6.78 : 0.55, y = i < 2 ? 2.13 : 4.43;
    block(s, d[0], d[1], x, y, 5.97, 2.08, d[3]);
    text(s, `POST ${d[2]}`, x + 0.23, y + 1.64, 5.5, 0.26, 11, C.mute);
  });
  note(s, '对应 backend/src/routes/ai.ts。病历草稿和摘要不是开放式任意真实患者模型生成：仅三份服务器模拟问诊允许模型路径。相似病例只返回标记为 synthetic 的病例，且每个文档保留最佳片段。');
}

// 05: RAG ingestion.
{
  const s = slide('04 / RAG 建设', '从资料导入到带来源的回答', '完成解析、分块、向量化、持久化、检索和引用输出的完整链路。');
  const items = [ ['01', '文档解析', 'PPTX / PDF\nDOCX / FHIR JSON'], ['02', '结构化分块', '按页、幻灯片、临床结构\n配置上限 1400 字符'], ['03', '向量与存储', '1024 维 Embedding\n文本及元数据进入 MariaDB'], ['04', '检索与生成', '范围过滤 + 混合排序\nTop 8 来源 + 引用回答'] ];
  items.forEach((d, i) => {
    const x = 0.55 + i * 3.13;
    text(s, d[0], x, 2.2, 2.83, 0.55, 29, i % 2 ? C.blue : C.teal, true);
    text(s, d[1], x, 2.96, 2.83, 0.38, 20, C.ink, true);
    text(s, d[2], x, 3.55, 2.83, 0.91, 16, C.mute, false, { valign: 'top' });
    if (i < 3) text(s, '→', x + 2.78, 2.9, 0.31, 0.45, 20, C.gray);
  });
  line(s, 0.55, 4.75, 12.2);
  metric(s, '12', '历史评测文档', 0.7, 5.08, 2.7);
  metric(s, '416', '历史评测文本片段', 3.74, 5.08, 2.8, C.blue);
  text(s, '数据组成', 6.85, 5.03, 5.5, 0.38, 18, C.ink, true);
  text(s, '项目需求资料 + 1 份 CDC STEADI 指南\n8 份 Synthea 老年模拟病例（年龄 ≥ 65 岁）', 6.85, 5.6, 5.75, 0.81, 17, C.mute);
  note(s, '12份文档和416片段来自2026-09-27保存的评测记录，本次未重新查库。Synthea为模拟患者数据，不是医院真实病例。FHIR解析排除姓名、联系方式、地址、标识符和精确出生日期。文档元数据保留来源URL、许可、发布者、分类和synthetic标记。依据 backend/src/rag/ingest.ts、fhir.ts、docs/rag-evaluation.md。');
}

// 06: Retrieval algorithm.
{
  const s = slide('05 / 检索优化', '混合排序、来源聚合与范围隔离', '优化排序质量，并避免项目文档、指南和不同病例互相混入。');
  rect(s, 0.55, 2.1, 12.2, 0.7, C.ink);
  text(s, 'Score = 0.85 × 语义相似度 + 0.15 × 词项覆盖 + 编号匹配加分', 0.8, 2.1, 11.7, 0.7, 20, C.paper, true, { align: 'center' });
  table(s, ['检索范围', '过滤逻辑', '作用'], [
    ['project', '只检索项目要求与设计资料', '避免把需求文档当临床证据'],
    ['clinical-guideline', '只检索已纳入指南', '限定回答证据来源'],
    ['synthetic-patient', '指定一份病例 + 相关指南', '避免混入其他患者记录'],
  ], 0.55, 3.18, [3.0, 4.5, 4.7], 0.63, 16);
  text(s, '来源位置聚合', 0.55, 5.78, 2.3, 0.38, 19, C.teal, true);
  text(s, '同页多个片段  →  合并为一个来源结果  →  减少重复占用 Top 8 名额', 2.97, 5.66, 9.75, 0.64, 19, C.ink);
  text(s, '说明：评分是人工设定的排序策略，不是模型置信度；编号匹配加分为 0.2。', 0.56, 6.49, 12, 0.25, 11, C.mute);
  note(s, '检索代码位于 backend/src/rag/service.ts。语义分数为余弦相似度，词项覆盖不是BM25。按documentId与location聚合，组内取最佳语义匹配并组合文本。应用层扫描适合当前小规模语料，尚未验证大规模ANN或生产吞吐量。');
}

// 07: Guardrails and RPM.
{
  const s = slide('06 / 模型工程', '模型接入、输出校验与限流降级', '当前：Doubao Seed 2.0 Lite + Doubao Embedding Vision（1024 维）。');
  block(s, '模拟数据准入', '仅 3 份服务器模拟问诊\n逐项比对问诊文本与标识\n任意真实患者文本不开放\n自由文本改变则走本地路径', 0.55, 2.15, 3.9, 3.26);
  block(s, '有证据才输出', '校验来源引用和数值\n模型异常回退记录整理\nRAG 无效引用降级为证据\n临床诊断 / 剂量请求拒答', 4.68, 2.15, 3.9, 3.26, C.blue);
  block(s, 'RPM 与导入恢复', '嵌入请求默认间隔 1200ms\n保存导入检查点，支持恢复\n新版本完成前保留旧文档\n生成 429 → retrieval-only', 8.81, 2.15, 3.95, 3.26, C.amber);
  rect(s, 0.55, 5.83, 12.2, 0.76, C.yellow);
  text(s, '已缓解生成限流对展示的影响，但没有消除云服务配额；查询向量仍依赖嵌入服务。', 0.8, 5.83, 11.7, 0.76, 17, C.amber, true);
  note(s, '病历模型仅接收服务器自己的模拟问诊文本，医生自由文本笔记不能进入该生成路径。RAG对引用编号进行校验，但不是逐句语义蕴含检验。仅生成模型429会在RAG中降级，其他异常或embedding失败不是全部离线兜底。代码见synthetic-narrative.ts、rag/service.ts、rag/ingest.ts。');
}

// 08: DDInter snapshot and editable chart.
{
  const s = slide('07 / DDInter', '将相互作用数据变成可查询的本地索引', '固定上游提交 + SHA-256 校验；记录通用药名、风险等级和机制。');
  metric(s, '2,283', '药物记录', 0.55, 2.16, 3.55);
  metric(s, '295,184', '唯一相互作用药物对', 4.7, 2.16, 3.7, C.blue);
  metric(s, '8,234', '机制条目', 9.04, 2.16, 3.4, C.amber);
  s.addChart(ppt.ChartType.bar, [{ name: '药物对数量', labels: ['Moderate', 'Major', 'Unknown', 'Minor'], values: [189439, 50983, 42415, 12347] }], {
    x: 0.55, y: 3.66, w: 7.12, h: 2.86, barDir: 'bar', showLegend: false, showValue: true,
    chartColors: [C.teal], showCatName: false, showTitle: false, catAxisLabelFontFace: 'Microsoft YaHei', catAxisLabelFontSize: 12,
    valAxisLabelFontSize: 10, valAxisMinVal: 0, valAxisMaxVal: 220000, valAxisMajorUnit: 100000,
    showBorder: false, showShadow: false, showMarker: false, dataLabelPosition: 'outEnd', dataLabelColor: C.ink,
    catAxisLineShow: false, valAxisLineShow: false, showCatName: false, valGridLine: { color: C.line, width: 0.5 },
  });
  text(s, '标准化药名 → 唯一 ID\n无方向药物对键 → Map 查询', 8.03, 3.84, 4.6, 0.98, 20, C.ink, true);
  text(s, 'A + B 与 B + A 结果一致\n歧义名称不猜测\nUnknown 与缺失记录不判安全', 8.03, 5.08, 4.64, 1.14, 17, C.mute);
  note(s, '数据统计来自当前本地backend/data/ddinter/interactions.json，共2283药物、295184唯一药物对和8234机制。Moderate189439、Major50983、Unknown42415、Minor12347。这是固定快照规模，不是自主医学标注，也不是官网最新总量。参考OpenMRS打包项目https://github.com/pbiondich/openmrs-ddi-knowledge-base，固定提交7e2bd2c245bd33550ca1b14951d6955767026775。DDInter数据非商业许可：https://ddinter.scbdd.com/terms/。本项目没有接入疾病表或推断链。');
}

// 09: Safety capabilities and examples.
{
  const s = slide('08 / 医嘱核查', '分层检查风险，同时保留未完成项目', '“没有找到匹配风险”不等于“处方安全”；DDInter Major 不自动等于绝对禁忌。');
  table(s, ['核查环节', '实现状态', '能力边界'], [
    ['成分解析与直接过敏', '已实现', '中英文已知别名；不猜测复方与歧义药名'],
    ['阿莫西林 / 青霉素提示', '有限规则', '有来源的初步类别提示，非全药物交叉过敏'],
    ['药物相互作用', '已接入 DDInter', '须确认在用药清单；未收录仍提示缺口'],
    ['剂量 / eGFR / 老年标准', '接口与扩展点', '缺审核产品规则；完整 Beers 校验未实现'],
  ], 0.55, 2.12, [3.25, 2.3, 6.65], 0.64, 15);
  block(s, '示例 A：过敏警告', 'Penicillin 过敏 + Amoxicillin\n触发初步青霉素类过敏警告', 0.55, 5.28, 5.97, 1.45, C.red);
  block(s, '示例 B：相互作用', 'Metoprolol + 已确认在用 Verapamil\nDDInter 返回 Major 等级及机制', 6.78, 5.28, 5.97, 1.45, C.amber);
  note(s, '规则引擎返回Alerts、Documented Allergies、Checked和Not Checked。不能为了展示绿色安全状态隐藏数据缺口。Metoprolol与Verapamil例子已通过本地索引查询核实。Major是数据库风险等级，不意味着任何情况下均绝对禁用。eGFR、途径、日剂量和年龄匹配的规则契约已经建立，但没有药师审核的大陆产品目录，Beers也未完整实现。');
}

// 10: Retrieval results.
{
  const s = slide('09 / 客观评测', '历史检索结果：精度接近当前固定标注上限', '2026.09.27 | 12 份文档 / 416 片段 | 29 个检索问题 + 1 个范围外问题');
  s.addChart(ppt.ChartType.bar, [
    { name: '片段基线', labels: ['Precision@8', 'Recall@8', 'MRR@8', 'nDCG@8'], values: [23.7, 92.5, 92.2, 87.0] },
    { name: '范围过滤与来源聚合', labels: ['Precision@8', 'Recall@8', 'MRR@8', 'nDCG@8'], values: [25.4, 98.3, 96.0, 92.2] },
  ], {
    x: 0.55, y: 2.24, w: 8.04, h: 3.93, barDir: 'col', catAxisLabelFontSize: 13, valAxisLabelFontSize: 11,
    chartColors: [C.gray, C.teal], showLegend: true, legendPos: 'b', legendFontFace: 'Microsoft YaHei', legendFontSize: 11,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.0"%"', dataLabelColor: C.ink,
    valAxisMinVal: 0, valAxisMaxVal: 110, valAxisMajorUnit: 25, valAxisNumFmt: '0"%"', showTitle: false,
    catAxisLineShow: false, valAxisLineShow: false, valGridLine: { color: C.line, width: 0.5 },
  });
  metric(s, '+5.8 pp', 'Recall@8 提升', 9.03, 2.36, 3.3);
  text(s, '检索延迟\nP50 650ms\nP95 1532ms', 9.04, 3.96, 3.43, 1.14, 19, C.ink);
  text(s, 'Precision@8 25.4%\n标注下理论上限 25.9%', 9.04, 5.46, 3.45, 0.81, 16, C.amber, true);
  text(s, '29 题共 60 个相关来源，固定分母为 29 × 8。新增 P@1 / P@3 与实际返回精度，待全量评测。', 0.55, 6.63, 12.2, 0.26, 11, C.mute);
  note(s, '来源backend/docs/rag-evaluation.md。Precision@8上限为60/(29*8)=25.86%，因为每题仅标注1到3个来源，即使返回不足8也按8计算。25.4%不表示回答准确率，也不能独立证明检索差。Recall@8是标注相关来源被找回比例，MRR是首个相关来源倒数排序，nDCG是排名质量。本轮新增MiniSearch全文重排、排名融合和动态证据选择候选，以及P@1/P@3/实际返回精度/空结果率。数据库阻塞，未取得新全量结果；默认策略未改变。');
}

// 11: Generation evaluation vs tests.
{
  const s = slide('10 / 验证口径', '生成评测与软件测试分别报告', '区分小样本历史模型评测、当前代码回归和真实临床验证。');
  text(s, '历史生成评测', 0.55, 2.15, 6.7, 0.4, 21, C.teal, true);
  text(s, '2026.09.24，8 个检索问题 + 1 个范围外问题', 0.55, 2.71, 7.25, 0.34, 14, C.mute);
  table(s, ['指标', '历史结果'], [
    ['预定义概念覆盖', '92.2%'],
    ['引用编号有效 / 有引用', '100% / 100%'],
    ['回答与拒答决策', '9 / 9'],
    ['生成延迟 P50 / P95', '8.2s / 12.1s'],
  ], 0.55, 3.27, [4.82, 2.45], 0.55, 16);
  rect(s, 8.19, 2.17, 4.56, 3.69, C.pale);
  metric(s, '61 / 61', '本轮后端回归通过', 8.53, 2.58, 3.9);
  metric(s, '48', '其中 AI / RAG 核心测试', 8.53, 4.16, 3.9, C.blue);
  text(s, '引用编号有效不证明每句医学内容正确。扩展语料未重新做生成评测。\n单元测试不等于数据库端到端验证，也不等于临床安全验证。', 0.56, 6.12, 12.1, 0.65, 15, C.amber);
  note(s, '历史生成数据来自rag-evaluation.md。概念覆盖是确定性词组匹配，不是语义正确率。仅一个拒答案例，无统计意义上的临床安全结论。本轮构建成功、61项测试通过。其中核心48项：原35项，加重排6项、指标5项、服务2项。61包含团队其他依赖模块，不全归为个人独立开发。');
}

// 12: Engineering delivery.
{
  const s = slide('11 / 工程交付', '不只调用模型 API，还完成可验证的服务链路', '交付代码、数据脚本、测试和文档，支持组内联调与持续改进。');
  table(s, ['交付项', '完成内容'], [
    ['7 个接口', '4 个临床 AI 接口 + 文档列表 / 导入状态 / RAG 问答'],
    ['数据与模型链路', '4 类导入格式、1024 维向量、3 类范围、固定 DDInter 快照'],
    ['可靠性措施', '导入检查点、旧版本保留、生成限流降级、无效引用回退'],
    ['审计与版本', 'AI 操作来源 / 生成方式 / 风险类别记录；GitHub 提交与合并'],
    ['交付文档', '评测定义、数据来源目录、药品规则契约、临床能力边界'],
  ], 0.55, 2.17, [3.1, 9.1], 0.61, 16);
  rect(s, 0.55, 6.0, 12.2, 0.68, C.yellow);
  text(s, '当前演示阻塞：本机 MariaDB 拒绝 localhost 连接；后端启动与端到端演示仍待恢复。', 0.78, 6.0, 11.73, 0.68, 16, C.amber, true);
  note(s, '此页强调工程成果而非临床部署。当前前端已恢复，但数据库拒绝本机连接，因此报告不能称已通过全部现场演示。后续应修复数据库权限后实际验证登录、问答、模拟草稿、相似病例和DDInter核查。资料依据backend/README.md以及本次服务启动日志。');
}

// 13: Close and roadmap.
{
  const s = slide('12 / 总结与下一步', '形成有来源、有测试、有明确边界的课程设计实现', '个人贡献集中于临床 AI、RAG、DDInter 和后端算法集成。');
  rect(s, 0.55, 2.18, 12.2, 0.97, C.ink);
  text(s, '结构化辅助工作流  +  可追溯知识检索  +  可重复医嘱风险查询', 0.86, 2.18, 11.59, 0.97, 24, C.paper, true, { align: 'center' });
  block(s, '优先：恢复演示链路', '修复数据库本机连接\n完成登录与 AI 端到端检查\n确认现场演示流程', 0.55, 3.62, 3.9, 2.35);
  block(s, '继续：验证检索优化', '候选全文重排与动态证据选择\n全量对照 P@1 / P@3 与召回\n通过人工复核后再切换默认', 4.68, 3.62, 3.9, 2.35, C.blue);
  block(s, '深化：补齐药学知识', '接入审核过的产品规则\n补齐交叉过敏、eGFR 与 Beers\n保留医生复核和知识缺口提示', 8.81, 3.62, 3.95, 2.35, C.amber);
  text(s, '核验依据：项目代码与测试 / rag-evaluation.md / 本地 DDInter 索引统计\n数据来源：github.com/synthetichealth/synthea  |  ddinter.scbdd.com/terms/', 0.56, 6.34, 12, 0.52, 11, C.mute);
  note(s, '结尾：我不把未实现的Beers和全覆盖交叉过敏包装为已完成，也不把检索率写成诊断准确率。目前形成课程设计技术实现，不是获验证的临床处方系统。完整报告位于reports/personal-work-report.md，历史指标位于backend/docs/rag-evaluation.md，DDInter使用说明位于backend/docs/medication-knowledge.md。非商业数据条款https://ddinter.scbdd.com/terms/；打包项目https://github.com/pbiondich/openmrs-ddi-knowledge-base；Synthea项目https://github.com/synthetichealth/synthea。');
}

const invalid = bounds.filter(b => b.x < 0 || b.y < 0 || b.x + b.w > W + 0.01 || b.y + b.h > H + 0.01);
if (invalid.length) throw new Error(`Out-of-canvas text boxes: ${JSON.stringify(invalid)}`);
const destination = path.join(__dirname, '个人工作汇报-临床AI与RAG-检索优化版.pptx');
ppt.writeFile({ fileName: destination }).then(() => console.log(JSON.stringify({ file: destination, slides: ppt._slides.length, checkedTextBoxes: bounds.length })));
