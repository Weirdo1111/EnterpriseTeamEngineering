const path = require('node:path');
const os = require('node:os');
const PptxGenJS = require(path.join(os.tmpdir(), 'qiye-pptx-tools/node_modules/pptxgenjs'));

const ppt = new PptxGenJS();
ppt.layout = 'LAYOUT_WIDE';
ppt.author = 'Project contributor';
ppt.company = 'EnterpriseTeamEngineering';
ppt.title = '临床 AI 助手个人工作汇报（6页精简版）';
ppt.subject = '个人职责、技术架构、RAG、DDInter 与检索评测';
ppt.lang = 'zh-CN';
ppt.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei', lang: 'zh-CN' };

const C = { bg: 'F8FAFB', white: 'FFFFFF', ink: '203038', muted: '62727A', teal: '087E80', pale: 'E6F2F1', blue: '487B9C', amber: 'B17A12', yellow: 'FFF4DD', red: 'B64457', line: 'DDE5E8', gray: 'A8B5BD' };
const bounds = [];
const box = (s, x, y, w, h, fill, border = fill) => s.addShape(ppt.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: border, width: 0.6 } });
const text = (s, value, x, y, w, h, size = 18, color = C.ink, bold = false, extra = {}) => {
  bounds.push({ slide: ppt._slides.length, x, y, w, h });
  s.addText(value, { x, y, w, h, fontFace: 'Microsoft YaHei', fontSize: size, color, bold, margin: 0, valign: 'mid', fit: 'shrink', ...extra });
};
const rule = (s, x, y, w) => s.addShape(ppt.ShapeType.line, { x, y, w, h: 0, line: { color: C.line, width: 1 } });
const stat = (s, value, label, x, y, w, color = C.teal) => {
  text(s, value, x, y, w, 0.62, 33, color, true);
  text(s, label, x, y + 0.7, w, 0.42, 14, C.muted);
};
function page(section, title, subtitle = '') {
  const s = ppt.addSlide();
  s.background = { color: C.bg };
  box(s, 0, 0, 0.12, 7.5, C.teal);
  text(s, section, 0.55, 0.33, 12.2, 0.3, 11, C.teal, true);
  if (title) text(s, title, 0.55, 0.85, 12.2, 0.6, 29, C.ink, true);
  if (subtitle) text(s, subtitle, 0.56, 1.54, 12.1, 0.4, 14, C.muted);
  rule(s, 0.55, 7.02, 12.2);
  text(s, '个人工作汇报  /  临床 AI 与知识工程  /  非商业课程设计', 0.55, 7.12, 10.8, 0.2, 9, C.muted);
  text(s, `${String(ppt._slides.length).padStart(2, '0')} / 06`, 11.65, 7.09, 1.1, 0.25, 10, C.muted, false, { align: 'right' });
  return s;
}
function panel(s, title, body, x, y, w, h, color = C.teal, size = 16) {
  box(s, x, y, w, h, C.white, C.line);
  box(s, x, y, 0.05, h, color);
  text(s, title, x + 0.22, y + 0.18, w - 0.44, 0.4, 19, color, true);
  text(s, body, x + 0.22, y + 0.78, w - 0.44, h - 0.96, size, C.ink, false, { valign: 'top', paraSpaceAfterPt: 6 });
}

