# Backend

Express and TypeScript API for authentication, electronic medical records, medical orders, tiered review, audit logging, and traceable AI draft generation.

## Setup

```bash
cd backend
npm ci
cp .env.example .env
```

Edit `.env` with your local MySQL 8 or MariaDB 10.4+ credentials and a random `JWT_SECRET` of at least 32 characters. The current code expects the existing `users` columns `id`, `username`, `password_hash`, `name`, `role`, and `status`; `status='active'` allows login. Check the actual table before running if it differs from the provided schema.

Create the database itself, then apply the versioned schema and create the first user:

```bash
npm run migrate
npm run create-user
```

For a local demonstration environment, set `DEMO_PASSWORD` in `.env` and seed all three roles idempotently:

```bash
npm run seed:demo
```

This creates or refreshes `doctor.demo`, `senior.demo`, and `admin.demo`. Use `npm run create-user` for individually managed accounts outside the demo environment.

```bash
npm run build
npm start
```

The server checks all required tables at startup and listens at `http://127.0.0.1:3000` by default. Passwords are stored as Argon2id hashes.

## Try the API

```bash
curl -i -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"doctor.demo","password":"your-account-password"}'

curl -i http://127.0.0.1:3000/api/auth/me \
  -H 'Authorization: Bearer YOUR_TOKEN'

curl -i -X POST http://127.0.0.1:3000/api/auth/logout \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

JWTs expire after 2 hours. Logout only tells the client to discard the token; an already issued token remains valid until expiry. When `VITE_API_BASE_URL` is configured, password login uses these endpoints and the database determines the user's role.

## Medical record API

All endpoints require `Authorization: Bearer TOKEN`.

```text
GET    /api/records
GET    /api/records/:id
POST   /api/records
PATCH  /api/records/:id
POST   /api/records/:id/submit
POST   /api/records/:id/orders
PATCH  /api/records/:id/orders/:orderId
POST   /api/records/:id/orders/:orderId/stop
POST   /api/records/:id/reviews
POST   /api/ai/record-draft
POST   /api/ai/consultation-summary
POST   /api/ai/similar-cases
POST   /api/ai/order-check
GET    /api/rag/documents
GET    /api/rag/ingestion-jobs
POST   /api/rag/query
```

Every mutation includes `expectedVersion`. A stale version returns HTTP 409 rather than overwriting another session. The backend enforces role permissions and state transitions independently of the frontend.

Ordinary doctors can only list, read, or modify records they created. Senior doctors and administrators can read all records, while only senior doctors can review or archive them. Successful record/order mutations and their audit entries commit in the same database transaction. Run the optional MariaDB transaction test with `npm run test:integration` after seeding `doctor.demo`.

The doctor's AI Assistant has four workflows: editable record draft, source-faithful consultation summary, synthetic similar-case retrieval with relevant guidance, and proposed-order review. The record draft does not create diagnoses or orders automatically; an assistant draft cannot be submitted while its diagnosis remains `Pending physician assessment`. The order checker accepts structured ingredient, approval number, route, dose, frequency, current medicines, allergies, and eGFR. It detects exact ingredient allergies and a narrow preliminary amoxicillin-versus-penicillin warning. For non-commercial coursework, run `npm run ddinter:prepare` to download a pinned, checksummed DDInter 2.0 interaction index before starting the backend. The dataset is stored locally and is not committed. Interaction checks require a confirmed current medication list and uniquely resolved generic ingredients. Product-specific cross-allergy, renal dose, and geriatric rules still require a locally reviewed Mainland China catalog; the assistant never clears a prescription. See [medication knowledge integration](docs/medication-knowledge.md). Similar-case records are synthetic examples, not treatment evidence.

For the three bundled demo consultations, the record-draft and summary routes can call the Ark chat model to produce concise text with source excerpts. Only server-owned synthetic text is sent: the patient ID, fictional name, consultation ID, complaint, history, and every message must exactly match the fixture, and physician notes must be empty. Other records stay on the local rule-based path. Invalid model citations, altered measurements, omitted measured statements, and provider failures fall back to recorded text. Creating a record draft is one action in the AI Assistant; the draft still needs physician review, diagnosis, and orders before submission. Real patient data must not be enabled for model generation without an authorized server-side patient repository and organization-approved data-processing controls.

To use the backend from Vite, create a root `.env.local` containing:

```text
VITE_API_BASE_URL=http://127.0.0.1:3000
```

Without this variable, the frontend intentionally uses local demo adapters.

Run `npm run build && npm test` for the backend tests.

## RAG knowledge base

Configure the Ark credentials and model IDs in `backend/.env`:

```text
AI_API_KEY=replace_with_your_ark_api_key
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_CHAT_MODEL=doubao-seed-2-0-lite-260428
AI_EMBEDDING_MODEL=doubao-embedding-vision-251215
AI_EMBEDDING_DIMENSIONS=1024
```

After applying migrations and building the backend, import PDF, PPTX, DOCX, or Synthea FHIR R4 JSON documents:

```bash
npm run build
npm run ingest -- "C:\path\requirements.pptx" "C:\path\guide.pdf"
```

The importer stores only extracted text, citation metadata, and vectors in MariaDB. Original files and local paths are not copied into the database. Each import has a persistent checkpoint in `knowledge_ingestion_jobs`; failed imports resume from stored chunk embeddings, and the previous ready document remains available until the replacement commits atomically. Authenticated clinicians can query `POST /api/rag/query`; all queries are audited. If the chat model is rate limited, the endpoint returns ranked source evidence with `generationMode: "retrieval-only"` instead of inventing an answer.

Queries are isolated by an explicit retrieval scope. Omitting `scope` remains backward-compatible and selects only project documents:

```json
{ "question": "What is required for medical record review?", "scope": "project" }
{ "question": "How should fall risk be screened?", "scope": "clinical-guideline" }
{ "question": "Summarize recorded conditions", "scope": "synthetic-patient", "documentId": "KD-..." }
```

`synthetic-patient` requires one document ID and retrieves only that patient plus approved clinical guidance. Low-evidence questions and requests for diagnosis, prescriptions, or medication doses return `answerDecision: "abstained"` without calling the chat model. Every response includes `scope`, `evidenceStatus`, and `clinicianReviewRequired`.

### Curated open datasets

The repository includes a reviewable source catalog at `data/dataset-catalog.json`. Fetch the allowlisted CDC STEADI public-domain guide and eight Synthea synthetic records for adults aged 65 or older:

```bash
npm run datasets:fetch
npm run migrate
npm run build
npm run datasets:ingest
```

Downloaded files are gitignored; the fetch receipt records checksums locally. The FHIR importer excludes names, addresses, contact details, identifiers, and exact birth dates before embedding. It stores publisher, source URL, license, category, and synthetic-data status alongside each document. `AI_EMBED_DELAY_MS` defaults to 1200 ms to reduce embedding RPM pressure and can be tuned for the provider quota.

Run the reviewable retrieval benchmark, or include answer generation metrics:

```bash
npm run eval:rag
npm run eval:rag -- --generate
```

The benchmark definitions and interpretation notes are in `docs/rag-evaluation.md`. It compares the original fragment ranking with source-page aggregation using identical query embeddings and human-authored relevance labels.

See `docs/production-readiness.md` for implemented safety controls, data-source decisions, and the release-blocking work that remains before any commercial or clinical deployment.
