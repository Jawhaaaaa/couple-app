#!/usr/bin/env bash
# AC-209: DEV compose-ийн таван үйлчилгээ healthy эсэхийг шалгана.
# Хэрэглээ: bash scripts/compose-health.sh [project]   (урьдчилж `docker compose up -d --build`)
set -euo pipefail
export MSYS_NO_PATHCONV=1
project="${1:-}"
args=()
[ -n "$project" ] && args=(-p "$project")
required=(postgres seaweedfs mailpit backend mobile-web)
deadline=$((SECONDS + ${HEALTH_TIMEOUT:-240}))
while :; do
  missing=()
  for s in "${required[@]}"; do
    st=$(docker compose "${args[@]}" ps --format '{{.Service}} {{.Health}}' | awk -v s="$s" '$1==s{print $2}')
    [ "$st" = "healthy" ] || missing+=("$s:${st:-absent}")
  done
  [ ${#missing[@]} -eq 0 ] && { echo "AC-209: бүх үйлчилгээ healthy"; break; }
  [ $SECONDS -ge $deadline ] && { echo "AC-209 унав: ${missing[*]}" >&2; exit 1; }
  sleep 5
done
# Mailpit UI ба SMTP порт, SeaweedFS S3 хариу
curl -fsS "http://localhost:${MAILPIT_UI_PORT:-8025}/readyz" >/dev/null
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${S3_HOST_PORT:-8333}/")
[ "$code" = "403" ] || [ "$code" = "200" ] || { echo "SeaweedFS S3 хариу $code" >&2; exit 1; }
echo "AC-209: Mailpit UI, SeaweedFS S3 хариулав"
