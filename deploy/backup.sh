#!/usr/bin/env bash
# Nightly backup of the game's database. Run from cron on the server:
#   1. dump the database (pg_dump, custom format: compressed, restorable in part)
#   2. copy the dump off the server, to the bucket named in .env (BACKUP_BUCKET)
#   3. keep only the newest 7 dumps on the server
set -euo pipefail

cd "$(dirname "$0")" # the folder holding compose.yaml and .env
BACKUP_DIR="$HOME/backups"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
NAME="game-$STAMP.dump"
BUCKET="$(grep -E '^BACKUP_BUCKET=' .env | cut -d= -f2)"
HEARTBEAT="$(grep -E '^BACKUP_HEARTBEAT_URL=' .env | cut -d= -f2- || true)"

# Tell the monitoring service how this run ended: a ping on success, /fail on
# any error. Without a URL, do nothing (for example on a fresh server).
heartbeat() {
  [ -n "$HEARTBEAT" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEARTBEAT$1" || true
}
trap 'heartbeat /fail' ERR

if [ -z "$BUCKET" ]; then
  echo "BACKUP_BUCKET is missing from .env" >&2
  exit 1
fi

umask 077 # backups contain players' data: readable by this user only
mkdir -p "$BACKUP_DIR"
trap 'rm -f "$BACKUP_DIR/$NAME.partial"' EXIT # never leave a half-written dump

# 1. Dump inside the Postgres container; write to .partial first, so a failed
#    dump never looks like a good one.
docker compose exec -T postgres pg_dump -U game -d game --format=custom \
  > "$BACKUP_DIR/$NAME.partial"
mv "$BACKUP_DIR/$NAME.partial" "$BACKUP_DIR/$NAME"

# 2. Off the server.
aws --profile game-backup s3 cp "$BACKUP_DIR/$NAME" "s3://$BUCKET/db/$NAME" --only-show-errors

# 3. Keep the newest 7 here; the bucket keeps everything.
ls -1t "$BACKUP_DIR"/game-*.dump | tail -n +8 | xargs -r rm --

echo "$(date -u +%FT%TZ) backup ok: $NAME ($(du -h "$BACKUP_DIR/$NAME" | cut -f1)) to s3://$BUCKET/db/"
heartbeat ""