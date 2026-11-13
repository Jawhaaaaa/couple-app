#!/usr/bin/env bash
# Backup → сэргээх тест DEV DB дээр (T-91, AC-151, AC-204). Репогийн үндэсээс:
#   bash deploy/tests/backup-restore.test.sh
#
# Анхдагчаар тусгаарласан DEV compose project (`aura-bt`, зөвхөн postgres) асааж, Flyway-ийн
# migration-уудыг хэрэглэж, өгөгдөл seed хийнэ. Backup-ын ҮЕД зэрэг бичилт хийж, сэргээсэн DB-ийн
# мөрийн тоо dump хийсэн мөчийнхтэй тэнцүү эсэхийг шалгана; manifest-ийг эвдэхэд тест унах ёстой.
#   BT_PROJECT=<нэр>  — өөр project нэр;  KEEP=1 — төгсгөлд project-ийг устгахгүй
#   MEDIA=1           — prod compose-ийн seaweedfs + rclone-оор media-sync.sh-ийг шалгана
set -uo pipefail
export MSYS_NO_PATHCONV=1

winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
ROOT="$(winpath "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
cd "$ROOT"
fails=0
pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*" >&2; fails=$((fails + 1)); }

PROJECT="${BT_PROJECT:-aura-bt}"
# Зөвхөн энэ тестийн локал DB — нууц биш
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-bt-local-only}" AURA_JWT_SECRET="${AURA_JWT_SECRET:-bt-local-only-not-a-secret-0123456789}"
export AURA_COMPOSE="docker compose -p $PROJECT -f $ROOT/docker-compose.yml"
read -r -a DC <<< "$AURA_COMPOSE"
BACKUP_DIR="$(winpath "$(mktemp -d)")"; export BACKUP_DIR
export ENV_FILE=/nonexistent BACKUP_REMOTE=""

teardown() {
  [ -n "${writer_pid:-}" ] && kill "$writer_pid" 2>/dev/null
  if [ "${KEEP:-0}" != 1 ]; then
    "${DC[@]}" down -v --remove-orphans >/dev/null 2>&1
    [ "${MEDIA:-0}" = 1 ] && "${MDC[@]}" --profile tools down -v --remove-orphans >/dev/null 2>&1
    rm -rf "$BACKUP_DIR"
  fi
}
trap teardown EXIT

