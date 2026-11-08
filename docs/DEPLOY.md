# Deploying Wavely

Recommended beta setup (about €6/month): **one small VPS** (e.g. Hetzner) running `docker-compose.prod.yml`,
**Cloudflare** (free) in front, **LiveKit Cloud** (free plan) for video, **Resend** for email.

## 1. Server
1. Create a VPS (2 vCPU / 4 GB is plenty to start), install Docker + the compose plugin, clone the repo.
2. `cp .env.example .env` and set at least:
   - `DOMAIN=app.example.com`
   - `POSTGRES_PASSWORD`, `REDIS_PASSWORD` (long random strings), `JWT_SECRET` (`openssl rand -hex 32`)
   - `TRUST_PROXY=true` (only once Cloudflare is in front, see below)
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (section 3)
   - Stripe and Google keys when you use them (section 4)
3. `docker compose -f docker-compose.prod.yml up -d --build`. The API applies database migrations and seeds the plan limits on every start. Only ports 80/443 are published; Postgres and Redis are not reachable from outside.
4. Check `https://DOMAIN/api/health` returns `{"status":"ok","db":"up","redis":"up"}`.

Update later: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.

## 2. Cloudflare
1. Add the domain, create a proxied (orange cloud) `A` record to the server, set SSL/TLS mode to **Full (strict)**. Caddy gets its certificate automatically (port 80 must be reachable).
2. **Lock the origin to Cloudflare**: firewall ports 80/443 so only [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) can connect. Without this anyone could reach the server directly and fake the `CF-Connecting-IP` / `CF-IPCountry` headers, which would defeat IP bans and country blocking.
3. Then set `TRUST_PROXY=true` and restart the backend.
4. Turn on IP Geolocation (country header). To block by US state later, enable the "Add visitor location headers" managed transform (check it is available on your plan).
5. LiveKit hostnames must stay **DNS-only** (grey cloud): Cloudflare does not proxy WebRTC/TURN traffic.

## 3. LiveKit Cloud (video)
Create a project at livekit.io, then put the project's `wss://…livekit.cloud` URL, API key and API secret in `.env` (`LIVEKIT_API_URL` can stay empty: it defaults to `LIVEKIT_URL`). The free plan allows roughly 35-40 hours of 1:1 calls per month; check the current limits on their pricing page. Test one call over mobile data (TURN fallback) before launch.

## 4a. Email
Verification, password reset and security notices need real email. Pick a provider (Resend is the easiest start: 3,000 mails a month free), verify your sending domain there (it gives you DNS records for SPF/DKIM), then in `.env`:
- Resend API: `MAIL_TRANSPORT=resend`, `RESEND_API_KEY=...`, `MAIL_FROM="Wavely <no-reply@yourdomain.com>"`
- or any SMTP provider (Postmark, Amazon SES, Mailgun...): `MAIL_TRANSPORT=smtp`, `MAIL_SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`.
Once real delivery is configured, friends, messages and payments require a confirmed email (`REQUIRE_EMAIL_VERIFICATION` overrides this). Send yourself a verification and a reset email before launch and check they reach the inbox, not spam. Do not switch to the `console` transport in production: nobody would receive anything.

