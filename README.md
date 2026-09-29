# Smart Healthcare Doctor Service System

A Vue 3, TypeScript, and Element Plus doctor workspace prototype with a compact clinical workstation layout and end-to-end interactive workflows.

## Feature Scope

- Multi-method sign-in and role demos: password with verification code, SMS verification, and facial verification
- Doctor dashboard: daily tasks, consultation queue, priority patients, and referral tasks
- Patient information management: combined search, pagination, profile creation/editing, condition tags, management statuses, and bulk classification
- Online consultation: session queue, uploads, history export, summaries, and record drafts
- Electronic medical records: structured records, editable orders, tiered review, and archiving
- Remote consultation: requests, acceptance, specialist assignment, opinions, and report generation
- Health management: care plans, reminders, monitoring trends, and periodic assessments
- AI assistant: record drafts, consultation summaries, similar records, and order risk checks
- Role-scoped audit logs: personal, department, or platform-wide visibility

Patient profiles, patient messaging, images and consultation-derived records are local demonstrations. Configuring the backend enables real password authentication, the general medical-record service and AI/RAG endpoints. It does not turn local consultation data into server records or connect a patient device. SMS and facial verification remain simulations available only in local demo mode.

## Authentication and patient binding integration

Leave `VITE_API_BASE_URL` empty for the existing local demo. To verify a real password account, copy `.env.example` to `.env.local`, configure the authentication server root URL, and restart Vite. Login uses `POST /api/auth/login` followed by `GET /api/auth/me`. API sessions use a separate storage key bound to that server; demo tokens, local role selection, SMS and facial simulations cannot authorize server mode. Verified server identities can enter the workspace and use the configured medical-record and AI services. `/connection` remains an optional connection-status page. Patient and consultation adapters remain explicitly local demonstrations; their saved records are not automatically uploaded. Logout clears the local identity immediately; the current backend does not revoke issued JWTs.

New consultations and medical record handoffs validate exact opaque patient IDs through the existing shared patient service. Current identity displays use that profile; historical names are labelled snapshots. Missing profiles do not fall back to another patient. See [接口对接结果与待联调](docs/接口对接结果与待联调.md) for implementation, configuration, acceptance steps and remaining backend decisions.

## Patient Information Management

Visit `/patients`, or `/patients?patient=PATIENT_ID` to locate a patient and their page. This module maintains patient information; health trends, care plans, and follow-ups belong to Health Management.

- Search by name, ID, symptoms, diagnosis, or medical history, combined with condition and management status filters. Page sizes: 10, 20, or 50.
- Create and edit through one form. Name, gender, and whole-number age (1–120) are required. Contact details, emergency contacts, diagnosis, and history are optional; emergency contacts require both name and phone.
- Allergy status distinguishes Unconfirmed, No known allergies, and Known allergies. Known allergies require at least one entry.
- Patients can have multiple condition tags. Management status is Pending Intake (`pending`), Active (`active`), or Closed (`closed`), stored separately from clinical risk.
- Bulk operations add conditions, remove conditions, or set a management status for selected patients on the current page. Filters, pagination, and completed operations clear selection.
- Physicians and senior physicians can write; administrators have read-only access. Permissions and audit logs are frontend demonstrations, not production security controls.

### Demo data and persistence

`src/mocks/patients.ts` provides 24 fictional patients, preserving the four original patient IDs and cross-module links. The original four English fixtures match `main`.

Profiles are stored only in this browser under `doctor-platform-patient-information-v1`. The key stays unchanged so existing profiles can be recovered; its payload now uses **schema version 2**. Version 1 records are migrated in memory: Chinese gender values become `Male`/`Female`, known condition tags are translated and deduplicated, and demo physician names are aligned with the English profiles. User-entered names, histories, allergies, and custom tags remain unchanged, so previously saved text can still appear in Chinese. Reads do not write storage, including administrator reads. The next successful save persists version 2; a failed save leaves the original data intact.

Only patient-information fields persist. Risk, metrics, health plans, and other modules keep their existing demo lifecycle. Newly created patients receive their own downstream plan placeholder to avoid showing another patient's plan. Invalid data triggers a warning and initial fixtures; storage access failures show errors. Failed saves do not update shared state or record success.

To reset demo profiles during development, delete only that patient storage key using browser developer tools, then refresh. There is no patient deletion workflow in this module.

### Future API integration