psql_db() { "${DC[@]}" exec -T postgres sh -c 'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

echo "== DEV postgres ($PROJECT) асааж байна"
"${DC[@]}" up -d --wait postgres >/dev/null || { echo "postgres асахгүй байна" >&2; exit 1; }

echo "== Flyway migration (backend/src/main/resources/db/migration) + seed"
for f in $(ls backend/src/main/resources/db/migration/V*__*.sql | sort -V); do
  psql_db < "$f" >/dev/null || { fail "migration $f"; exit 1; }
done
psql_db <<'SQL' >/dev/null
INSERT INTO users (id, email, display_name)
  SELECT gen_random_uuid(), 'bt' || g || '@aura.test', 'BT ' || g FROM generate_series(1, 1000) g;
CREATE SCHEMA IF NOT EXISTS bt_fixture;
CREATE TABLE IF NOT EXISTS bt_fixture.events (id bigserial PRIMARY KEY, payload text NOT NULL, at timestamptz NOT NULL DEFAULT now());
INSERT INTO bt_fixture.events (payload) SELECT md5(g::text) FROM generate_series(1, 5000) g;
SQL
tables=$(echo "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');" | psql_db | tr -d '\r')
pass "схем: $tables хүснэгт, users 1000 + bt_fixture.events 5000 мөр"

echo "== backup.sh (зэрэг бичилттэй)"
( while :; do echo "INSERT INTO bt_fixture.events (payload) VALUES ('live');" | psql_db >/dev/null 2>&1; done ) &
writer_pid=$!
sleep 2
if bash deploy/backup/backup.sh; then pass "backup.sh"; else fail "backup.sh"; fi
sleep 1
kill "$writer_pid" 2>/dev/null; wait "$writer_pid" 2>/dev/null; writer_pid=
live=$(echo "SELECT count(*) FROM bt_fixture.events;" | psql_db | tr -d '\r')
dump=$(ls -1t "$BACKUP_DIR"/db/aura-*.dump 2>/dev/null | head -1)
counts="${dump%.dump}.counts"
snap=$(grep '^bt_fixture.events|' "$counts" 2>/dev/null | cut -d'|' -f2)
[ -s "$dump" ] && [ -s "$counts" ] && pass "dump $(du -h "$dump" | cut -f1), manifest $(wc -l < "$counts") хүснэгт" || fail "dump/manifest алга"
[ -f "$BACKUP_DIR/status/backup.ok" ] && pass "status/backup.ok" || fail "status/backup.ok алга"
echo "     bt_fixture.events: dump-ийн мөчид $snap, одоо $live (backup-ын үеэр бичилт үргэлжилсэн)"

echo "== restore-test.sh"
if bash deploy/backup/restore-test.sh "$dump"; then
  pass "AC-151 сэргээсэн DB-ийн мөрийн тоо эхтэй тэнцүү"
else
  fail "AC-151 restore-test.sh"
fi
[ -f "$BACKUP_DIR/status/restore-test.ok" ] && pass "status/restore-test.ok: $(cat "$BACKUP_DIR/status/restore-test.ok")" || fail "status/restore-test.ok алга"
leftover=$(echo "SELECT count(*) FROM pg_database WHERE datname = 'aura_restore_test';" | psql_db | tr -d '\r')
[ "$leftover" = 0 ] && pass "тест DB устгагдсан" || fail "aura_restore_test үлдсэн"

echo "== Сөрөг: manifest-ийн тоог эвдэхэд тест унах ёстой"
cp "$counts" "$counts.orig"
sed -i 's/^\(public\.users|\).*/\1999999/' "$counts"
if bash deploy/backup/restore-test.sh "$dump" >/dev/null 2>&1; then
  fail "эвдэрсэн manifest-ийг илрүүлсэнгүй"
else
  pass "мөрийн тооны зөрүүг илрүүлэв (exit ≠ 0, status/restore-test.failed)"
fi
mv "$counts.orig" "$counts"

echo "== Хадгалах хугацаа (30 хоног)"
touch -d '40 days ago' "$BACKUP_DIR/db/aura-20000101T000000Z.dump" "$BACKUP_DIR/db/aura-20000101T000000Z.counts"
bash deploy/backup/backup.sh >/dev/null 2>&1
[ ! -e "$BACKUP_DIR/db/aura-20000101T000000Z.dump" ] && [ -e "$dump" ] && pass "30 хоногоос хуучин dump устав, шинэ нь үлдэв" || fail "retention"

if [ "${MEDIA:-0}" = 1 ]; then
  echo "== media-sync.sh (prod compose-ийн seaweedfs, .env.prod.example)"
  MDC=(docker compose -p "$PROJECT-media" -f "$ROOT/deploy/docker-compose.prod.yml" --env-file "$ROOT/.env.prod.example")
  "${MDC[@]}" up -d --wait seaweedfs >/dev/null || fail "prod seaweedfs асахгүй"
  r() { BACKUP_DIR="$BACKUP_DIR" "${MDC[@]}" --profile tools run --rm -T rclone "$@"; }
  echo "hello" | r rcat seaweed:aura-media/space-1/a.txt && echo "bye" | r rcat seaweed:aura-media/space-1/b.txt \
    && pass "prod seaweedfs: .env-ийн identity-гаар S3 бичилт" || fail "seaweedfs S3 бичилт"
  ( export AURA_COMPOSE="${MDC[*]}" ENV_FILE="$ROOT/.env.prod.example"; bash deploy/backup/media-sync.sh ) || fail "media-sync.sh"
  [ -f "$BACKUP_DIR/media/current/space-1/a.txt" ] && pass "медиа хавтас руу sync" || fail "media/current/space-1/a.txt алга"
  r deletefile seaweed:aura-media/space-1/b.txt
  ( export AURA_COMPOSE="${MDC[*]}" ENV_FILE="$ROOT/.env.prod.example"; bash deploy/backup/media-sync.sh ) >/dev/null || fail "media-sync.sh (2)"
  [ ! -e "$BACKUP_DIR/media/current/space-1/b.txt" ] && [ -f "$BACKUP_DIR/media/deleted/$(date -u +%F)/space-1/b.txt" ] \
    && pass "устсан объект media/deleted/<огноо>-д" || fail "deleted backup-dir"
fi

echo
[ "$fails" -eq 0 ] && { echo "backup-restore: бүгд PASS"; exit 0; } || { echo "backup-restore: $fails FAIL" >&2; exit 1; }
