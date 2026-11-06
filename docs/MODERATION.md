# Moderation

## Reports
- A report needs a real `sessionId` that included both users. One report per reporter/target/session; max 10 reports/hour/reporter.
- The client attaches a small JPEG frame of the reported user's video. The last 50 in-call chat lines are attached by the **server** from its own record of the call (never from the client), labelled `reporter` / `reported`. Chat is relayed by the server (`call-chat`), max 500 chars per line, 20 lines per 10s per user.
- **Flagging:** 3+ distinct reporters (accounts older than 24h) in 24h put the user in the *shadow queue* for 24h: they are only matched with other flagged users.
- **Auto-suspend:** only for `NUDITY` / `MINOR_CONCERN` reports **filed by people** (`source = USER`; classifier reports never suspend), `REPORT_AUTO_SUSPEND_THRESHOLD` (default 5) distinct aged reporters in 24h. A moderator can restore.
- Everything else waits for a moderator: `GET /api/admin/reports`, `GET /api/admin/reports/:id` (with evidence), `POST /api/admin/reports/:id/resolve` with `DISMISS | SUSPEND | BAN | RESTORE`.
- Give someone moderator rights: `UPDATE users SET role = 'MODERATOR' WHERE email = '...';`

## Bans
- `BAN` sets the account to BANNED and bans the user's last-seen **device id** (90 days) and **IP** (7 days; IPs are shared, so they expire fast). Checked on every HTTP request (global `BanGuard`) and on socket connect. `RESTORE` lifts both.
- Device ids are client-generated (localStorage), so they only stop casual evasion.
- IP comes from the socket address. Set `TRUST_PROXY=true` only when the app is reachable exclusively through Cloudflare / a reverse proxy that sets `CF-Connecting-IP` / `X-Forwarded-For`; otherwise those headers are spoofable.

## Evidence retention and escalation (needs a legal decision)
- Evidence is deleted `EVIDENCE_RETENTION_DAYS` (default **30**) after the report, by an hourly job.
- Reports of `MINOR_CONCERN` or suspected CSAM are a legal matter: decide with counsel the retention period and the reporting path (e.g. NCMEC CyberTipline in the US, IWF in the UK) **before launch**. Deleting evidence on a fixed timer may be inappropriate for those cases. This is not implemented in code.

## Rules
Users must accept the rules (`rulesAcceptedAt`) and have a birthdate with age >= 18 before matching or friend-calling.

## NSFW scanning (client-side, Phase 4)
- While in a call, the viewer's browser samples the stranger's video every 3s and classifies it with the bundled NSFWJS MobileNetV2 model (lazy-loaded, ~3.5 MB, no CDN, nothing leaves the device). `Porn + Hentai >= 0.7` on two consecutive samples hides the video (blur) and lets the viewer skip or show it anyway. "Sexy" is ignored (too many false positives).
- The client then sends `nsfw-flag`. The server only accepts it for the call that socket is in and about that call's peer, and turns it into a `Report` with `source = AUTO_NSFW`, reason `NUDITY`, the score and the frame as evidence. It uses the same rules as manual reports (one per reporter/target/session, its own rate limit of 30/hour), but only counts toward the shadow-queue flag, never toward suspension. If the same person later files their own report for that call, it replaces the automatic one (their reason and evidence win). A modified client can therefore do no more harm than a malicious reporter.
- Limits: it protects the viewer and produces evidence, but it cannot stop a determined sender, and accuracy is modest (false positives and misses). Treat `AUTO_NSFW` reports as a signal for moderators, not proof.
- Upgrade path: swap in a server-side moderation API (Hive, Sightengine, AWS Rekognition) by sampling frames from LiveKit Egress and calling `ReportsService.createAutoNsfw`-style logic. Needs an account and a budget.

## Regions and age assurance
- Access is limited to an allow-list of countries (`ALLOWED_COUNTRIES`, default in `common/geo/geo.config.ts`). **The UK is blocked by default**: the Online Safety Act expects real age assurance, and a self-declared birthdate does not meet it.
- Some US states also have age-verification laws. Country-level blocking cannot see US states; with Cloudflare you can add the "visitor location headers" managed transform and block by `cf-region-code`. Not implemented yet. Get legal advice for which states apply to a random video chat.
- Age verification (e.g. a facial-age-estimation provider) is an open decision. Until it exists, keep these regions blocked.
- The country comes from Cloudflare's `CF-IPCountry` header and is only trusted when `TRUST_PROXY=true`, so production must sit behind Cloudflare with the origin locked down.
