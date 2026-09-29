const path = require('node:path');
const os = require('node:os');
const PptxGenJS = require(path.join(os.tmpdir(), 'qiye-pptx-tools/node_modules/pptxgenjs'));
const withCover = process.argv.includes('--with-cover');
const slideCount = withCover ? 8 : 6;

const ppt = new PptxGenJS();
ppt.layout = 'LAYOUT_WIDE';
ppt.author = 'Project contributor';
ppt.company = 'EnterpriseTeamEngineering';
ppt.title = withCover ? 'Doctor Work Platform - Group 10' : 'Clinical AI Assistant - Personal Work Report';
ppt.subject = 'Individual contribution, architecture, knowledge retrieval, DDInter and evaluation';
ppt.lang = 'en-US';
ppt.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial', lang: 'en-US' };

const C = { bg: 'F8FAFB', white: 'FFFFFF', ink: '203038', muted: '62727A', teal: '087E80', blue: '487B9C', amber: 'B17A12', yellow: 'FFF4DD', line: 'DDE5E8', gray: 'A8B5BD' };
const bounds = [];
const box = (s, x, y, w, h, fill, border = fill) => s.addShape(ppt.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: border, width: 0.6 } });
const text = (s, value, x, y, w, h, size = 18, color = C.ink, bold = false, extra = {}) => {
  bounds.push({ slide: ppt._slides.length, x, y, w, h });
  s.addText(value, { x, y, w, h, fontFace: 'Arial', fontSize: size, color, bold, margin: 0, valign: 'mid', fit: 'shrink', lang: 'en-US', ...extra });
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
  if (title) text(s, title, 0.55, 0.85, 12.2, 0.6, 28, C.ink, true);
  if (subtitle) text(s, subtitle, 0.56, 1.54, 12.1, 0.4, 14, C.muted);
  rule(s, 0.55, 7.02, 12.2);
  text(s, 'Personal Work Report  /  Clinical AI & Knowledge Engineering  /  Non-commercial Course Project', 0.55, 7.12, 10.8, 0.2, 9, C.muted);
  text(s, `${String(ppt._slides.length).padStart(2, '0')} / ${String(slideCount).padStart(2, '0')}`, 11.65, 7.09, 1.1, 0.25, 10, C.muted, false, { align: 'right' });
  return s;
}
function panel(s, title, body, x, y, w, h, color = C.teal, size = 16) {
  box(s, x, y, w, h, C.white, C.line);
  box(s, x, y, 0.05, h, color);
  text(s, title, x + 0.22, y + 0.18, w - 0.44, 0.4, 19, color, true);
  text(s, body, x + 0.22, y + 0.78, w - 0.44, h - 0.96, size, C.ink, false, { valign: 'top', paraSpaceAfterPt: 6 });
}

if (withCover) {
  const s = ppt.addSlide();
  s.background = { color: C.bg };
  box(s, 0, 0, 0.12, 7.5, C.teal);
  text(s, 'GROUP 10', 0.8, 0.7, 11.7, 0.4, 16, C.teal, true);
  text(s, 'Doctor Work Platform', 0.8, 2.55, 11.7, 0.95, 46, C.ink, true);
  text(s, 'Clinical AI Assistant | Personal Work Report', 0.82, 3.72, 11.65, 0.5, 22, C.muted);
  rule(s, 0.82, 5.15, 11.65);
  s.addNotes('Doctor Work Platform, presented by Group 10. This section reports the individual contribution to the clinical AI assistant, knowledge retrieval, and DDInter medication risk screening.');
}