// 01: Personal scope and cover.
{
  const s = page('个人工作概览', '');
  text(s, '智慧医养大数据公共服务平台医生服务系统', 0.65, 1.03, 11.9, 0.46, 18, C.muted);
  text(s, '临床 AI 助手\n个人工作汇报', 0.65, 1.91, 11.9, 1.7, 39, C.ink, true);
  text(s, '知识库检索  /  DDInter 医嘱核查  /  后端与模型集成', 0.68, 3.91, 11.8, 0.44, 20, C.teal);
  rule(s, 0.65, 4.79, 11.95);
  stat(s, '4', '临床 AI 工作流', 0.68, 5.11, 2.9);
  stat(s, '17', '已入库知识文档', 3.7, 5.11, 2.9, C.blue);
  stat(s, '1024', '文本向量维度', 6.73, 5.11, 2.9, C.amber);
  stat(s, '295,184', 'DDInter 相互作用对', 9.75, 5.11, 3.0);
  text(s, '2026.09.28  |  仅统计个人负责范围，不将组员业务模块列为独立成果', 0.68, 6.54, 11.8, 0.26, 12, C.muted);
  s.addNotes('我的主要工作是临床 AI 助手、知识库检索与 DDInter 医嘱核查的后端和算法集成。四项工作流为病历草稿、问诊摘要、相似病历和医嘱核查，现有网页没有独立的知识库问答入口。本报告不把后台预留能力当作医生端已交付功能。2026-09-28本地验证记录：17份文档、848片段、1024维向量。295184为本地DDInter固定快照的唯一药物对数量，不是临床准确率。');
}

// 02: Scope, stack, and architecture.
{
  const s = page('01 / 职责与架构', '个人职责：把模型与知识接入医生工作流', '负责临床 AI 服务、知识数据、检索算法与接口衔接；复用团队身份和患者管理模块。');
  panel(s, '我的工作范围', '临床 AI 四项业务接口\n知识文档导入、检索与溯源\nDDInter 数据解析与索引\n医生工作台接口适配与联调', 0.55, 2.12, 4.03, 2.48);
  panel(s, '核心技术栈', 'Node.js + TypeScript + Express 5\nMySQL / MariaDB + mysql2\n火山方舟：Seed 2.0 Lite + Embedding\nVue 3 / Element Plus 接口适配', 4.82, 2.12, 7.93, 2.48, C.blue, 17);
  box(s, 0.55, 4.91, 12.2, 0.65, C.ink);
  text(s, '医生工作台  →  身份与角色校验  →  临床 AI 服务  →  来源展示与医生复核', 0.76, 4.91, 11.78, 0.65, 20, C.white, true, { align: 'center' });
  text(s, '生成式路径', 0.67, 5.95, 2.0, 0.33, 17, C.teal, true);
  text(s, '模拟问诊原始记录 → 模型整理 → 来源与数值校验', 2.8, 5.87, 9.65, 0.5, 18);
  text(s, '确定性路径', 0.67, 6.48, 2.0, 0.33, 17, C.amber, true);
  text(s, '药品解析 / 过敏规则 / DDInter → 结构化风险提示', 2.8, 6.4, 9.65, 0.5, 18);
  s.addNotes('架构上分离问诊文本生成、知识检索与药物安全判断。草稿和摘要使用符合准入条件的原始模拟问诊，不声称已接入指南增强生成。相似病历调用嵌入模型，并返回模拟病例和相关指南片段，没有调用聊天模型生成临床比较。医嘱核查使用结构化规则与DDInter，不通过大模型猜测相互作用。向量存于MariaDB，由应用层计算相似度，没有部署专用向量数据库。当前模型标识为doubao-seed-2-0-lite-260428与doubao-embedding-vision-251215。登录注册、患者管理和图文问诊业务界面为团队协作，不全部计为我的独立成果。');
}

