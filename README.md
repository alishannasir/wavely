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

## Free-tier limits

Caps come from the `plan_limits` table (never hardcoded). They apply to random matches **and** friend calls.
- A match is counted when the call starts; minutes are billed when it ends (rounded to the minute, instant skips are free).
- When a call starts, its deadline is whoever has the least free time left. LiveKit tokens are issued only for that long, and the server ends the call at the deadline: it sends `limit-reached`, removes both people from the LiveKit room (`LIVEKIT_URL` must be reachable with the API key) and tells the other person `peer-left`.
- The call screen shows a countdown from `limitSeconds` in the match payload.

## Screens

`/` landing · `/about` `/why` `/faq` `/rules` `/terms` `/privacy` (content; Terms/Privacy are placeholders) · `/login` `/signup` `/onboarding` · **`/chat`** (the main screen: idle with camera preview → searching → in call; `?friend=` / `?accept=` for friend calls) · `/friends` · `/upgrade` · `/unavailable`. The old `/home`, `/start`, `/call` redirect to `/chat`.

The product name, colours and fonts live in one place each: `frontend/src/brand.ts` (rename the product here), the CSS variables at the top of `frontend/src/index.css` (colour theme), `frontend/tailwind.config.js`, and the Google Fonts link in `frontend/index.html`.

### Trying video locally

Run a local LiveKit server and point `.env` at it (restart the backend afterwards):
```bash
docker run --rm --network host livekit/livekit-server --dev --bind 0.0.0.0   # ws://localhost:7880, key devkey, secret secret
# .env: LIVEKIT_URL=ws://localhost:7880  LIVEKIT_API_KEY=devkey  LIVEKIT_API_SECRET=secret
#       LIVEKIT_API_URL=http://host.docker.internal:7880   (only if the backend runs in docker compose)
```

## Layout

- `backend/src`: `auth`, `users`, `matching` (Socket.IO gateway, Redis queue, LiveKit tokens), `friends`, `payments`, `moderation`, `common/geo`
- `frontend/src`: `pages`, `lib`, `store`
