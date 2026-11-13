#!/usr/bin/env bash
# DuckDNS-ийн A бичлэгийг VM-ийн нийтийн IP-д тааруулна (OPS-AURA-002).
# IP-г DuckDNS хүсэлтийн эх хаягаас өөрөө тодорхойлно (`ip=` хоосон).
# Cron (5 мин тутам):
#   */5 * * * * /opt/aura/deploy/duckdns-update.sh >> /var/log/aura/duckdns.log 2>&1
# Хувьсагч .env.prod-оос: DUCKDNS_SUBDOMAIN, DUCKDNS_TOKEN. ENV_FILE-ээр өөр файл заана.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"; }

sub="${DUCKDNS_SUBDOMAIN:-$(env_get DUCKDNS_SUBDOMAIN)}"
token="${DUCKDNS_TOKEN:-$(env_get DUCKDNS_TOKEN)}"
[ -n "$sub" ] && [ -n "$token" ] || { echo "DUCKDNS_SUBDOMAIN / DUCKDNS_TOKEN тохируулаагүй ($ENV_FILE)" >&2; exit 1; }

# Token-ийг процессын жагсаалтад (ps) ил гаргахгүйн тулд URL-ийг stdin-ээр (-K -) дамжуулна
resp=$(printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\n' "$sub" "$token" \
  | curl -fsS --max-time 20 -K - || true)
ts=$(date -u +%FT%TZ)
if [ "$resp" = "OK" ]; then
  echo "$ts duckdns $sub OK"
else
  echo "$ts duckdns $sub АЛДАА: '${resp:-хариугүй}'" >&2
  exit 1
fi