// 03: Four doctor-facing workflows and model guardrails.
{
  const s = page('02 / 临床 AI 功能', '四项工作流：减少整理与查找，保留医生决策', '对应 4 个 POST 接口；输出辅助结果，不自动形成诊断或处方。');
  const items = [
    ['01  病历草稿', '将已有问诊整理为可编辑草稿\n保留来源，待医生诊断与复核', '/api/ai/record-draft', C.teal],
    ['02  问诊摘要', '归纳记录与后续重点事项\n区分患者陈述和诊断结论', '/api/ai/consultation-summary', C.blue],
    ['03  相似病历', '最多 5 个模拟病例 + 2 条相关指南\n相似度仅用于排序，不是诊断概率', '/api/ai/similar-cases', C.blue],
    ['04  医嘱核查', '过敏提示与药物相互作用查询\n显示已核查项及未完成项目', '/api/ai/order-check', C.amber],
  ];
  items.forEach((d, i) => {
    const x = i % 2 ? 6.78 : 0.55, y = i < 2 ? 2.12 : 4.18;
    panel(s, d[0], d[1], x, y, 5.97, 1.88, d[3]);
    text(s, `POST ${d[2]}`, x + 0.22, y + 1.54, 5.52, 0.24, 11, C.muted);
  });
  text(s, '模型准入：仅 3 份服务器模拟问诊；引用、数值或模型响应异常时回退原始记录整理。', 0.57, 6.4, 12.15, 0.36, 14, C.muted);
  s.addNotes('病历草稿和摘要仅针对三份逐项匹配服务器固定资料的模拟问诊开放模型生成。不能把任意浏览器提交的真实患者文本发送给模型。引用和数值校验失败或服务异常时，退回已有记录整理。草稿需要医生补充诊断与复核才能提交。相似病历仅检索标记为synthetic的Synthea记录，每个文档保留最高分的代表片段；它不是医院真实病例或临床推荐依据。接口见backend/src/routes/ai.ts。');
}

// 04: Knowledge ingestion and retrieval in the existing Similar Records workflow.
{
  const s = page('03 / 知识库与检索', '知识库用于相似病历与相关指南检索', '已落地 RAG 的知识准备与检索环节；页面返回原文片段与来源，不生成知识库回答。');
  const steps = [
    ['01  解析与分块', 'PPTX / PDF / DOCX / FHIR JSON\n按页面或临床结构分块'],
    ['02  向量与存储', '1024 维文本向量\n片段、来源及元数据进入 MariaDB'],
    ['03  查询与溯源', '查询嵌入 + 余弦排序 + 文档去重\n指南词项筛选，保留页码与链接'],
  ];
  steps.forEach((d, i) => {
    const x = 0.55 + i * 4.15;
    panel(s, d[0], d[1], x, 2.12, 3.89, 1.87, i === 1 ? C.blue : C.teal, 15);
    if (i < 2) text(s, '→', x + 3.9, 2.63, 0.23, 0.44, 20, C.gray);
  });
  box(s, 0.55, 4.22, 12.2, 0.53, C.ink);
  text(s, 'Similar Records  →  最多 5 个模拟病例  +  2 条 Related Guidance 指南片段', 0.78, 4.22, 11.72, 0.53, 17, C.white, true, { align: 'center' });
  stat(s, '17 / 848', '当前知识文档 / 片段', 0.6, 5.02, 3.7);
  text(s, '3 份项目资料 + 6 份指南类资料\n8 份 Synthea 老年模拟病例', 0.6, 6.22, 3.75, 0.5, 12, C.muted, false, { valign: 'top' });
  text(s, '来源管理', 4.55, 5.02, 3.55, 0.33, 18, C.teal, true);
  text(s, '国家卫健委：饮食与随访资料\nWHO：高血压、老年整合照护\nCDC STEADI：跌倒预防', 4.55, 5.52, 3.71, 1.04, 15, C.muted, false, { valign: 'top' });
  text(s, '可靠性控制', 8.78, 5.02, 3.6, 0.33, 18, C.blue, true);
  text(s, '导入检查点与失败恢复\n中英文检索与患者资料隔离\n保留发布者、页码、版本和许可', 8.78, 5.52, 3.75, 1.04, 15, C.muted, false, { valign: 'top' });
  s.addNotes('本页仅报告现有医生端的知识库检索，不将其称为完整的检索增强生成问答。Similar Records使用rankSimilarCases按余弦相似度排序，每份模拟病例保留最高分片段，最多5个病例；relatedGuidance先筛选中英文词项匹配的指南，再按余弦相似度排序并按文档去重，最多2条指南。查询向量调用嵌入服务，结果不经聊天模型生成。知识库2026-09-28本地统计：项目资料3份272片段、指南类资料6份497片段、模拟病例8份79片段，共17份848片段。五份新资料为国家卫健委2023高血压饮食指导、2023糖尿病饮食指导、2024慢阻肺健康服务规范、WHO2021高血压药物治疗指南和ICOPE第二版；CDC STEADI为原有资料。指南类资料并非全部都是完整诊疗指南，也不能补齐药学规则。新增PDF按物理页分块，保留短标题，单块上限3200字符；扫描件文本不足不入库。WHO资料限非商业许可，卫健委资料不宣称开放再分发授权。数据与来源见backend/docs/clinical-guidance-sources.md及dataset-catalog.json。');
}