// 01: Personal contribution overview.
{
  const s = page('PERSONAL CONTRIBUTION', '');
  text(s, 'Doctor Work Platform | Smart Healthcare & Elderly Care Platform', 0.65, 1.03, 11.9, 0.46, 18, C.muted);
  text(s, 'Clinical AI Assistant\nPersonal Work Report', 0.65, 1.91, 11.9, 1.7, 39, C.ink, true);
  text(s, 'Knowledge Retrieval  /  DDInter Safety Checks  /  Backend & Model Integration', 0.68, 3.91, 11.8, 0.44, 20, C.teal);
  rule(s, 0.65, 4.79, 11.95);
  stat(s, '4', 'Clinical support workflows', 0.68, 5.11, 2.9);
  stat(s, '17', 'Indexed knowledge documents', 3.7, 5.11, 2.9, C.blue);
  stat(s, '1024', 'Embedding dimensions', 6.73, 5.11, 2.9, C.amber);
  stat(s, '295,184', 'DDInter interaction pairs', 9.75, 5.11, 3.0);
  text(s, '28 Sep 2026  |  Individual responsibilities only; team-owned modules are not claimed as personal deliverables.', 0.68, 6.54, 11.8, 0.26, 12, C.muted);
  s.addNotes('My contribution focuses on backend and algorithm integration for the clinical AI assistant, knowledge retrieval, and DDInter order checks. The four workflows are Record Draft, Consultation Summary, Similar Records, and Order Safety Check. The current website has no standalone knowledge-base Q&A page; this report does not present reserved backend capabilities as delivered physician-facing features. The recorded local verification on 28 September 2026 reports 17 documents, 848 chunks, and 1024-dimensional embeddings. The 295,184 interaction pairs belong to the fixed local DDInter snapshot, not a clinical accuracy measurement.');
}

// 02: Scope, stack, and architecture.
{
  const s = page('01 / SCOPE & ARCHITECTURE', 'Connecting Models and Knowledge to Physician Workflows', 'Clinical AI services, source data, retrieval algorithms and API integration; reuse of team-owned identity and patient modules.');
  panel(s, 'My Responsibilities', 'Four clinical support APIs\nDocument ingestion and retrieval\nDDInter parsing and indexing\nWorkbench integration and testing', 0.55, 2.12, 4.03, 2.48, C.teal, 16);
  panel(s, 'Core Technology Stack', 'Node.js + TypeScript + Express 5\nMySQL / MariaDB + mysql2\nVolcengine Ark: Seed 2.0 Lite + Embedding\nVue 3 / Element Plus integration', 4.82, 2.12, 7.93, 2.48, C.blue, 17);
  box(s, 0.55, 4.91, 12.2, 0.65, C.ink);
  text(s, 'Physician Workbench  >  Authentication & Roles  >  Clinical AI Services  >  Sources & Review', 0.76, 4.91, 11.78, 0.65, 18, C.white, true, { align: 'center' });
  text(s, 'Generative Path', 0.67, 5.95, 2.0, 0.33, 16, C.teal, true);
  text(s, 'Synthetic consultation records > Model drafting > Source and numeric validation', 2.8, 5.87, 9.65, 0.5, 17);
  text(s, 'Rule-based Path', 0.67, 6.48, 2.0, 0.33, 16, C.amber, true);
  text(s, 'Ingredient parsing / Allergy rules / DDInter > Structured risk alerts', 2.8, 6.4, 9.65, 0.5, 17);
  s.addNotes('The architecture separates narrative generation, knowledge retrieval, and medication risk screening. Drafts and summaries use eligible original synthetic consultation records; guideline-augmented generation is not claimed. Similar Records calls the embedding model and returns synthetic cases and guidance excerpts without a chat model generating clinical comparisons. Order checks use explicit rules and DDInter, not language-model guesses about interactions. Embeddings are stored in MariaDB and similarity is computed in the application; there is no dedicated vector database. Current model IDs are doubao-seed-2-0-lite-260428 and doubao-embedding-vision-251215. Authentication, patient management, and the text/image consultation interface are team contributions, not wholly my individual work.');
}

