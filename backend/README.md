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
```

Every mutation includes `expectedVersion`. A stale version returns HTTP 409 rather than overwriting another session. The backend enforces role permissions and state transitions independently of the frontend.

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
AI_CHAT_MODEL=doubao-seed-1-8-251228
AI_EMBEDDING_MODEL=doubao-embedding-vision-251215
AI_EMBEDDING_DIMENSIONS=1024
```

After applying migrations and building the backend, import PDF, PPTX, or DOCX documents:

```bash
npm run build
npm run ingest -- "C:\path\requirements.pptx" "C:\path\guide.pdf"
```

The importer stores only extracted text, citation metadata, and vectors in MariaDB. Original files and local paths are not copied into the database. Re-importing the same file hash replaces its chunks. Authenticated clinicians can query `POST /api/rag/query`; all queries are audited. If the chat model is rate limited, the endpoint returns ranked source evidence with `generationMode: "retrieval-only"` instead of inventing an answer.
