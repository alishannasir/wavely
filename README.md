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

Redis-backed matching tests are skipped unless you point them at a throwaway Redis (they flush it!):
`REDIS_URL_TEST=redis://127.0.0.1:6390 npm test`.

```bash
cd backend  && npm run typecheck && npm test
cd frontend && npm run typecheck && npm test
```

## Auth notes

Login is optional. **Guests** (`POST /api/auth/guest`, 18+ and rules attested, 4h token, capped per IP/device per day) get random video chat only: no filters, friends, messages or billing. A guest can upgrade to a full account (`POST /api/auth/upgrade-guest`). Stale guests with no reports are purged after 7 days.


Google login redirects back with a single-use 60-second `?code=`, which the frontend exchanges via `POST /api/auth/exchange`. JWTs never appear in URLs.

## Layout

- `backend/src`: `auth`, `users`, `matching` (Socket.IO gateway, Redis queue, LiveKit tokens), `friends`, `payments`, `moderation`, `common/geo`
- `frontend/src`: `pages`, `lib`, `store`
