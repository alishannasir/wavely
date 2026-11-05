# online-video-chat

Random 1:1 video chat (Omegle/Ome.tv style) with friends, messaging, Stripe subscriptions, reports and geo-blocking.

**Stack:** NestJS + Socket.IO + Prisma/Postgres + Redis + LiveKit (media) + Stripe · React + Vite + zustand.

## Quick start

```bash
cp .env.example .env
# set JWT_SECRET (openssl rand -hex 32), POSTGRES_PASSWORD, REDIS_PASSWORD
# and fill in LiveKit / Google / Stripe keys
docker compose up          # Postgres, Redis, backend on :3000
cd frontend && npm install && npm run dev   # frontend on :5173
```

The backend refuses to start without a `JWT_SECRET` of at least 32 characters.
Video needs a LiveKit server (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
For Stripe webhooks locally: `stripe listen --forward-to localhost:3000/api/payments/webhook`.

## Without Docker

```bash
cd backend && npm install && npx prisma generate && npx prisma db push && npm run start:dev
```

The backend reads `.env` from `backend/` or the repo root.

## Tests and checks

```bash
cd backend  && npm run typecheck && npm test
cd frontend && npm run typecheck && npm test
```

## Auth notes

Google login redirects back with a single-use 60-second `?code=`, which the frontend exchanges via `POST /api/auth/exchange`. JWTs never appear in URLs.

## Layout

- `backend/src`: `auth`, `users`, `matching` (Socket.IO gateway, Redis queue, LiveKit tokens), `friends`, `payments`, `moderation`, `common/geo`
- `frontend/src`: `pages`, `lib`, `store`
