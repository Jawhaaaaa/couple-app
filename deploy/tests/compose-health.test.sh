#!/usr/bin/env bash
# DEV compose стекийн integration шалгалт (T-01): AC-209 — `backend`, `postgres`, `seaweedfs`, `mailpit`,
# `mobile-web` бүгд healthy; Mailpit UI ажиллаж, backend-ийн имэйл SMTP 1025-аар Mailpit-д ирнэ; SeaweedFS-ийн
# S3 identity нь sigv4 presigned URL-ыг хүлээж авна (буруу гарын үсэгт 403).
#
# Асаалттай стек дээр, репогийн үндэсээс:
#   docker compose up -d --build --wait
#   bash deploy/tests/compose-health.test.sh
# Хувьсагч: ENV_FILE (анхдагч .env), COMPOSE_PROJECT (`-p`), SERVICES (шалгах үйлчилгээ, анхдагч 5-уулаа).
set -uo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ENV_FILE=${ENV_FILE:-.env}
# Windows-ийн `python3` нь Store-ийн stub байж болно — ажилладаг эсэхийг шалгаж сонгоно
PY=${PYTHON:-}
if [ -z "$PY" ]; then for c in python3 python; do "$c" -c 'pass' >/dev/null 2>&1 && { PY=$c; break; }; done; fi
fails=0
pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*" >&2; fails=$((fails + 1)); }

# .env-ийн утга (байхгүй бол анхдагч)
envval() { local v; v=$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2-); echo "${v:-$2}"; }
API="http://localhost:$(envval HOST_PORT 8080)"
MAILPIT="http://localhost:$(envval MAILPIT_UI_PORT 8025)"
S3="http://localhost:$(envval S3_HOST_PORT 8333)"
DC=(docker compose --env-file "$ENV_FILE")
[ -n "${COMPOSE_PROJECT:-}" ] && DC+=(-p "$COMPOSE_PROJECT")

# --- Үйлчилгээ бүр healthy ---------------------------------------------------------
read -r -a services <<< "${SERVICES:-backend postgres seaweedfs mailpit mobile-web}"
status=$("${DC[@]}" ps --format '{{.Service}} {{.Health}}')
for s in "${services[@]}"; do
  if grep -qE "^$s healthy$" <<< "$status"; then pass "AC-209 $s healthy"; else fail "AC-209 $s healthy биш: $(grep -E "^$s " <<< "$status" || echo 'асаагүй')"; fi
done

# --- Mailpit UI (8025) ба SMTP (1025): backend-ийн илгээсэн баталгаажуулах имэйл Mailpit-д ирнэ -----
curl -fsS "$MAILPIT/readyz" >/dev/null && pass "AC-209 Mailpit UI ($MAILPIT)" || fail "AC-209 Mailpit UI хариугүй"
email="compose-health+$(date +%s)$RANDOM@aura.test"
policy=$(curl -fsS "$API/api/v1/policies/current" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["version"])')
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/v1/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"Talbai-Nuur-2026\",\"displayName\":\"Шалгалт\",\"birthDate\":\"1998-05-14\",\"locale\":\"mn\",\"timezone\":\"Asia/Ulaanbaatar\",\"acceptedPolicyVersion\":\"$policy\"}")
if [[ "$code" =~ ^20[0-9]$ ]]; then
  got=0
  for _ in $(seq 1 20); do
    n=$(curl -fsS "$MAILPIT/api/v1/search?query=to:$email" | "$PY" -c 'import json,sys; print(json.load(sys.stdin).get("messages_count",0))')
    [ "${n:-0}" -ge 1 ] && { got=1; break; }
    sleep 0.5
  done
  [ "$got" = 1 ] && pass "AC-209 backend → SMTP 1025 → Mailpit имэйл ирлээ" || fail "AC-209 баталгаажуулах имэйл Mailpit-д ирсэнгүй"
else
  fail "AC-209 бүртгэл (имэйл илгээх) HTTP $code"
fi

# --- SeaweedFS S3: sigv4 presigned PUT/GET, буруу гарын үсэгт 403 --------------------------------
S3_URL="$S3" BUCKET=$(envval AURA_S3_BUCKET aura-media) REGION=$(envval AURA_S3_REGION us-east-1) \
ACCESS=$(envval AURA_S3_ACCESS_KEY aura-dev-access) SECRET=$(envval AURA_S3_SECRET_KEY aura-dev-secret-change-me) \
PYTHONIOENCODING=utf-8 "$PY" - <<'PY'
import datetime, hashlib, hmac, os, sys, urllib.error, urllib.parse, urllib.request

base, bucket, region = os.environ["S3_URL"], os.environ["BUCKET"], os.environ["REGION"]
access, secret = os.environ["ACCESS"], os.environ["SECRET"]
host = urllib.parse.urlparse(base).netloc
key = f"compose-health/{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S%f')}.txt"

def presign(method, expires=300):
    now = datetime.datetime.now(datetime.timezone.utc)
    amz, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    scope = f"{day}/{region}/s3/aws4_request"
    q = {"X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{access}/{scope}", "X-Amz-Date": amz,
         "X-Amz-Expires": str(expires), "X-Amz-SignedHeaders": "host"}
    qs = "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}" for k, v in sorted(q.items()))
    path = "/" + urllib.parse.quote(f"{bucket}/{key}")
    canonical = "\n".join([method, path, qs, f"host:{host}\n", "host", "UNSIGNED-PAYLOAD"])
    sts = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = ("AWS4" + secret).encode()
    for part in (day, region, "s3", "aws4_request"):
        k = hmac.new(k, part.encode(), hashlib.sha256).digest()
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    return f"{base}{path}?{qs}&X-Amz-Signature={sig}"

def call(url, method, data=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method), timeout=15) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

body = "Өнөөдөр Үүрийн гэгээ".encode()
ok = True
status, _ = call(presign("PUT"), "PUT", body)
print(("PASS" if status == 200 else "FAIL") + f"  AC-209 S3 presigned PUT (sigv4) → {status}")
ok &= status == 200
status, got = call(presign("GET"), "GET")
print(("PASS" if status == 200 and got == body else "FAIL") + f"  AC-209 S3 presigned GET → {status}, агуулга тэнцүү={got == body}")
ok &= status == 200 and got == body
tampered = presign("GET")[:-4] + "0000"
status, _ = call(tampered, "GET")
print(("PASS" if status == 403 else "FAIL") + f"  AC-209 S3 буруу гарын үсэг → {status} (403 хүлээгдэнэ)")
ok &= status == 403
sys.exit(0 if ok else 1)
PY
[ $? -eq 0 ] || fails=$((fails + 1))

echo
if [ "$fails" -eq 0 ]; then echo "compose-health: бүгд тэнцлээ"; else echo "compose-health: $fails алдаа" >&2; exit 1; fi
