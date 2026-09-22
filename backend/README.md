# Backend

Small Express authentication API using the existing `doctor_platform.users` table. No database schema changes are performed.

## Setup

```bash
cd backend
npm ci
cp .env.example .env
```

Edit `.env` with your local MySQL credentials and a random `JWT_SECRET` of at least 32 characters. The current code expects the existing `users` columns `id`, `username`, `password_hash`, `name`, `role`, and `status`; `status='active'` allows login. Check the actual table before running if it differs from the provided schema.

```bash
npm run build
npm start
```

The server checks the `users` table at startup and listens at `http://127.0.0.1:3000` by default. To create an account, run `npm run create-user` from `backend/` (or the root command of the same name). Passwords are stored as Argon2id hashes.

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

JWTs expire after 2 hours. Logout only tells the client to discard the token; an already issued token remains valid until expiry. The frontend still uses its demo login and is not connected to these endpoints yet.

Run `npm run build && npm test` for the backend tests.
