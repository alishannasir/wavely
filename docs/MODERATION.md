# Moderation

## Reports
- A report needs a real `sessionId` that included both users. One report per reporter/target/session; max 10 reports/hour/reporter.
- The client attaches a small JPEG frame of the reported user's video. The last 50 in-call chat lines are attached by the **server** from its own record of the call (never from the client), labelled `reporter` / `reported`. Chat is relayed by the server (`call-chat`), max 500 chars per line, 20 lines per 10s per user.
- **Flagging:** 3+ distinct reporters (accounts older than 24h) in 24h put the user in the *shadow queue* for 24h: they are only matched with other flagged users.
- **Auto-suspend:** only for `NUDITY` / `MINOR_CONCERN` reports **filed by people** (`source = USER`; classifier reports never suspend), `REPORT_AUTO_SUSPEND_THRESHOLD` (default 5) distinct aged reporters in 24h. A moderator can restore.
- Everything else waits for a moderator: `GET /api/admin/reports`, `GET /api/admin/reports/:id` (with evidence), `POST /api/admin/reports/:id/resolve` with `DISMISS | SUSPEND | BAN | RESTORE`.
- Give someone moderator rights: `UPDATE users SET role = 'MODERATOR' WHERE email = '...';`

## Moderator interface (`/admin`)
Moderators and administrators see a **Moderation** row on their Profile page. It has a report **queue** (filters, paging; keyboard: `j`/`k`/Enter, and `d`/`s`/`b` on a report), a **report review** page (evidence frame, chat log, reporter and reported-user context, decisions, history), **user search** (by id, email, name, IP or device) with a user page, and an **audit log**. Every decision asks for confirmation and is written to the audit log (`audit_logs`, append-only).
- Roles: `USER`, `MODERATOR`, `ADMIN`. The first administrator is created by listing their email in `ADMIN_EMAILS` (register first, then restart the API). Administrators manage roles on a user's page. Only administrators can release a legal hold, and moderators cannot act on administrators.
- API: `GET /api/admin/reports[/counts|/:id]`, `POST /api/admin/reports/:id/{resolve,escalate,release-hold}`, `GET /api/admin/users[/:id]`, `POST /api/admin/users/:id/{status,role}`, `GET /api/admin/audit`.

## Blocking
Anyone (including guests) can block the person they are talking to (**Block** in a call) and manage the list in **Profile > Blocked people**. A block is symmetric in effect: the two are never matched again, cannot send each other friend requests or messages, and an existing friendship is removed. The other person is not told. The database (`blocks`) is the source of truth; Redis sets `mm:block:<userId>` mirror it for the matching script and are rebuilt when the API starts. Blocking does not tell moderators anything: use **Report** for rule-breaking.

## Appeals
A suspended or banned user cannot log in, so they go to **/appeal**, sign in with email and password, see their status and send a message (20-2000 characters). One appeal is open at a time and a rejected user waits `APPEAL_COOLDOWN_DAYS` (default 7) before appealing again. Moderators decide in **Moderation > Appeals** (approve restores the account and lifts its device/IP bans; reject keeps it; both can carry a note the user sees). Decisions are in the audit log.
- The appeal endpoints skip the ban check (a device or IP ban would otherwise lock people out of appealing) and are rate limited: 8 requests a minute per IP and 10 password attempts an hour per email.
- Limitation: only accounts with an email and password can appeal here. Guest sessions and Google-only accounts have nothing to sign in with.
- Nobody is emailed about the outcome yet (there is no email sending); users have to come back to the page.

## Evidence retention (defaults, change with counsel)
- Normal reports: evidence is deleted **30 days** after the report (`EVIDENCE_RETENTION_DAYS`).
- Reports that led to a suspension or ban: **90 days** after the decision (`EVIDENCE_ACTIONED_RETENTION_DAYS`).
- **Possible-minor reports are never auto-deleted until a moderator has decided them.**
- **Escalate** puts a report under **legal hold**: its evidence is never auto-deleted until an administrator releases it (then the normal 30 days apply). Escalation only *preserves* the evidence; filing with NCMEC (US) / IWF (UK) or another authority is still a manual step, and registering with them as a provider is something to do before launch.

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
