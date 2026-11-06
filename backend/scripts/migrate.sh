#!/bin/sh
# Applies database migrations. Safe on a fresh database AND on one that was created earlier with
# `prisma db push` (the old dev setup): that case is detected (Prisma error P3005) and the baseline
# migration is marked as already applied before deploying.
set -e
if OUT=$(npx prisma migrate deploy 2>&1); then
  echo "$OUT"
  exit 0
fi
echo "$OUT"
if echo "$OUT" | grep -q "P3005"; then
  echo "[migrate] existing database without migration history: baselining 0_init"
  npx prisma migrate resolve --applied 0_init
  npx prisma migrate deploy
else
  exit 1
fi
