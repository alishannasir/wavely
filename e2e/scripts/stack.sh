#!/usr/bin/env bash
# Starts / stops the full stack for the end-to-end tests on separate ports (never touches your dev stack):
#   Postgres 55440, Redis 56440, Mailpit 1125 (SMTP) / 8125 (web+API), LiveKit 17880, API 3990, website 5190.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
E2E="$ROOT/e2e"
RUN="$E2E/.run"
mkdir -p "$RUN"
COMPOSE="docker compose -p ovc-e2e -f $E2E/docker-compose.e2e.yml"

kill_pidfile() { [ -f "$1" ] && kill "$(cat "$1")" 2>/dev/null || true; rm -f "$1"; }
kill_port() { local p; p=$(lsof -ti :"$1" -sTCP:LISTEN 2>/dev/null || true); [ -n "$p" ] && kill $p 2>/dev/null || true; }

wait_http() { # url name seconds
  for _ in $(seq 1 "$3"); do curl -fsS -m 2 "$1" >/dev/null 2>&1 && return 0; sleep 1; done
  echo "timed out waiting for $2 ($1)"; return 1
}

case "${1:-}" in
up)
  $COMPOSE up -d --wait
  export DATABASE_URL="postgresql://postgres:e2e@127.0.0.1:55440/videochat"
  (cd "$ROOT/backend" && sh scripts/migrate.sh >"$RUN/migrate.log" 2>&1 && npm run prisma:seed >>"$RUN/migrate.log" 2>&1)

  kill_port 3990; kill_port 5190
  (cd "$ROOT/backend" && \
    REDIS_URL="redis://127.0.0.1:56440" JWT_SECRET="$(printf 'e%.0s' {1..40})" PORT=3990 \
    FRONTEND_URL="http://localhost:5190" LIVEKIT_URL="ws://localhost:17880" LIVEKIT_API_URL="http://localhost:17880" \
    LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret \
    MAIL_TRANSPORT=smtp MAIL_SMTP_HOST=127.0.0.1 MAIL_SMTP_PORT=1125 MAIL_FROM="Wavely <no-reply@wavely.test>" \
    REQUIRE_EMAIL_VERIFICATION=true THROTTLE_DISABLED=true MAIL_LIMIT_PER_IP=1000 MAIL_LIMIT_PER_ADDRESS=1000 \
    GUEST_PER_IP_PER_DAY=100000 GUEST_PER_DEVICE_PER_DAY=100000 STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=w \
    MM_RELAX_COUNTRY_MS=3600000 MM_RELAX_GENDER_MS=3600000 \
    nohup npx ts-node src/main.ts >"$RUN/backend.log" 2>&1 & echo $! >"$RUN/backend.pid")
  # The tests run against a production build (what users get), not the slower development server.
  (cd "$ROOT/frontend" && VITE_API_URL="http://localhost:3990/api" VITE_WS_URL="http://localhost:3990" \
    npx vite build --outDir "$RUN/web" --emptyOutDir >"$RUN/frontend-build.log" 2>&1) || { tail -20 "$RUN/frontend-build.log"; exit 1; }
  (cd "$ROOT/frontend" && nohup npx vite preview --outDir "$RUN/web" --port 5190 --strictPort --host 127.0.0.1 >"$RUN/frontend.log" 2>&1 & echo $! >"$RUN/frontend.pid")
  wait_http "http://localhost:3990/api/health" "the API" 120
  wait_http "http://localhost:5190/" "the website" 60
  echo "e2e stack is up: site http://localhost:5190, API http://localhost:3990, mail http://localhost:8125"
  ;;
down)
  kill_pidfile "$RUN/backend.pid"; kill_pidfile "$RUN/frontend.pid"; kill_port 3990; kill_port 5190
  $COMPOSE down -v >/dev/null 2>&1 || true
  echo "e2e stack stopped"
  ;;
*) echo "usage: stack.sh up|down"; exit 1 ;;
esac