// 03: Four physician-facing workflows and model guardrails.
{
  const s = page('02 / CLINICAL AI FEATURES', 'Four Support Workflows, with Physicians in Control', 'Four POST endpoints return assistive output; they do not autonomously establish diagnoses or issue prescriptions.');
  const items = [
    ['01  Record Draft', 'Turn existing consultations into editable drafts\nRetain sources for physician diagnosis and review', '/api/ai/record-draft', C.teal],
    ['02  Consultation Summary', 'Summarize the record and follow-up priorities\nSeparate reported symptoms from clinical conclusions', '/api/ai/consultation-summary', C.blue],
    ['03  Similar Records', 'Up to 5 synthetic cases + 2 guidance excerpts\nSimilarity ranks results; it is not diagnostic probability', '/api/ai/similar-cases', C.blue],
    ['04  Order Safety Check', 'Screen documented allergies and drug interactions\nShow completed checks and outstanding coverage gaps', '/api/ai/order-check', C.amber],
  ];
  items.forEach((d, i) => {
    const x = i % 2 ? 6.78 : 0.55;
    const y = i < 2 ? 2.12 : 4.18;
    panel(s, d[0], d[1], x, y, 5.97, 1.88, d[3], 15);
    text(s, `POST ${d[2]}`, x + 0.22, y + 1.54, 5.52, 0.24, 11, C.muted);
  });
  text(s, 'Model access: 3 fixed server-side synthetic consultations. Invalid citations, numbers or responses trigger a record-based fallback.', 0.57, 6.4, 12.15, 0.36, 13, C.muted);
  s.addNotes('Model-generated drafts and summaries are allowed only for three synthetic consultations that match the fixed server-side records field by field. Arbitrary real-patient text submitted from the browser must not be sent to the cloud model. Failed source or numeric validation, or a service error, triggers structured extraction from existing records instead. Physicians must add a diagnosis and review a draft before submission. Similar Records searches only Synthea records explicitly marked synthetic and retains the highest-scoring excerpt for each document. These are not real hospital cases or independently validated clinical recommendations. Endpoints are defined in backend/src/routes/ai.ts.');
}

// 04: Knowledge retrieval, without claiming a delivered RAG Q&A feature.
{
  const s = page('03 / KNOWLEDGE & RETRIEVAL', 'Knowledge Retrieval for Similar Records and Guidance', 'RAG knowledge preparation and retrieval are implemented. The page returns source excerpts, not generated knowledge-base answers.');
  const steps = [
    ['01  Parse & Chunk', 'PPTX / PDF / DOCX / FHIR JSON\nPage-based or clinical sections'],
    ['02  Embed & Store', '1024-dimensional vectors\nChunks, sources and metadata\nstored in MariaDB'],
    ['03  Retrieve & Trace', 'Query embeddings + cosine ranking\nDocument deduplication and term filters\nPage references and source links'],
  ];
  steps.forEach((d, i) => {
    const x = 0.55 + i * 4.15;
    panel(s, d[0], d[1], x, 2.12, 3.89, 1.87, i === 1 ? C.blue : C.teal, 14);
    if (i < 2) text(s, '>', x + 3.9, 2.63, 0.23, 0.44, 20, C.gray);
  });
  box(s, 0.55, 4.22, 12.2, 0.53, C.ink);
  text(s, 'Similar Records  >  Up to 5 synthetic cases  +  2 Related Guidance excerpts', 0.78, 4.22, 11.72, 0.53, 18, C.white, true, { align: 'center' });
  stat(s, '17 / 848', 'Indexed documents / chunks', 0.6, 5.02, 3.7);
  text(s, '3 project documents + 6 guidance documents\n8 Synthea older-adult synthetic records', 0.6, 6.22, 3.75, 0.5, 12, C.muted, false, { valign: 'top' });
  text(s, 'Source Coverage', 4.55, 5.02, 3.55, 0.33, 18, C.teal, true);
  text(s, 'China NHC: diet and follow-up\nWHO: hypertension and older-adult care\nCDC STEADI: fall prevention', 4.55, 5.52, 3.71, 1.04, 14, C.muted, false, { valign: 'top' });
  text(s, 'Reliability Controls', 8.78, 5.02, 3.6, 0.33, 18, C.blue, true);
  text(s, 'Ingestion checkpoints and recovery\nChinese/English search; patient isolation\nPublisher, page, version and license', 8.78, 5.52, 3.75, 1.04, 14, C.muted, false, { valign: 'top' });
  s.addNotes('This slide describes the existing physician-facing retrieval workflow, not a complete retrieval-augmented generation Q&A feature. rankSimilarCases uses cosine similarity, keeps the highest-scoring excerpt per synthetic case, and returns at most five cases. relatedGuidance filters guidance by Chinese/English query terms, ranks matches by cosine similarity, deduplicates by document, and returns at most two excerpts. Query embedding calls use the embedding service; the results are not generated by a chat model. Recorded local totals on 28 September 2026 are: 3 project documents / 272 chunks, 6 guidance documents / 497 chunks, and 8 synthetic records / 79 chunks, totaling 17 documents / 848 chunks. The five new sources are China NHC dietary guidance for hypertension and diabetes (2023), the COPD health-service specification (2024), WHO hypertension pharmacological treatment guidance (2021), and ICOPE second edition. CDC STEADI was already indexed. Not every guidance document is a comprehensive treatment guideline, and these references do not complete medication-rule coverage. New PDFs are chunked by physical page, preserve short headings, and use a 3200-character chunk limit. Insufficient text from scanned documents is rejected. WHO materials have non-commercial licensing restrictions; no unrestricted redistribution license is claimed for NHC materials. Source records are in backend/docs/clinical-guidance-sources.md and dataset-catalog.json.');
}