`src/services/patients.ts` defines the asynchronous `PatientService`: `list()`, `getById(id)`, `create(input)`, `update(id, input)`, and `batchUpdateClassification(ids, change)`. The page calls this service through the shared clinical Pinia store. Currently, `list()` loads all patients and filtering/pagination run in the browser.

Replace the exported `patientService` adapter when the real API is ready. Endpoints, authentication, and server pagination must be agreed with the backend. `PatientInput` allows only editable profile fields, excluding IDs, ownership, risk, and health plans. A real backend must enforce authorization, validation, and atomic writes.

### Verification

```bash
npm test
npm run build
```

Vitest covers persistence, version migration, atomic bulk operations, failures, permissions, validation, filtering, and shared-store compatibility. CI runs the build and tests.

Browser checks cover combined filters and empty results; creating/editing and refresh; cancel protection and allergy validation; bulk operations and selection clearing; deep links and invalid IDs; administrator access; and layouts at 1440px, 1024px, and 390px. Recheck consultation, records, remote consultation, and health management after integration.

## Online Consultation Local History

The consultation page saves messages, image metadata, clinician summaries, and accepted/completed session states in this browser under `doctor-platform-consultations-v1` (schema version 3; versions 1 and 2 remain readable). Original image files are saved as Blobs in IndexedDB (`doctor-platform-consultation-images`, store `images`). It uses asynchronous adapters in `src/services/consultations.ts` and `src/services/consultation-images.ts`, ready to be replaced when the shared API is agreed. Patient records keep their existing, separate storage key.

- Enter `/consultation` as a physician, send a distinctive message, and refresh: the message remains.
- Accept the waiting consultation, refresh, and check that it is still in progress.
- End a consultation through the confirmation dialog. Reopen it from **Consultation Records → Completed** after a refresh: messages remain and the composer is read-only.
- Draft text remains attached to each conversation while the page is open; unsent drafts are not retained on reload.
- Choose **Add Image**, select a JPEG, PNG, or WebP (up to 5 MiB / 24 megapixels), and inspect the preview. Remove or replace it, then send with or without a caption. Only one image is attached per message.
- Sent images appear as thumbnails. Click to enlarge and download the original file. Refresh and reopen the conversation to verify persistence. Unsent image drafts stay with their conversation until this page is left or refreshed.
- Images are validated by MIME, file signature, and browser decoding. A failed save keeps the selected image and text for retry. An unavailable image shows an individual retry control while the conversation remains readable.
- **Consultation Summary** opens a clinician-written note for the selected conversation: chief complaint and consultation notes are required; assessment, advice/plan, and follow-up are optional. The complaint is prefilled from the session. No assessment or advice is generated automatically.
- Physicians can save and edit summaries for in-progress consultations. Accept a waiting consultation first; completed consultations and administrator access are read-only. Saved summaries include the clinician's name and save time, survive refresh, and remain available from completed records. Existing conversations without a summary stay readable.
- Summary edits stay with each conversation until you leave or refresh the page. Close and reopen the panel to continue, or explicitly discard changes. Save failures retain the draft and leave the saved summary unchanged. Before ending or exporting a conversation, save or discard its pending summary changes.
- **Export Current Conversation** exports the selected conversation's saved summary, text, and image filenames/metadata; image bytes are downloaded individually from the image viewer. Unsubmitted drafts are not included.
- **Consultation Records (N)** is the single entry for searching current and completed conversations; N is the total number of saved consultations. The panel opens on All, with Waiting, In Progress, and Completed status filters and counts. Filter by a literal case-insensitive keyword and optional start/end dates. Search covers current/saved patient names, patient/session IDs, complaints, message text, saved summary fields/author, and image/sample-attachment filenames, not image contents. Summary matches use the summary's last saved date.
- On the Online Consultation page, the top bar shows **Online Consultation** in place of global patient/medical-record search. Other pages retain global search.
- Date bounds include both full days in the browser's local timezone. A message must match the keyword and dates together. For patient/ID/complaint matches, a session qualifies when its update time or a message is in the date range. Legacy sample times without a full date are excluded by date filters; no date is inferred from session IDs or labels such as Yesterday.
- Open a matching message to scroll to it and highlight the text, or open its full conversation. **Latest message** clears the search position. Searching and opening results preserve unsent drafts and do not change saved history. Use **Clear filters** to reset the search.
- The page reports successful local saves only after storage succeeds. On failure it keeps the draft for retry and leaves the previous record unchanged. Retrying the same message uses a stable message ID to avoid duplicates.
- Stored history that is damaged or uses an unsupported schema is preserved and produces a load error; it is not silently overwritten with sample data.

