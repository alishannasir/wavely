# End-to-end tests

Real browsers (Playwright + Chromium with a fake camera and microphone) against the real stack: the API,
PostgreSQL, Redis, **LiveKit** (real WebRTC video between two browsers) and **Mailpit** (real emails). The stack
runs on its own ports, so it never touches your dev environment:

| Service | Port |
|---|---|
| website (production build) | 5190 |
| API | 3990 |
| PostgreSQL / Redis | 55440 / 56440 |
| LiveKit | 17880 |
| Mailpit (SMTP / web + API) | 1125 / 8125 |

## Run

```bash
cd e2e
npm install
npx playwright install chromium     # once (downloads the browser)
npm run e2e                         # starts the stack, runs everything, stops the stack
```

Handy variants:

```bash
npm run stack:up                    # start the stack and keep it running (rebuilds the website each time)
npx playwright test tests/call.spec.ts --project=desktop
npx playwright test -g "report"     # tests whose name contains "report"
npx playwright show-report report   # HTML report (screenshots and traces of failures)
npm run stack:down
```

After you change the website while the stack is up, rebuild it:
`cd ../frontend && VITE_API_URL=http://localhost:3990/api VITE_WS_URL=http://localhost:3990 npx vite build --outDir ../e2e/.run/web --emptyOutDir`.
The API is not hot-reloaded: run `npm run stack:down && npm run stack:up` after backend changes.

## What is covered

| File | Flows |
|---|---|
| `call.spec.ts` | guest start (rules notice), own camera, two people meet with **live video both ways**, text chat, Esc = next, Stop, a closed tab ends the call, signed-out redirect |
| `safety.spec.ts` | report with screenshot + server-recorded chat log, block (never matched again, unblock in Profile), **free minutes run out** (countdown, call ended, upgrade prompt, new search refused) |
| `account.spec.ts` | sign up + email confirmation by link, forgot/reset password by email, change password (old session dies), download my data, delete account |
| `moderation.spec.ts` | role gate, a report from a call to the moderator queue, evidence viewer, legal hold, ban, audit log |
| `appeal.spec.ts` | banned user appeals from the login page, moderator approves, user logs in again |
| `mobile.spec.ts` | phone layout: tab bar, profile tab, no sideways scrolling, tab bar hidden during a call |

## Notes

- Matching is global, so tests run **one at a time**. `resetRuntime()` clears Redis (queue, presence, calls) before tests that match people.
- Banning a user also bans their IP, and all tests share one IP, so specs that ban lift the bans afterwards.
- The API runs with `THROTTLE_DISABLED=true` and high mail/guest limits (never honoured in production).
- A call takes about 5 seconds to connect; most tests spend their time waiting for that.
- Not covered: Google sign-in (needs a real Google login), Stripe checkout, real email delivery, and Safari/Firefox.
