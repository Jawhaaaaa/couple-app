#!/usr/bin/env bash
# PROD багцын шалгалт (T-90): AC-151 (compose config), AC-161 (arm64), AC-162 (Caddyfile, .env.prod.example,
# нууц утга 0). Репогийн үндэсээс:  bash deploy/tests/prod-config.test.sh
#   ARM64_BUILD=1  — өөрийн Dockerfile-уудыг `--platform linux/arm64`-аар build хийнэ (QEMU, удаан)
#   OFFLINE=1      — registry-ээс manifest асуухгүй (AC-161-ийн image шалгалтыг алгасна)
set -uo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
fails=0
pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*" >&2; fails=$((fails + 1)); }
ENV_EX=.env.prod.example
DC=(docker compose -f deploy/docker-compose.prod.yml --env-file "$ENV_EX")

# --- AC-151: compose config -------------------------------------------------------
if "${DC[@]}" config -q && "${DC[@]}" --profile tools config -q; then
  pass "AC-151 docker compose -f deploy/docker-compose.prod.yml config"
else
  fail "AC-151 compose config"
fi
grep -q 'mailpit' <("${DC[@]}" config --services) && fail "prod compose-д mailpit байна" || pass "prod-д mailpit байхгүй"
grep -qi 'minio' <("${DC[@]}" --profile tools config --images) && fail "MinIO хориотой" || pass "MinIO 0 (SeaweedFS)"

# --- AC-162: .env.prod.example — хувьсагч бүрэн, нууц утга 0 ------------------------
required=(DUCKDNS_SUBDOMAIN DUCKDNS_TOKEN AURA_DOMAIN ACME_EMAIL
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD AURA_JWT_SECRET
  AURA_S3_BUCKET AURA_S3_REGION AURA_S3_ACCESS_KEY AURA_S3_SECRET_KEY
  SPRING_MAIL_HOST SPRING_MAIL_PORT SPRING_MAIL_USERNAME SPRING_MAIL_PASSWORD AURA_MAIL_FROM
  AURA_VAPID_PUBLIC_KEY AURA_VAPID_PRIVATE_KEY AURA_VAPID_SUBJECT
  AURA_GOOGLE_CLIENT_ID AURA_GOOGLE_CLIENT_SECRET AURA_ADMIN_EMAILS)
missing=()
for v in "${required[@]}"; do grep -qE "^$v=" "$ENV_EX" || missing+=("$v"); done
[ ${#missing[@]} -eq 0 ] && pass "AC-162 .env.prod.example: SMTP, VAPID, DuckDNS, DB, S3, Google OAuth, ADMIN_EMAILS" \
  || fail "AC-162 .env.prod.example-д дутуу: ${missing[*]}"

# Нууц төрлийн түлхүүр бүр хоосон эсвэл `change-me…` placeholder
leaks=$(grep -E '^[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|_KEY|_DSN)=' "$ENV_EX" | grep -vE '=(change-me[^ ]*)?$' || true)
[ -z "$leaks" ] && pass "AC-162 .env.prod.example-д нууц утга 0" || fail "AC-162 placeholder биш нууц утга: $(echo "$leaks" | cut -d= -f1 | tr '\n' ' ')"
# deploy/-д бичигдсэн түлхүүр, token (PEM, AWS/OCI түлхүүр хэлбэр)
secret_re='-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
grep -rEn --exclude-dir=dev --exclude='*.test.sh' -e "$secret_re" deploy "$ENV_EX"
case $? in
  1) pass "AC-162 deploy/-д нууц утга 0" ;;
  0) fail "AC-162 deploy/-д нууц утга төст мөр (дээр)" ;;
  *) fail "AC-162 нууц утгын хайлт ажиллаагүй" ;;
esac

# --- AC-162: Caddyfile ------------------------------------------------------------
CADDY_ENV=(-e AURA_DOMAIN=aura-example.duckdns.org -e ACME_EMAIL=ops@example.com)
if docker run --rm "${CADDY_ENV[@]}" -v "$(hostpath "$ROOT/deploy"):/etc/caddy:ro" caddy:2 \
     caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  pass "AC-162 caddy validate"
else
  fail "AC-162 caddy validate"
fi
docker run --rm -v "$(hostpath "$ROOT/deploy"):/etc/caddy:ro" caddy:2 caddy fmt /etc/caddy/Caddyfile \
  | diff -q - deploy/Caddyfile >/dev/null && pass "Caddyfile формат (caddy fmt)" || fail "Caddyfile формат — caddy fmt --overwrite"

