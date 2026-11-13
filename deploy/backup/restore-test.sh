#!/usr/bin/env bash
# Долоо хоног бүрийн автомат сэргээх тест (T-91, AC-151, AC-204). Cron: deploy/backup/crontab.example.
#
# Сүүлийн (эсвэл аргументаар өгсөн) dump-ийг ТУСДАА DB-д (`aura_restore_test`) сэргээж, хүснэгт
# бүрийн мөрийн тоог backup.sh-ийн dump хийсэн мөчийн `<dump>.counts`-тай харьцуулна. Зөрвөл
# exit 1, BACKUP_DIR/status/restore-test.failed. Ажиллаж буй DB хөндөгдөхгүй; тест DB-г төгсгөлд устгана
# (KEEP_RESTORE_DB=1 бол үлдээнэ).
#
# Хэрэглээ:  deploy/backup/restore-test.sh [path/to/aura-....dump]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TEST_DB="${RESTORE_TEST_DB:-aura_restore_test}"
[[ "$TEST_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "RESTORE_TEST_DB буруу: $TEST_DB" >&2; exit 2; }

dump="${1:-$(ls -1t "$BACKUP_DIR"/db/aura-*.dump 2>/dev/null | head -1)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "dump олдсонгүй ($BACKUP_DIR/db)" >&2; exit 1; }
expected="${dump%.dump}.counts"
[ -f "$expected" ] || { echo "мөрийн тооны manifest алга: $expected" >&2; exit 1; }

fail() {
  echo "$(date -u +%FT%TZ) $(basename "$dump"): $*" >> "$BACKUP_DIR/status/restore-test.failed"
  log "АЛДАА: $*" >&2
  exit 1
}
cleanup() {
  [ "${KEEP_RESTORE_DB:-0}" = 1 ] && return 0
  pg_sh "exec psql -X -q -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE)'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "сэргээх тест: $(basename "$dump") → $TEST_DB"
t0=$(date +%s)
pg_sh "exec psql -X -q -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE)' -c 'CREATE DATABASE $TEST_DB'" \
  || fail "тест DB үүсгэж чадсангүй"
pg_sh "exec pg_restore -U \"\$POSTGRES_USER\" -d $TEST_DB --no-owner --no-privileges --exit-on-error" < "$dump" \
  || fail "pg_restore амжилтгүй"

actual=$(mktemp)
printf '%s\n' "$COUNTS_SQL" | pg_sh "exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d $TEST_DB" | tr -d '\r' > "$actual" \
  || fail "сэргээсэн DB-ийн мөрийн тоо уншиж чадсангүй"

tables=$(wc -l < "$expected" | tr -d ' ')
rows=$(awk -F'|' '{s += $2} END {print s + 0}' "$expected")
if ! diff_out=$(diff <(tr -d '\r' < "$expected") "$actual"); then
  echo "$diff_out" | sed 's/^/  /' >&2
  rm -f "$actual"
  fail "мөрийн тоо зөрлөө (< хүлээгдэж буй, > сэргээсэн)"
fi
rm -f "$actual"

secs=$(( $(date +%s) - t0 ))
echo "$(date -u +%Y%m%dT%H%M%SZ) $(basename "$dump") tables=$tables rows=$rows ${secs}s" > "$BACKUP_DIR/status/restore-test.ok"
log "сэргээх тест амжилттай: $tables хүснэгт, $rows мөр — тоо бүгд тэнцүү (${secs} с)"
