#!/usr/bin/env bash
# PROD шинэчлэлт (T-90, AC-218): git pull → image build → `up -d` → health хүлээх.
# Зогсолт ≤ 1 мин: build нь хуучин контейнер ажиллаж байхад хийгдэнэ; зогсолт нь зөвхөн
# өөрчлөгдсөн контейнерийг солих хугацаа (backend ~30–45 с).
#
# Хэрэглээ (сервер дээр, репогийн үндэсээс):  deploy/deploy.sh
#   ENV_FILE=.env.prod  — орчны файл (анхдагч)
#   SKIP_PULL=1         — git pull хийхгүй (гараар checkout хийсэн хувилбарыг deploy хийх)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
[ -f "$ENV_FILE" ] || { echo "Орчны файл алга: $ENV_FILE (cp .env.prod.example .env.prod)" >&2; exit 1; }
DC=(docker compose -f "$ROOT/deploy/docker-compose.prod.yml" --env-file "$ENV_FILE")
log() { echo "[$(date -u +%FT%TZ)] $*"; }

if grep -Eq '=change-me' "$ENV_FILE"; then
  echo "$ENV_FILE-д 'change-me' placeholder үлдсэн байна — бодит утгаар соль:" >&2
  grep -En '=change-me' "$ENV_FILE" | cut -d= -f1 >&2
  exit 1
fi

if [ "${SKIP_PULL:-0}" != "1" ]; then
  log "git pull"
  git pull --ff-only
fi
log "хувилбар: $(git rev-parse --short HEAD)"

"${DC[@]}" config -q

# 1) Build ба татах — хуучин контейнер үйлчилсээр байна
log "image build (arm64 native)"
"${DC[@]}" build --pull
"${DC[@]}" pull --ignore-buildable --quiet

# 2) Солих — өөрчлөгдсөн контейнер л дахин үүснэ (`up -d --build`-тэй адил, build аль хэдийн хийгдсэн)
start=$(date +%s)
log "контейнер солих"
"${DC[@]}" up -d --remove-orphans

# 3) Backend healthy болохыг хүлээх
deadline=$((start + ${DEPLOY_TIMEOUT:-180}))
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$("${DC[@]}" ps -q backend)" 2>/dev/null)" = "healthy" ]; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    log "backend healthy болсонгүй — лог:"
    "${DC[@]}" logs --tail 100 backend >&2
    exit 1
  fi
  sleep 2
done
down=$(( $(date +%s) - start ))
log "backend healthy — солих хугацаа ${down} с"
[ "$down" -le 60 ] || log "АНХААР: зогсолт 60 с-ээс урт (AC-218)"

# 4) Гаднаас шалгах (Caddy → HTTPS)
domain="$(grep -E '^AURA_DOMAIN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' ')"
if [ -n "$domain" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$domain/" || true)
  log "https://$domain/ → $code"
  [ "$code" = "200" ] || { echo "Вэб хариу $code" >&2; exit 1; }
fi

# 5) Хуучин image цэвэрлэх (диск > 80% сэрэмжлүүлгээс сэргийлнэ)
docker image prune -f >/dev/null
log "deploy дууслаа"