// 05: DDInter data and order-check capability boundaries.
{
  const s = page('04 / DDInter 与医嘱核查', '结构化药物知识，支持可重复的风险查询', '固定上游版本 + SHA-256 校验；按药物对返回等级和机制，不由模型自由推断。');
  stat(s, '2,283', '药物记录', 0.55, 2.12, 3.6);
  stat(s, '295,184', '唯一相互作用药物对', 4.65, 2.12, 3.75, C.blue);
  stat(s, '8,234', '机制条目', 9.03, 2.12, 3.6, C.amber);
  s.addChart(ppt.ChartType.bar, [{ name: '药物对数量', labels: ['Moderate', 'Major', 'Unknown', 'Minor'], values: [189439, 50983, 42415, 12347] }], {
    x: 0.55, y: 3.55, w: 6.23, h: 2.46, barDir: 'bar', showLegend: false, showValue: true,
    chartColors: [C.teal], catAxisLabelFontFace: 'Microsoft YaHei', catAxisLabelFontSize: 11,
    valAxisLabelFontSize: 9, valAxisMinVal: 0, valAxisMaxVal: 225000, valAxisMajorUnit: 100000,
    showBorder: false, showShadow: false, dataLabelPosition: 'outEnd', dataLabelColor: C.ink,
    catAxisLineShow: false, valAxisLineShow: false, valGridLine: { color: C.line, width: 0.5 },
  });
  text(s, '已实现核查', 7.11, 3.66, 5.35, 0.37, 19, C.teal, true);
  text(s, '成分解析 → 过敏匹配 → DDInter 查询\n确认在用药清单；未知记录保留缺口', 7.11, 4.23, 5.35, 0.79, 16);
  text(s, '典型示例', 7.11, 5.21, 5.35, 0.33, 18, C.amber, true);
  text(s, 'Penicillin 过敏 + Amoxicillin：初步过敏提示\nMetoprolol + Verapamil：Major 相互作用', 7.11, 5.65, 5.42, 0.75, 14, C.muted);
  box(s, 0.55, 6.51, 12.2, 0.34, C.yellow);
  text(s, '边界：完整交叉过敏、产品级 eGFR 剂量与 Beers 尚未补齐；Major 不自动等于绝对禁忌。', 0.73, 6.51, 11.84, 0.34, 12, C.amber);
  s.addNotes('数量来自当前本地DDInter索引统计，不是官网最新规模或自主标注：2283种药物、295184个唯一药物对、8234机制。风险等级数量为Moderate189439、Major50983、Unknown42415、Minor12347。标准化药名映射唯一ID，使用无方向药物对Map查询；A+B与B+A一致，歧义药名不猜测。当前只接入药物对与机制，不使用打包项目的疾病表和推断链。青霉素与阿莫西林是有限来源规则，不是全药物分类器。剂量规则接口已存在，但缺少经审核的中国产品规则，完整Beers没有实现。未发现记录不代表安全。DDInter使用条款https://ddinter.scbdd.com/terms/；来源打包项目https://github.com/pbiondich/openmrs-ddi-knowledge-base，非商业课程使用。');
}