# Чиглүүлэлтийн smoke: localhost (Caddy-ийн дотоод CA), SPA хавтас — stub, upstream-гүй
smoke_dir=$(mktemp -d)
mkdir -p "$smoke_dir/_expo/static/js"
echo '<!doctype html><div id="root"></div>' > "$smoke_dir/index.html"
echo 'x' > "$smoke_dir/_expo/static/js/app-abc.js"
port=${SMOKE_PORT:-18443}
cid=$(docker run -d --rm -e AURA_DOMAIN=localhost -e ACME_EMAIL=ops@example.com -p "127.0.0.1:$port:443" \
  -v "$(hostpath "$ROOT/deploy/Caddyfile"):/etc/caddy/Caddyfile:ro" -v "$(hostpath "$smoke_dir"):/srv/web:ro" caddy:2)
code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://localhost:$port$1"; }
for _ in $(seq 1 20); do [ "$(code /)" = 200 ] && break; sleep 1; done
check() {  # $1 зам, $2 хүлээгдэх код, $3 тайлбар
  local c; c=$(code "$1")
  [ "$c" = "$2" ] && pass "Caddy $1 → $c ($3)" || fail "Caddy $1 → $c, хүлээгдэж буй $2 ($3)"
}
check / 200 "SPA"
check /memories/42 200 "SPA fallback try_files"
check /_expo/static/js/app-abc.js 200 "статик"
check /actuator/health 404 "Actuator гаднаас хаалттай"
check /api/v1/test/clock 404 "тестийн endpoint хаалттай"
check /api/v1/me 502 "/api → backend (smoke-д upstream байхгүй)"
check /ws 502 "/ws → backend"
check /aura-media/x 502 "/<bucket> → seaweedfs"
cc=$(curl -sk -D - -o /dev/null "https://localhost:$port/_expo/static/js/app-abc.js" | tr -d '\r' | grep -i '^cache-control' || true)
echo "$cc" | grep -q immutable && pass "hash-тай bundle immutable" || fail "bundle cache-control: '$cc'"
cc=$(curl -sk -D - -o /dev/null "https://localhost:$port/memories/42" | tr -d '\r' | grep -i '^cache-control' || true)
echo "$cc" | grep -q no-cache && pass "SPA зам no-cache" || fail "SPA cache-control: '$cc'"
docker stop "$cid" >/dev/null 2>&1
rm -rf "$smoke_dir"

# --- AC-161: бүх image linux/arm64 -----------------------------------------------
if [ "${OFFLINE:-0}" = 1 ]; then
  echo "SKIP  AC-161 image manifest (OFFLINE=1)"
else
  for img in $("${DC[@]}" --profile tools config --images | sort -u); do
    case "$img" in aura-*) continue ;; esac   # өөрийн build — доор ARM64_BUILD
    ok=0
    for _ in 1 2 3; do   # registry-ийн түр алдаанд дахин оролдоно
      docker buildx imagetools inspect "$img" 2>/dev/null | grep -qE 'Platform:\s+linux/arm64' && { ok=1; break; }
      sleep 3
    done
    if [ "$ok" = 1 ]; then
      pass "AC-161 $img linux/arm64"
    else
      fail "AC-161 $img-д linux/arm64 алга (эсвэл registry хүрэхгүй)"
    fi
  done
fi
if [ "${ARM64_BUILD:-0}" = 1 ]; then
  docker buildx build --platform linux/arm64 -t aura-backend:arm64-check . >/dev/null \
    && pass "AC-161 root Dockerfile linux/arm64 build" || fail "AC-161 backend arm64 build"
  docker buildx build --platform linux/arm64 -t aura-mobile-web:arm64-check mobile >/dev/null \
    && pass "AC-161 mobile/Dockerfile linux/arm64 build" || fail "AC-161 mobile arm64 build"
else
  echo "SKIP  AC-161 өөрийн Dockerfile-ийн arm64 build (ARM64_BUILD=1)"
fi

# --- Скриптүүдийн синтакс ---------------------------------------------------------
for s in deploy/*.sh deploy/monitor/*.sh deploy/backup/*.sh; do
  [ -f "$s" ] || continue
  bash -n "$s" && pass "bash -n $s" || fail "bash -n $s"
done

echo
[ "$fails" -eq 0 ] && { echo "prod-config: бүгд PASS"; exit 0; } || { echo "prod-config: $fails FAIL" >&2; exit 1; }
