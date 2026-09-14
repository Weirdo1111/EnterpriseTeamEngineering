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

All business data and external services are local demonstrations. The app does not connect to real patient systems, SMS providers, facial recognition, or medical AI services.

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

## Technology Stack

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Element Plus
- ECharts
- @lucide/vue

## Local Development

```bash
npm install
npm run dev
```

Default URL:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```