## 4. Payments and login
- **Stripe:** live keys + `STRIPE_PRICE_MONTHLY/ANNUAL`; webhook endpoint `https://DOMAIN/api/billing/webhook` (events: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.updated/deleted`), its secret in `STRIPE_WEBHOOK_SECRET`.
- **Google:** OAuth client with redirect URI `https://DOMAIN/api/auth/google/callback`, and `GOOGLE_CALLBACK_URL` set to the same.

## 5. Backups and monitoring
- Nightly backup: `0 3 * * * cd /opt/wavely && ./deploy/backup.sh >> backups/backup.log 2>&1` (14 days kept; set `BACKUP_RCLONE_REMOTE` to also copy off the server, which you should: a backup on the same disk is not a backup). Restore instructions are at the top of `deploy/backup.sh`. Test a restore before you need one.
- Uptime: point an external monitor (UptimeRobot, Better Stack...) at `/api/health` (it returns 503 if Postgres or Redis is down).
- Logs: `docker compose -f docker-compose.prod.yml logs -f backend`. They hold one line per request (method, path, status, time) with no IPs, query strings, bodies or tokens.
- Error tracking (e.g. Sentry) is not wired in yet.

## 6. Security notes
- The website sends a `Content-Security-Policy-Report-Only` header (see `frontend/Caddyfile`). Browse the whole app with the browser console open, fix or allow anything it reports, then rename it to `Content-Security-Policy`.
- Rate limits are per IP and kept in memory per API instance (fine for one server). Tune with `THROTTLE_LIMIT`.
- Set `NODE_ENV=production` (the compose file does): it turns off the "any localhost origin" CORS rule.
- Blocked regions, age assurance and evidence handling: see `docs/MODERATION.md`.

## Alternative: Railway (API, Postgres, Redis) + Cloudflare Pages (website)

Use this instead of sections 1-2 if you do not want to run a server. Example domain: `wavely.space` (bought at GoDaddy).
Website: `https://wavely.space`. API: `https://api.wavely.space`. They must share the registrable domain, because the login cookie is SameSite=Lax.

### A. Put the domain on Cloudflare
1. Cloudflare: **Add a site** -> `wavely.space` -> Free plan. Cloudflare shows two nameservers.
2. GoDaddy: **My Products -> wavely.space -> DNS -> Nameservers -> Change -> I'll use my own nameservers**, paste Cloudflare's two. It can take from minutes to a day.
3. Cloudflare **SSL/TLS** mode: **Full (strict)**.

### B. Railway: API, Postgres, Redis
1. New project -> **Deploy from GitHub repo** (`alishannasir/wavely`). Service settings: **Root Directory** `backend`, builder **Dockerfile** (`backend/Dockerfile`). The container applies migrations and seeds plan limits on every start, so no extra step.
2. Add **PostgreSQL** and **Redis** from the project's *New* menu.
3. API service **Variables** (use Railway references so the private network is used):
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `REDIS_URL=${{Redis.REDIS_URL}}` (use the private/internal variants, not the public proxy ones)
   - `JWT_SECRET` (`openssl rand -hex 32`), `PORT=3000`
   - `FRONTEND_URL=https://wavely.space` (exact origin: used for CORS, the CSRF origin check and email links)
   - `TRUST_PROXY=true`, `GEO_STRICT=true` (only after section D is done)
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (LiveKit Cloud)
   - `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `MAIL_FROM="Wavely <no-reply@wavely.space>"` (verify `wavely.space` in Resend first, or mail only reaches your own address)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=https://api.wavely.space/api/auth/google/callback`
   - `STRIPE_*` when you take payments, `ADMIN_EMAILS`, `BRAND_NAME`
4. **Settings -> Networking -> Custom Domain**: `api.wavely.space`, port 3000. Railway shows a CNAME target; add it in Cloudflare DNS as a **proxied (orange cloud)** CNAME named `api`.
5. Health check path: `/api/health`. One replica is plenty for the beta. The API already uses a Redis adapter for Socket.IO, so more replicas can be added later; load-test matching before you rely on that.
6. Check `https://api.wavely.space/api/health` returns `{"status":"ok","db":"up","redis":"up"}`.

### C. Cloudflare Pages: the website
1. Workers & Pages -> **Create -> Pages -> Connect to Git** -> the repo.
2. Build settings: **Root directory** `frontend`, **Build command** `npm run build`, **Output directory** `dist`. Single-page-app routing works without extra files.
3. **Environment variables** (Production), needed at build time:
   - `VITE_API_URL=https://api.wavely.space/api`
   - `VITE_WS_URL=https://api.wavely.space`
   - `NODE_VERSION=20`
4. **Custom domains**: add `wavely.space` (and `www.wavely.space`, redirecting to the bare domain).
5. Changing a `VITE_` variable needs a new deploy.

### D. Security and country blocking
- The country comes from Cloudflare's `CF-IPCountry` header and the real IP from `CF-Connecting-IP`; both are trusted when `TRUST_PROXY=true`. That is only safe if nobody can reach the API without going through Cloudflare. **Railway cannot firewall to Cloudflare's IP ranges**, so remove Railway's generated `*.up.railway.app` public domain from the API service once the custom domain works, and keep Postgres/Redis on the private network only.
- **Origin secret (do this, it closes the gap):** Cloudflare adds a secret header to every request it forwards, and the API refuses requests without it. Set it up in this order, or you lock yourself out:
  1. Make up a long random value (`openssl rand -hex 32`).
  2. Cloudflare -> `wavely.space` -> **Rules -> Transform Rules -> Modify Request Header -> Create rule**. Name it "Origin secret". Condition: **Hostname equals** `api.wavely.space`. Action: **Set static** header `X-Origin-Secret` = the value. Deploy the rule.
  3. Railway -> `wavely` service -> Variables -> `ORIGIN_SECRET` = the same value. Deploy.
  4. Check: `curl -i https://api.wavely.space/api/auth/guest` still works from the website, and requests sent straight to Railway's address (or without the header) get `403 Forbidden`. `/api/health` stays open for Railway's health check.
  To rotate: update the Cloudflare rule first, then Railway.
- Cloudflare: turn on **Bot Fight Mode**, add a rate-limit rule for `/api/auth/*`, and keep LiveKit hostnames DNS-only (grey cloud).

### E. Other services that need the new addresses
- **Google Cloud console**: authorised JavaScript origin `https://wavely.space`, redirect URI `https://api.wavely.space/api/auth/google/callback`.
- **Stripe**: webhook endpoint `https://api.wavely.space/api/billing/webhook`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- **LiveKit Cloud**: nothing to change.
- **Backups**: check your Railway plan for Postgres backups; otherwise run `deploy/backup.sh` (pg_dump) on a schedule and keep the dumps off Railway.

## Login cookie

The login token is kept in an HttpOnly, SameSite=Lax cookie named `ovc_session` (Secure on https), so page scripts cannot read it.
The website and the API must be on the same site (for example `app.example.com` and `api.example.com`), or SameSite=Lax cookies will not be sent.
`FRONTEND_URL` must list the exact website origin (it is used for CORS with credentials and the CSRF origin check).

## Production and staging (two branches, two domains)

| | Production | Staging |
|---|---|---|
| Git branch | `main` | `staging` |
| Website | `https://wavely.space` | `https://staging.wavely.space` |
| API | `https://api.wavely.space` | `https://staging-api.wavely.space` |
| Railway | environment `production` | environment `staging` (own Postgres + Redis) |
| Cloudflare Worker | `wavely` | `wavely-staging` |

Use `staging-api` (not `api.staging`): Cloudflare's free certificate only covers one subdomain level. All hosts share `wavely.space`, so the login cookie still works.

**Workflow:** work on feature branches -> merge into `staging` -> test on staging -> merge `staging` into `main` -> production deploys.

### Railway
1. Project -> **Environments -> New Environment** -> name `staging` (duplicate `production`; it gets its own Postgres and Redis, never share data).
2. In the `staging` environment, API service -> **Settings -> Source -> Branch** = `staging`. In `production` it stays `main`.
3. Staging variables differ from production: `FRONTEND_URL=https://staging.wavely.space`, a **different** `JWT_SECRET`, `GOOGLE_CALLBACK_URL=https://staging-api.wavely.space/api/auth/google/callback`, Stripe **test** keys + test webhook secret, `MAIL_TRANSPORT=console` (or a Resend sandbox) so tests never email real people. With `console` in production the email text is hidden from the logs (it holds working verification and reset links), so also set `MAIL_CONSOLE_LOG_BODY=true` on staging if you want to copy the links from the log, `ORIGIN_SECRET` its own value.
4. Custom domain `staging-api.wavely.space` (port 3000) -> proxied CNAME `staging-api` in Cloudflare. Add an Origin-secret transform rule for hostname `staging-api.wavely.space` (see section D).

### Cloudflare (website)
Workers & Pages -> **Create -> Import a repository** a second time, same repo:
- Production Worker `wavely`: branch `main`, root `frontend`, build `npm run build`, deploy `npx wrangler deploy`, variables `VITE_API_URL=https://api.wavely.space/api`, `VITE_WS_URL=https://api.wavely.space`.
- Staging Worker `wavely-staging`: branch `staging`, root `frontend`, build `npm run build`, deploy `npx wrangler deploy --env staging`, variables `VITE_API_URL=https://staging-api.wavely.space/api`, `VITE_WS_URL=https://staging-api.wavely.space`.
- Disable non-production branch builds on the production Worker so only `main` deploys there. The `staging.wavely.space` custom domain is created by `wrangler.jsonc` on deploy.

### Other services
- **Google OAuth**: add origin `https://staging.wavely.space` and redirect `https://staging-api.wavely.space/api/auth/google/callback` to the same client (or make a separate client).
- **Stripe**: test-mode webhook -> `https://staging-api.wavely.space/api/billing/webhook`.
- Protect staging from public indexing/use: put **Cloudflare Access** (free) in front of `staging.wavely.space`, and keep `main` branch protected on GitHub (merge by PR only).