- **Demo Tools** creates fictional waiting requests and patient text/image replies for local acceptance. Forms retain input after failure and use stable request/message IDs for retries. Completed sessions reject replies. No message is delivered to another device or person.
- The consultation queue filters by patient name/ID, session ID or complaint and Waiting/In Progress status. Unread counts are saved only after explicit selection/Read latest (or successful accept/reply); refreshing alone does not mark a message read. The notification bell reflects actual local counts.
- Unsent text/image drafts, summary edits and demo forms stay separate per conversation while this page remains open. Leaving through navigation or sign-out asks before discarding drafts. Browser refresh/close uses the browser's native unsaved-change prompt.
- **Create Record Draft / Open Linked Record** copies the saved manual consultation summary into one linked medical record per conversation. Existing edits are preserved when it is reopened or the source summary changes. No diagnosis or orders are inferred. These linked records persist in `doctor-platform-consultation-records-v1`, including subsequent saved edits, orders, review and archive states. Source records are editable only in Draft/Returned; review/archive require the senior physician role. General medical records use the separate `medicalRecordService`: local persistence in demo mode and authenticated HTTP calls when the backend is configured. Consultation-derived records remain local in both modes and are clearly marked with their source.

This is a shared local demonstration for the browser's demo roles, not a server, patient messaging connection, or secure authorization system. Use fictional images for demonstration. Clearing this site's browser data removes saved conversations, images and linked records; other devices/browsers do not share them. Patient attachments labelled **Sample** are fictional references with no uploaded file. The patient context panel uses profile fields, not an AI analysis of the conversation. Audit entries remain an in-memory shared-module demonstration. Video consultation and recording are not implemented.

Manual verification: [在线问诊验收清单](docs/在线问诊验收清单.md). Backend handoff: [consultation adapter contracts and boundaries](docs/consultation-integration.md).

Service and store tests cover reloading history, atomic failed writes, completed-session protection, read-only roles, retry deduplication, and separation from patient storage. Run `npm test` and `npm run build` after changes.

## Medical Records and Review Workflow

The medical record module now uses an asynchronous service boundary rather than mutating Pinia state directly. The adapter in `src/services/records.ts` stores demo records under `doctor-platform-medical-records-v1`, or uses the authenticated backend when configured. Consultation-derived records use their own local adapter and are identified by `sourceConsultationId`.

- Physicians and senior physicians can create drafts and edit only `draft` or `returned` records. Administrators are read-only.
- General medical-record submission requires complete clinical fields and at least one active order. Local consultation-derived records require chief complaint, present illness and diagnosis; they never fabricate an order to meet submission requirements.
- Only senior physicians can perform `pending -> approved/returned` and `approved -> archived` transitions.
- Every write uses an expected version to detect stale concurrent edits.
- Medical orders retain creation, update, and stop metadata instead of being deleted.
- Reviews retain reviewer, decision, note, and timestamp history.
- Storage writes are atomic from the UI perspective: failed persistence does not update Pinia state or append a success audit entry.

`src/services/clinical-ai.ts` is a deterministic, traceable fallback adapter for draft generation. It produces structured fields, source IDs, and safety warnings without prescribing medication doses. Configured API mode uses the Express AI/RAG endpoints; the deterministic fallback remains available in local demo mode. AI output remains a draft and cannot bypass physician review.

The production backend should enforce the same role permissions, state transitions, validation, optimistic locking, and audit events. Frontend checks are usability controls, not a security boundary.

## Technology Stack

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Element Plus
- ECharts
- @lucide/vue
- Express 5 + TypeScript
- MySQL 8 or MariaDB 10.4+
- JWT + Argon2id

## Local Development

```bash
npm install
npm run dev
```

Default URL:

```text
http://127.0.0.1:5173/
```

The frontend runs in local demo mode by default. For authenticated MySQL-backed records, configure `VITE_API_BASE_URL`, apply the migrations, and start the backend as documented in `backend/README.md`.

The authenticated AI Assistant supports a MariaDB-backed RAG knowledge base with PPTX/PDF/DOCX ingestion, Ark embeddings, hybrid retrieval, source citations, audited queries, and a retrieval-only fallback when text generation is rate limited.

## Build

```bash
npm run build
```
