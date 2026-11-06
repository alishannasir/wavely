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
