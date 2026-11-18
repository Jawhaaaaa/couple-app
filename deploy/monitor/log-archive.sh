#!/usr/bin/env bash
# Логийн 30 хоногийн хадгалалт (OPS-AURA-006, AC-202). Docker `json-file` нь хэмжээгээр эргэлддэг
# (үйлчилгээ бүр 10 × 20 MB) тул ачаалал ихтэй үед 30 хоног хүрэхгүй байж болно — өдөр бүр
# өмнөх 24 цагийн логийг gzip-ээр хадгалж, LOG_RETENTION_DAYS-ээс хуучныг устгана.
# Cron (00:05 UTC):
#   5 0 * * * /opt/aura/deploy/monitor/log-archive.sh >> /var/log/aura/log-archive.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
DC=(docker compose -f "$ROOT/deploy/docker-compose.prod.yml" --env-file "$ENV_FILE")
DIR="${LOG_ARCHIVE_DIR:-/var/log/aura/archive}"
KEEP="${LOG_RETENTION_DAYS:-30}"
mkdir -p "$DIR"

day=$(date -u -d yesterday +%F)
for svc in caddy backend postgres seaweedfs; do
  out="$DIR/$day-$svc.log.gz"
  [ -s "$out" ] && continue
  "${DC[@]}" logs --no-log-prefix --timestamps --since "${day}T00:00:00Z" --until "$(date -u +%F)T00:00:00Z" "$svc" \
    | gzip -9 > "$out.tmp" && mv "$out.tmp" "$out"
done
find "$DIR" -name '*.log.gz' -mtime +"$KEEP" -delete
echo "$(date -u +%FT%TZ) лог архивлав: $DIR/$day-*.log.gz"
