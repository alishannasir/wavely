#!/bin/sh
# Nightly Postgres backup with rotation.
#   cron (3:00 every night):  0 3 * * * cd /opt/wavely && ./deploy/backup.sh >> backups/backup.log 2>&1
# Optional off-site copy: set BACKUP_RCLONE_REMOTE (e.g. "b2:my-bucket/wavely") and configure rclone.
# Restore:  gunzip -c backups/videochat-YYYY-MM-DD-HHMM.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d videochat
set -eu
DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
COMPOSE="${COMPOSE_CMD:-docker compose -f docker-compose.prod.yml}"
mkdir -p "$DIR"
FILE="$DIR/videochat-$(date +%F-%H%M).sql.gz"

$COMPOSE exec -T postgres pg_dump -U postgres -d videochat --no-owner | gzip > "$FILE.tmp"
# A broken dump must never replace a good one, or count as a backup.
gunzip -t "$FILE.tmp"
[ "$(gunzip -c "$FILE.tmp" | wc -c)" -gt 1000 ] || { echo "backup looks empty, aborting"; rm -f "$FILE.tmp"; exit 1; }
mv "$FILE.tmp" "$FILE"
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

find "$DIR" -name 'videochat-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE" && echo "$(date -Is) copied off-site to $BACKUP_RCLONE_REMOTE"
fi
