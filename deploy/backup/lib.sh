# shellcheck shell=bash
# backup.sh, restore-test.sh, media-sync.sh-ийн нийтлэг хэсэг (T-91). Шууд ажиллуулахгүй — source.
#
# Орчин:
#   ENV_FILE     — анхдагч <репо>/.env.prod (BACKUP_DIR, BACKUP_REMOTE г.м.-ийг эндээс уншина)
#   AURA_COMPOSE — compose команд (анхдагч: prod compose). DEV: AURA_COMPOSE="docker compose"
#   BACKUP_DIR   — dump, manifest, төлөвийн хавтас (анхдагч /var/backups/aura)
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Windows (MSYS bash): MSYS_NO_PATHCONV-той үед docker-т /c/... биш C:/... зам хэрэгтэй
command -v cygpath >/dev/null 2>&1 && ROOT="$(cygpath -m "$ROOT")"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
env_get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'" || true; }

if [ -n "${AURA_COMPOSE:-}" ]; then
  read -r -a DC <<< "$AURA_COMPOSE"
else
  DC=(docker compose -f "$ROOT/deploy/docker-compose.prod.yml" --env-file "$ENV_FILE")
fi

BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/aura}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$(env_get BACKUP_RETENTION_DAYS)}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_REMOTE="${BACKUP_REMOTE-$(env_get BACKUP_REMOTE)}"
export BACKUP_DIR
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/status"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

# Postgres контейнер дотор `sh -c` — POSTGRES_USER/POSTGRES_DB нь контейнерын орчноос (нууц үг
# шаардахгүй: unix socket дээр trust). Аргумент: контейнер дотор ажиллах shell мөр.
pg_sh() { "${DC[@]}" exec -T postgres sh -c "$1"; }

# Хүснэгт бүрийн мөрийн тоо: "<schema>.<table>|<count>", нэрээр эрэмбэлсэн. Нэг SELECT — нэг
# snapshot (REPEATABLE READ транзакц дотор ажиллавал тэр snapshot-оор).
COUNTS_SQL="SELECT format('%I.%I', n.nspname, c.relname) || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY 1;"

# rclone (compose-ийн `tools` profile). BACKUP_DIR нь контейнерт /backups болж mount хийгдэнэ.
rclone_run() { BACKUP_DIR="$BACKUP_DIR" "${DC[@]}" --progress quiet --profile tools run --rm -T rclone "$@"; }