// 05: DDInter snapshot and current medication screening boundaries.
{
  const s = page('04 / DDINTER & ORDER SAFETY', 'Structured Drug Knowledge for Repeatable Risk Screening', 'Pinned upstream snapshot with SHA-256 checks; pair-level severity and mechanisms are retrieved, not invented by a model.');
  stat(s, '2,283', 'Drug records', 0.55, 2.12, 3.6);
  stat(s, '295,184', 'Unique interaction pairs', 4.65, 2.12, 3.75, C.blue);
  stat(s, '8,234', 'Mechanism entries', 9.03, 2.12, 3.6, C.amber);
  s.addChart(ppt.ChartType.bar, [{ name: 'Interaction pair count', labels: ['Moderate', 'Major', 'Unknown', 'Minor'], values: [189439, 50983, 42415, 12347] }], {
    x: 0.55, y: 3.55, w: 6.23, h: 2.46, barDir: 'bar', showLegend: false, showValue: true,
    chartColors: [C.teal], catAxisLabelFontFace: 'Arial', catAxisLabelFontSize: 11,
    valAxisLabelFontFace: 'Arial', valAxisLabelFontSize: 9, valAxisMinVal: 0, valAxisMaxVal: 225000, valAxisMajorUnit: 100000,
    showBorder: false, showShadow: false, dataLabelPosition: 'outEnd', dataLabelColor: C.ink,
    catAxisLineShow: false, valAxisLineShow: false, valGridLine: { color: C.line, width: 0.5 },
  });
  text(s, 'Implemented Checks', 7.11, 3.66, 5.35, 0.37, 19, C.teal, true);
  text(s, 'Ingredient parsing > Allergy rules > DDInter lookup\nConfirm current medications; retain unknowns as gaps', 7.11, 4.23, 5.35, 0.79, 15);
  text(s, 'Example Alerts', 7.11, 5.21, 5.35, 0.33, 18, C.amber, true);
  text(s, 'Penicillin allergy + Amoxicillin: preliminary allergy alert\nMetoprolol + Verapamil: Major interaction', 7.11, 5.65, 5.42, 0.75, 14, C.muted);
  box(s, 0.55, 6.51, 12.2, 0.34, C.yellow);
  text(s, 'Gaps: full cross-allergy, product-specific eGFR dosing and Beers criteria. Major does not automatically mean contraindicated.', 0.73, 6.51, 11.84, 0.34, 12, C.amber);
  s.addNotes('Counts come from the local DDInter index, not the latest website totals or independently annotated clinical data: 2,283 drugs, 295,184 unique drug pairs, and 8,234 mechanisms. Severity counts are Moderate 189,439; Major 50,983; Unknown 42,415; Minor 12,347. Normalized names map to unique drug IDs. An undirected pair Map ensures that A+B and B+A give the same lookup. Ambiguous names are not guessed. Only drug pairs and mechanisms are integrated; the bundled disease tables and inference chains are not used. The penicillin/amoxicillin check is a limited source-based rule, not a comprehensive drug-class classifier. A dose-rule interface exists, but reviewed mainland-China product-specific rules are missing and complete Beers criteria are not implemented. No matched interaction is not proof of safety. DDInter terms: https://ddinter.scbdd.com/terms/. Packaging source: https://github.com/pbiondich/openmrs-ddi-knowledge-base. Use is restricted to the non-commercial course project.');
}

