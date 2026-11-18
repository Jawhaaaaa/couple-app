#!/usr/bin/env bash
# Шөнийн PostgreSQL backup (T-91, NFR-15, AC-204, OPS-AURA-004). Cron: deploy/backup/crontab.example.
#
#  1. REPEATABLE READ транзакц нээж snapshot export хийнэ; тэр snapshot дотор хүснэгт бүрийн мөрийн
#     тоог `<dump>.counts`-д бичнэ.
#  2. `pg_dump --snapshot` — яг тэр төлөвийн custom-format dump (`aura-YYYYmmddTHHMMSSZ.dump`).
#     Тиймээс сэргээх тест (restore-test.sh) мөрийн тоог ажиллаж буй DB биш, dump хийгдсэн мөчтэй
#     харьцуулна — шөнийн бичилт тестийг худал унагахгүй.
#  3. BACKUP_RETENTION_DAYS (30)-аас хуучин dump-ийг устгана.
#  4. BACKUP_REMOTE тохируулсан бол (жишээ `oracle:aura-backup`) rclone-оор гадагш хуулна.
#  5. Төлөв: BACKUP_DIR/status/backup.ok эсвэл backup.failed (deploy/monitor/alerts.sh уншина).
#
# Хэрэглээ:  deploy/backup/backup.sh            (prod)
#            AURA_COMPOSE="docker compose" BACKUP_DIR=/tmp/bk deploy/backup/backup.sh   (DEV)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump="$BACKUP_DIR/db/aura-$stamp.dump"
counts="$BACKUP_DIR/db/aura-$stamp.counts"

on_fail() {
  local rc=$?
  rm -f "$dump.part" "$counts.part"
  echo "$(date -u +%FT%TZ) backup амжилтгүй (rc=$rc, мөр $1)" >> "$BACKUP_DIR/status/backup.failed"
  log "АЛДАА: backup амжилтгүй (мөр $1)" >&2
  exit "$rc"
}
trap 'on_fail $LINENO' ERR

log "pg_dump эхлэв → $dump"

# 1) Snapshot-ыг барьж байх psql session (coprocess). Транзакц нээлттэй байх хооронд snapshot хүчинтэй.
coproc PSQL { "${DC[@]}" exec -T postgres sh -c 'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
psql_in=${PSQL[1]}; psql_out=${PSQL[0]}; psql_pid=$PSQL_PID
printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&"$psql_in"
IFS= read -r -t 60 snapshot <&"$psql_out"
[[ "$snapshot" =~ ^[0-9A-F-]+$ ]] || { log "snapshot export амжилтгүй: '$snapshot'" >&2; false; }

printf '%s\n' "$COUNTS_SQL" "SELECT '__END__';" >&"$psql_in"
: > "$counts.part"
while IFS= read -r -t 600 line <&"$psql_out"; do
  [ "$line" = "__END__" ] && break
  echo "$line" >> "$counts.part"
done
[ -s "$counts.part" ] || { log "мөрийн тоо хоосон" >&2; false; }

# 2) Dump — ижил snapshot
pg_sh "exec pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc -Z 6 --snapshot=$snapshot" > "$dump.part"

printf '%s\n' "COMMIT;" '\q' >&"$psql_in"
exec {psql_in}>&-
wait "$psql_pid" || true

# Dump уншигдах эсэх (TOC)
pg_sh 'exec pg_restore --list' < "$dump.part" > /dev/null
mv "$counts.part" "$counts"
mv "$dump.part" "$dump"
size=$(du -h "$dump" | cut -f1)
log "dump бэлэн: $(basename "$dump") ($size, $(wc -l < "$counts") хүснэгт)"

# 3) Хадгалах хугацаа
find "$BACKUP_DIR/db" -type f \( -name 'aura-*.dump' -o -name 'aura-*.counts' \) -mtime +"$BACKUP_RETENTION_DAYS" -print -delete \
  | sed 's/^/  устгав (хугацаа хэтэрсэн): /'

# 4) Гадаад хуулбар
if [ -n "$BACKUP_REMOTE" ]; then
  rclone_run copy /backups/db "$BACKUP_REMOTE/db" --max-age 48h --log-level NOTICE
  rclone_run delete "$BACKUP_REMOTE/db" --min-age "${BACKUP_RETENTION_DAYS}d" --log-level NOTICE
  log "гадаад хуулбар: $BACKUP_REMOTE/db"
else
  log "АНХААР: BACKUP_REMOTE хоосон — dump зөвхөн энэ VM-ийн дискэнд (docs/BACKUP.md §3)"
fi

# 5) Төлөв
trap - ERR
echo "$stamp $(basename "$dump") $size" > "$BACKUP_DIR/status/backup.ok"
log "backup амжилттай"