// 06: Recorded local retrieval evaluation and current delivery boundaries.
{
  const s = page('05 / 检索评测与总结', '用检索指标衡量知识服务，不夸大临床能力', '本地评测：2026.09.28 | 29 个已标注检索问题 + 1 个范围外问题 | 既有题集，模型不自评');
  s.addChart(ppt.ChartType.bar, [
    { name: '现用 source-group 检索策略', labels: ['Recall@8', 'MRR@8', 'nDCG@8'], values: [98.28, 95.69, 91.45] },
  ], {
    x: 0.55, y: 2.2, w: 7.6, h: 3.18, barDir: 'col', chartColors: [C.gray, C.teal],
    catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, showLegend: true, legendPos: 'b', legendFontFace: 'Microsoft YaHei', legendFontSize: 10,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.00"%"', dataLabelColor: C.ink,
    valAxisMinVal: 0, valAxisMaxVal: 110, valAxisMajorUnit: 25, valAxisNumFmt: '0"%"', showTitle: false,
    catAxisLineShow: false, valAxisLineShow: false, valGridLine: { color: C.line, width: 0.5 },
  });
  stat(s, '429 / 815ms', '本次检索延迟 P50 / P95', 8.71, 2.48, 3.6);
  stat(s, '5 / 5', '新指南主题检索冒烟测试通过', 8.71, 4.0, 3.6, C.blue);
  text(s, '69 项后端自动化测试通过；新主题测试仅核验来源命中，不代表临床正确率。', 0.59, 5.54, 12.1, 0.25, 12, C.muted);
  rule(s, 0.55, 5.91, 12.2);
  text(s, '个人成果', 0.59, 6.12, 1.5, 0.3, 17, C.teal, true);
  text(s, '四项辅助工作流 + 可追溯知识检索 + DDInter 本地风险查询', 2.26, 6.08, 10.1, 0.38, 17);
  text(s, '下一步', 0.59, 6.63, 1.5, 0.3, 17, C.blue, true);
  text(s, '扩展指南检索标注与药学规则；检索分数不代表诊疗正确率或处方安全率。', 2.26, 6.57, 10.1, 0.42, 14, C.muted);
  s.addNotes('2026-09-28已记录的本地验证见backend/docs/clinical-guidance-sources.md。沿用30条旧题集，其中29条有相关来源标注；source-group Recall@8为98.275862%、MRR@8为95.689655%、nDCG@8为91.447512%，P50/P95为429/815毫秒，失败案例0、范围污染0。Recall衡量相关来源召回，MRR衡量首个相关结果名次，nDCG衡量排序质量。这是后台通用检索的评测，不是Similar Records页面全部效果的专门基准，也不是临床结果指标。题集主要覆盖项目要求、跌倒与模拟病例，不能推及全部新增指南主题。5/5新主题冒烟测试验证预期文档进入前五和Related Guidance命中，并非答案正确率。69项后端自动化测试为本次已完成记录。延迟只是一次本地观测，不保证部署后性能。本页取消跨语料对比图，不宣称新指南使临床准确率提高。个人成果为四项辅助工作流、知识入库与检索溯源、DDInter结构化风险查询；完整交叉过敏、肾功能产品剂量与Beers规则仍需补齐。');
}

if (ppt._slides.length !== 6) throw new Error('The concise deck must contain exactly six slides.');
const outside = bounds.filter(b => b.x < 0 || b.y < 0 || b.x + b.w > 13.343333 || b.y + b.h > 7.51);
if (outside.length) throw new Error(`Out-of-canvas text: ${JSON.stringify(outside)}`);
const destination = path.join(__dirname, '个人工作汇报-临床AI与RAG-6页修订版.pptx');
ppt.writeFile({ fileName: destination }).then(() => console.log(JSON.stringify({ file: destination, slides: ppt._slides.length, checkedTextBoxes: bounds.length })));
