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
The database schema is managed with Prisma migrations (`backend/prisma/migrations`). `docker compose up` applies them automatically (`npm run migrate` does the same by hand, and also baselines a database that was created with the old `db push` setup). After changing `schema.prisma`, create a migration with `cd backend && npx prisma migrate dev --name what_changed` and commit the new folder.
Video needs a LiveKit server (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
For Stripe webhooks locally: `stripe listen --forward-to localhost:3000/api/payments/webhook`.

## Without Docker

```bash
cd backend && npm install && npx prisma generate && npx prisma db push && npm run start:dev
```

The backend reads `.env` from `backend/` or the repo root.

## Account features

Email verification, forgot/reset password, change password/email, data export and account deletion live under `/account` (and the email links under `/verify-email`, `/reset-password`, `/confirm-email`). Emails go through `MAIL_TRANSPORT` (see `.env.example`). Locally the default prints them in the API log; for a real inbox view run `docker compose --profile mail up` and set `MAIL_TRANSPORT=smtp`, `MAIL_SMTP_HOST=mailpit`, `MAIL_SMTP_PORT=1025`, then open http://localhost:8025. Changing a password or email signs the account out on every other device. Deleting an account erases personal data; users who appear in safety reports are anonymised instead so the records and legal holds stay intact.

## Production

`docker-compose.prod.yml` builds production images and runs Caddy (website + HTTPS), the API, Postgres and Redis. Step-by-step setup, Cloudflare, LiveKit, backups and monitoring: **docs/DEPLOY.md**.

## End-to-end tests

`cd e2e && npm run e2e` runs real browsers against the real stack (video between two browsers, email, reports, moderation, appeals, phone layout) on separate ports. See `e2e/README.md`.

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
