# Consultation integration boundary

This document describes current clinical adapter contracts, not agreed patient/consultation HTTP endpoints. Authentication now uses the confirmed `/api/auth/login`, `/api/auth/me`, and `/api/auth/logout` contract when `VITE_API_BASE_URL` is configured. See [the interface integration report](./接口对接结果与待联调.md) for verified branch changes and limitations. Patient and consultation adapters remain local until the team supplies those APIs. General medical records and AI/RAG use the backend already integrated on main when configured.

## Current adapters

- `src/services/consultations.ts`: `list`, `accept`, `sendMessage`, `sendImage`, `saveSummary`, `complete`, `markRead`.
- `createDemoRequest` and `receiveDemoMessage` are explicitly local test utilities. In production, patient requests/messages must come from an authenticated patient API or validated server events. Do not expose a doctor endpoint which lets users impersonate patients.
- `src/services/consultation-images.ts`: stores original image Blobs in IndexedDB. A server replacement should authorize upload and download against the owning consultation. Keep thumbnail/loading/failure behavior in the existing image component.
- `src/services/consultation-records.ts`: creates one medical record per source consultation, then saves orders, revisions, review and archive states. The handoff reads the persisted clinician summary, never the page's unsaved draft. Existing records are returned without overwriting clinician edits.
- Store creation paths validate the exact patient ID through the shared `patientService.getById`; the returned current name becomes the new snapshot. Existing historical names remain unchanged, while current identity displays use `resolvePatientIdentity`. Never use the shared `selectedPatient` fallback to validate an explicit ID.

## Data rules to preserve

1. Stable client request/message IDs make retries idempotent. Reusing an ID for different content must fail. Preserve sender identity and original timestamps.
2. Waiting → Active → Completed is the consultation lifecycle. Completed conversations are read-only. Frontend role guards are demonstrations; the server must enforce the equivalent permissions and patient access scope.
3. A patient reply preserves the current waiting/active status and increments unread only once. Marking read does not change the clinical activity timestamp. For real multi-device messaging, replace the demo's count with a server-side per-user read cursor.
4. Validate image MIME, signature, byte size and decoded dimensions. Save attachment content and message metadata atomically, or use a staged upload with cleanup. Never report success until the write is durable.
5. A failed write leaves previous saved state and audit unchanged. Keep the page draft for retry. Do not silently reset corrupted storage to demo fixtures.
6. Source medical records copy clinician-written summary fields only. No diagnosis, medication, or order is inferred. Link by consultation ID, preserve a source summary timestamp, and notify about later summary changes without overwriting edits.
7. Draft/returned source medical records are editable; pending/approved/archived ones are read-only. Senior review controls approval/return and approved-to-archived transitions.
8. Search is currently client-side: patient/session metadata, message text, image filenames and saved summary fields. Message keywords and dates match the same message; summary keywords use its save date. Preserve these semantics with backend search/pagination.

## Current storage

| Purpose | Storage | Version |
| --- | --- | --- |
| Conversations and summaries | localStorage `doctor-platform-consultations-v1` | payload v3; v1/v2 readable |
| Original images | IndexedDB `doctor-platform-consultation-images`, `images` | existing adapter |
| Consultation-derived medical records | localStorage `doctor-platform-consultation-records-v1` | payload v2; v1 readable |
| Patient profiles | existing separate patient adapter | unchanged |

There is no real patient messaging or server archive for consultation-derived records in this version. General medical records use the separate backend service when configured. TXT conversation export includes patient ID, current/snapshot names, saved text, summary and image metadata; original images are downloaded individually. Configured server authentication enables the workspace, including the backend medical-record and AI services. Patient and consultation pages still use shared fictional browser data, and source-linked records remain local; they are never silently sent to the backend. `/connection` displays the optional integration status. Video consultation, recording, patient-side integration, patient-level authorization and persistent audit remain separate integration work.

## Verification

Run `npm test` and `npm run build`. Use [the Chinese acceptance checklist](./在线问诊验收清单.md) for the browser workflow. Do not delete existing local storage to start acceptance: Demo Tools can create a fresh fictional request while preserving earlier work.
