# Production readiness

This repository is a clinically cautious demonstration, not a deployable medical device or a complete electronic medical record system. The following controls are implemented and should remain release gates:

- Retrieval scopes isolate project documents, approved clinical guidance, and one selected synthetic patient.
- Every answer has a trace ID, evidence decision, ranked source passages, and source provenance.
- Generated text without a valid source citation is downgraded to retrieval-only evidence.
- Diagnosis, prescription, and dosage requests are refused by the clinical scopes.
- RAG queries and record mutations are authenticated and audited.
- Synthea records are synthetic and are not evidence for clinical recommendations.

## Blocking items before commercial deployment

1. Replace browser-local patient storage with a server-side patient repository, row-level authorization, consent handling, retention policy, encryption key management, backup recovery, and immutable audit export.
2. Complete a jurisdiction-specific privacy, cybersecurity, medical-device, and clinical-safety review. Product claims determine whether medical-device rules apply.
3. Use only guidance and terminology assets with documented commercial rights for a commercial deployment. WHO non-commercial references are included only in this coursework build and must be removed or separately licensed before commercial reuse. Chinese government-published guidance is not automatically an open license; confirm reuse rights separately.
4. Procure and validate a medication knowledge source before enabling interaction, contraindication, or dose checking. Public drug labels alone are not a complete prescribing safety database.
5. Add organization-managed identity, MFA, short-lived sessions with revocation, secrets management, TLS, rate limiting, monitoring, incident response, and penetration testing.
6. Validate the model and retrieval system on representative, clinician-reviewed cases. Track subgroup performance, abstention quality, harmful omission, citation correctness, latency, availability, and drift.
7. Keep AI drafts separate from the legal record until an identified clinician reviews and signs each field. Persist model version, prompt version, source versions, citations, edits, reviewer, and timestamps as provenance.

## Data-source decisions

| Source | Intended use | Status | Reason |
| --- | --- | --- | --- |
| Project PPT/PDF files | Software requirements | Approved internally | Organization-provided source; not clinical evidence |
| CDC STEADI pocket guide | Fall-risk retrieval demo | Approved for demo | U.S. government/public-domain source with stored provenance |
| Synthea FHIR R4 records | Workflow and isolation testing | Approved for demo | Synthetic records; generator is Apache-2.0 |
| Chinese NHC dietary and COPD guidance | Coursework guideline retrieval | Imported for coursework | Official sources with recorded versions; no general open license claimed; local educational use, not clinically validated |
| WHO hypertension and ICOPE publications | Coursework guideline retrieval | Imported for coursework | CC BY-NC-SA 3.0 IGO; attribution and non-commercial restrictions apply; international guidance needs local adaptation |
| openFDA/DailyMed labels | Candidate label lookup | Not imported | Useful primary label data, but insufficient alone for medication safety decisions |

The source catalog at `data/dataset-catalog.json` is a coursework allowlist, not clinical owner approval. Sources record publisher, canonical URL, rights statement, version/date, and intended use. Clinical owner approval is still required before clinical deployment. See `clinical-guidance-sources.md` for scope and exclusions.
