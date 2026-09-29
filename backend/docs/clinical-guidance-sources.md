# Clinical guidance source review

Reviewed on 2026-09-28 for a non-commercial course project using fictional or de-identified patient data. This is source/provenance review, not clinical validation, legal clearance, or evidence of complete prescribing coverage.

## Selected documents

| Catalog ID | Document and intended scope | Version and jurisdiction | Primary source |
| --- | --- | --- | --- |
| `nhc-hypertension-diet-2023` | Adult hypertension dietary guidance; nutrition and self-management, not a complete treatment guideline | 2023, China | [NHC publication notice](https://www.nhc.gov.cn/wjw/c100378/202301/7faed9993c9b45aea158c5335346f282.shtml) |
| `nhc-diabetes-diet-2023` | Adult diabetes dietary guidance; nutrition and self-management, not a complete diabetes treatment guideline | 2023, China | [NHC publication notice](https://www.nhc.gov.cn/wjw/c100378/202301/7faed9993c9b45aea158c5335346f282.shtml) |
| `nhc-copd-health-services-2024` | COPD patient health-service specification; follow-up documentation and service workflow, not a comprehensive COPD pharmacotherapy guideline | 2024 trial, China | [NHC publication notice](https://www.nhc.gov.cn/wjw/c100175/202409/a6dcaab25db449a396ad644ea8798fcf.shtml) |
| `who-hypertension-2021` | Pharmacological treatment of hypertension in adults; background evidence only, not individualized prescriptions | 2021, international; adult non-pregnant population | [WHO publication](https://www.who.int/publications/i/item/9789240033986) |
| `who-icope-second-edition` | Integrated care for older people; person-centred assessment and primary-care pathways | Second edition, copyright 2024; publication web page dated 2025-09-22; international | [WHO publication](https://www.who.int/publications/i/item/9789240103726) |

CDC STEADI remains the existing fall-prevention source. Project PPTs and eight Synthea records remain separate source categories. Do not combine different synthetic people or reinterpret project requirements as clinical evidence.

## Rights and provenance

- WHO PDFs explicitly carry CC BY-NC-SA 3.0 IGO. Preserve attribution; translations/adaptations require the applicable same-or-equivalent license terms and WHO disclaimer. No WHO endorsement or logo use is implied. Commercial reuse requires separate permission. [WHO hypertension rights page](https://www.who.int/publications/b/59565).
- NHC documents are publicly distributed official guidance, but no general open-source/content license has been identified. The catalog records this limitation explicitly. Local educational indexing is the intended use; redistribution and commercial use are not cleared.
- Original PDFs, extraction probes, and SHA-256 download receipts remain in the gitignored `data/open-datasets/` directory. Store URL, publisher, version, category, and rights statement with each imported document. English catalog titles are display labels, not translations of the source text.
- Chinese 2024 hypertension/hyperglycemia nutrition-and-exercise attachments tested from government sites were mostly scanned, with only approximately 445 extracted characters each. They were excluded rather than ingested as complete guidance. The selected 2023 dietary guides cover a different scope and are not labelled as replacements for the 2024 documents. A text edition or validated OCR remains follow-up work.
- Publication date is not evidence that a guideline is current for every clinical question. Versions are explicit; reconcile newer or jurisdiction-specific recommendations before real clinical use.

## GitHub findings

- [WHO SMART Base Clinical](https://github.com/WorldHealthOrganization/smart-base-clinical) provides FHIR clinical profiles and dependencies. It is an architecture/interoperability reference, not a ready-made hypertension/diabetes guideline corpus. Its own license applies independently of any third-party source documents.
- [WHO NCD E-Registry](https://github.com/WorldHealthOrganization/NCD-E-Registry) documents NCD registry, reporting and indicator workflows. The inspected repository currently exposes a README; it is not a verified downloadable clinical-guideline library and was not ingested.
- [gaep](https://github.com/dozwa/gaep) is an evidence-based guideline application candidate. A code license does not license all guideline text or establish mainland-China clinical validity. It was not ingested.

## Ingestion and verification

Use `npm run datasets:fetch -- --clinical` and `npm run datasets:ingest -- --clinical`, or repeat `--source=<catalog-id>` for a subset. The PDF preflight rejects insufficient text and missing page provenance. New documents preserve original physical PDF page numbers and short headings within bounded chunks; existing benchmark source pages are unchanged. Imports stage embeddings with checkpoints and publish the complete document atomically.

Verify document/job readiness, persisted embedding dimensions, guideline-only retrieval, patient/project isolation, and end-to-end similar-case guidance retrieval. `npm run datasets:verify` runs five explicit English/Chinese topic smoke tests against the actual indexed corpus and writes a local receipt; it checks expected-document hits, related guidance, and scope, not clinical answer accuracy. A successful import or valid citation number does not establish clinical correctness. The old retrieval benchmark does not cover all new guideline topics; report new-topic smoke tests separately rather than claiming improved accuracy.

No question-answering page is added. Draft and summary generation are unchanged. Medication checks still use explicit rules and DDInter; these references do not complete cross-allergy, renal-dose, or Beers coverage.

## Recorded local verification (2026-09-28)

- Five new import jobs are `ready`, with 432/432 new chunks committed. The corpus is 17 documents / 848 chunks: three project documents / 272 chunks, six clinical-guidance documents / 497 chunks, and eight synthetic records / 79 chunks.
- All 848 vectors use `doubao-embedding-vision-251215` with 1024 dimensions. Original project, CDC and patient documents were not reindexed.
- Backend build and 69 automated tests pass, including PDF chunking, Chinese guidance lookup, source selection/path containment, and numeric/string MySQL count handling. A string COUNT previously caused a false `9/9` incomplete-checkpoint failure; it is now normalized and covered by transaction regression tests.
- Five new-topic smoke tests pass for both expected-document top-five retrieval and related guidance. These are source-routing checks, not clinical accuracy or answer-quality estimates.
- Live authenticated `/api/ai/similar-cases` returns Chinese dietary guidance with physical page labels and official source links. A Chinese clinical-guideline query through `/api/rag/query` returns `generationMode: generated`, three citations and required clinician review. Unauthenticated knowledge access returns 401; frontend HTTP response is 200. This is API verification, not a new frontend question-answering feature.
- The unchanged 30-case legacy retrieval run completes all 29 labeled retrieval questions, with no failed cases and zero scope contamination. Deployed source-group Recall@8 is 98.28%, MRR@8 is 95.69%, nDCG@8 is 91.45%; observed retrieval P50/P95 is 429/815 ms. These are one local run on an expanded corpus, not guaranteed latency or clinical correctness. The legacy questions primarily cover project requirements, falls and synthetic records, not comprehensive validation of the new topics.
- The experimental precision candidate has lower legacy Recall@8 (94.25%) than source-group on this run and was not promoted. Labels, questions and the deployed strategy were not changed to improve the reported results.