// 06: Recorded retrieval measurements, without claims of clinical accuracy.
{
  const s = page('05 / EVALUATION & SUMMARY', 'Measuring Retrieval Quality, Not Clinical Accuracy', 'Local run: 28 Sep 2026 | 29 labeled retrieval questions + 1 out-of-scope question | Existing benchmark, not model self-rating');
  s.addChart(ppt.ChartType.bar, [
    { name: 'Deployed source-group retrieval', labels: ['Recall@8', 'MRR@8', 'nDCG@8'], values: [98.28, 95.69, 91.45] },
  ], {
    x: 0.55, y: 2.2, w: 7.6, h: 3.18, barDir: 'col', chartColors: [C.teal],
    catAxisLabelFontFace: 'Arial', catAxisLabelFontSize: 12, valAxisLabelFontFace: 'Arial', valAxisLabelFontSize: 10, showLegend: false,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.00"%"', dataLabelColor: C.ink,
    valAxisMinVal: 0, valAxisMaxVal: 110, valAxisMajorUnit: 25, valAxisNumFmt: '0"%"', showTitle: false,
    catAxisLineShow: false, valAxisLineShow: false, valGridLine: { color: C.line, width: 0.5 },
  });
  stat(s, '429 / 815ms', 'Observed retrieval P50 / P95', 8.71, 2.48, 3.6);
  stat(s, '5 / 5', 'New-guidance smoke tests passed', 8.71, 4.0, 3.6, C.blue);
  text(s, '69 backend tests passed. New-topic tests verify source hits only, not clinical correctness.', 0.59, 5.54, 12.1, 0.25, 12, C.muted);
  rule(s, 0.55, 5.91, 12.2);
  text(s, 'Delivered', 0.59, 6.12, 1.5, 0.3, 17, C.teal, true);
  text(s, 'Four support workflows + Traceable retrieval + Local DDInter risk lookup', 2.26, 6.08, 10.1, 0.38, 17);
  text(s, 'Next Steps', 0.59, 6.63, 1.5, 0.3, 17, C.blue, true);
  text(s, 'Expand guideline labels and medication rules. Retrieval scores do not establish prescribing safety.', 2.26, 6.57, 10.1, 0.42, 14, C.muted);
  s.addNotes('Recorded local verification from 28 September 2026 is documented in backend/docs/clinical-guidance-sources.md. The unchanged legacy benchmark contains 30 cases, including 29 with labeled relevant sources. Deployed source-group Recall@8 is 98.275862%, MRR@8 is 95.689655%, and nDCG@8 is 91.447512%. Observed P50/P95 retrieval latency is 429/815 ms, with no failed cases and no scope contamination. Recall measures relevant-source coverage, MRR measures the first relevant result position, and nDCG measures ranking quality. These measure the general backend retrieval engine, not all Similar Records UI behavior or clinical outcomes. The legacy benchmark mostly covers project requirements, falls, and synthetic cases; results cannot be generalized to every new guideline topic. Five of five new-topic smoke tests verify expected documents in the top five and Related Guidance hits, not answer correctness. The recorded backend suite has 69 passing automated tests. Latency is a single local observation, not a deployment guarantee. No cross-corpus improvement or clinical accuracy claim is made. Personal deliverables include four support workflows, knowledge ingestion and retrieval provenance, and structured DDInter risk lookup. Complete cross-allergy rules, product-specific renal dosing, and Beers coverage remain incomplete.');
}

if (withCover) {
  const s = ppt.addSlide();
  s.background = { color: C.bg };
  box(s, 0, 0, 0.12, 7.5, C.teal);
  text(s, 'Thank You for Listening', 0.8, 3.12, 11.7, 1.1, 42, C.ink, true, { align: 'center' });
  s.addNotes('Thank you for listening.');
}

if (ppt._slides.length !== slideCount) throw new Error(`The English deck must contain exactly ${slideCount} slides.`);
const outside = bounds.filter(b => b.x < 0 || b.y < 0 || b.x + b.w > 13.343333 || b.y + b.h > 7.51);
if (outside.length) throw new Error(`Out-of-canvas text: ${JSON.stringify(outside)}`);
const destination = path.join(__dirname, withCover ? 'Doctor-Work-Platform-Group-10-English.pptx' : 'Clinical-AI-Personal-Work-Report-6-Slides-English.pptx');
ppt.writeFile({ fileName: destination }).then(() => console.log(JSON.stringify({ file: destination, slides: ppt._slides.length, checkedTextBoxes: bounds.length })));
