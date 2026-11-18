#!/usr/bin/env bash
# Сэрэмжлүүлгийн дүрэм (OPS-AURA-005, AC-202, docs/OPERATIONS.md §Сэрэмжлүүлэг). Cron 5 мин тутам:
#   */5 * * * * /opt/aura/deploy/monitor/alerts.sh >> /var/log/aura/alerts.log 2>&1
#
#   http_5xx     — сүүлийн 5 мин-д 5xx > 1% (Caddy access log, ≥ ALERT_MIN_REQUESTS хүсэлт)
#   http_p95     — сүүлийн 5 мин-д /api/* p95 > 1 с (/ws ба chunk upload-ыг хасна)
#   disk         — /, docker, BACKUP_DIR-ийн аль нэг > 80%
#   backup       — сүүлийн амжилттай pg_dump > 26 ц, эсвэл сүүлийн оролдлого амжилтгүй
#   restore_test — сүүлийн амжилттай сэргээх тест > 8 хоног
#   backend      — backend контейнер healthy биш
# Илгээх: `logger -t aura-alert` (syslog) + ALERT_WEBHOOK_URL (ntfy.sh г.м., text/plain POST).
# Төлөв өөрчлөгдөхөд л (FIRING ↔ RESOLVED) илгээнэ; FIRING хэвээр бол цаг тутам сануулна.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
env_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"; }
DC=(docker compose -f "$ROOT/deploy/docker-compose.prod.yml" --env-file "$ENV_FILE")

BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/aura}"
WEBHOOK="${ALERT_WEBHOOK_URL:-$(env_get ALERT_WEBHOOK_URL)}"
STATE_DIR="${ALERT_STATE_DIR:-/var/lib/aura-alerts}"
MIN_REQ="${ALERT_MIN_REQUESTS:-20}"
mkdir -p "$STATE_DIR"

notify() {  # $1 = rule, $2 = firing|ok, $3 = текст
  local f="$STATE_DIR/$1" prev now msg
  prev=$(cut -d' ' -f1 "$f" 2>/dev/null || echo ok)
  now=$(date +%s)
  if [ "$2" = firing ]; then
    local last; last=$(cut -d' ' -f2 "$f" 2>/dev/null || echo 0)
    [ "$prev" = firing ] && [ $((now - last)) -lt 3600 ] && return 0
    msg="[Aura FIRING] $1: $3"
  else
    [ "$prev" = firing ] || { echo "ok $now" > "$f"; return 0; }
    msg="[Aura RESOLVED] $1: $3"
  fi
  echo "$2 $now" > "$f"
  echo "$(date -u +%FT%TZ) $msg"
  logger -t aura-alert -- "$msg" 2>/dev/null || true
  [ -n "$WEBHOOK" ] && curl -fsS --max-time 10 -H 'Content-Type: text/plain; charset=utf-8' \
    --data-binary "$msg" "$WEBHOOK" >/dev/null 2>&1 || true
}

# --- HTTP: 5xx ба p95 (Caddy JSON access log) ---------------------------------
stats=$("${DC[@]}" logs --since 5m --no-log-prefix caddy 2>/dev/null | python3 -c '
import json, sys
total = err = 0
durs = []
for line in sys.stdin:
    try:
        e = json.loads(line)
    except ValueError:
        continue
    if not str(e.get("logger", "")).startswith("http.log.access"):
        continue
    total += 1
    if int(e.get("status", 0)) >= 500:
        err += 1
    uri = e.get("request", {}).get("uri", "")
    if uri.startswith("/api/") and "/chunks/" not in uri:
        durs.append(float(e.get("duration", 0)))
durs.sort()
p95 = durs[max(0, int(round(0.95 * len(durs))) - 1)] if durs else 0.0
print(total, err, len(durs), "%.3f" % p95)
')
read -r total err napi p95 <<< "${stats:-0 0 0 0}"
if [ "$total" -ge "$MIN_REQ" ] && python3 -c "import sys; sys.exit(0 if $err / $total > 0.01 else 1)"; then
  notify http_5xx firing "5 мин-д 5xx $err/$total (> 1%)"
else
  notify http_5xx ok "5 мин-д 5xx $err/$total"
fi
if [ "$napi" -ge "$MIN_REQ" ] && python3 -c "import sys; sys.exit(0 if $p95 > 1.0 else 1)"; then
  notify http_p95 firing "/api p95 ${p95} с (> 1 с, n=$napi)"
else
  notify http_p95 ok "/api p95 ${p95} с (n=$napi)"
fi

# --- Диск > 80% ---------------------------------------------------------------
worst=$(df -P / /var/lib/docker "$BACKUP_DIR" 2>/dev/null | awk 'NR>1{gsub("%","",$5); print $5, $6}' | sort -rn | head -1)
pct=${worst%% *}
if [ "${pct:-0}" -gt 80 ]; then notify disk firing "${worst#* } ${pct}% (> 80%)"; else notify disk ok "дээд ${pct:-?}%"; fi

# --- Backup ба сэргээх тест -----------------------------------------------------
age_h() { [ -f "$1" ] && echo $(( ($(date +%s) - $(stat -c %Y "$1")) / 3600 )) || echo 99999; }
ok_age=$(age_h "$BACKUP_DIR/status/backup.ok")
if [ -f "$BACKUP_DIR/status/backup.failed" ] && [ "$BACKUP_DIR/status/backup.failed" -nt "$BACKUP_DIR/status/backup.ok" ]; then
  notify backup firing "сүүлийн pg_dump амжилтгүй: $(tail -1 "$BACKUP_DIR/status/backup.failed")"
elif [ "$ok_age" -gt 26 ]; then
  notify backup firing "сүүлийн амжилттай pg_dump ${ok_age} цагийн өмнө (> 26 ц)"
else
  notify backup ok "сүүлийн pg_dump ${ok_age} цагийн өмнө"
fi
rt_age=$(age_h "$BACKUP_DIR/status/restore-test.ok")
if [ "$rt_age" -gt $((8 * 24)) ]; then
  notify restore_test firing "сүүлийн амжилттай сэргээх тест ${rt_age} цагийн өмнө (> 8 хоног)"
else
  notify restore_test ok "сүүлийн сэргээх тест ${rt_age} цагийн өмнө"
fi

# --- Backend health -------------------------------------------------------------
cid=$("${DC[@]}" ps -q backend 2>/dev/null)
health=$( [ -n "$cid" ] && docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo absent)
if [ "$health" = healthy ]; then notify backend ok "healthy"; else notify backend firing "backend: $health"; fi
exit 0
