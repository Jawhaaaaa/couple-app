#!/usr/bin/env bash
# DEV build-ийн контейнерийн entrypoint (T-89, LLD §4.5 `expo-dev`, profile `devbuild`).
#
#   metro  (анхдагч) — S-99 хуудсыг бөглөөд Expo Go-д Metro: exp://<LAN_IP>:<METRO_PORT>
#   apk              — expo prebuild + gradle assembleRelease → /out/aura-<хувилбар>.apk, S-99 шинэчилнэ
#   page             — зөвхөн S-99 хуудас (/out/index.html, version.json)
#   <бусад>          — тушаалыг шууд ажиллуулна (жишээ `bash`)
#
# /app/mobile нь хостын bind mount; node_modules ба android/ нь контейнерийн (нэртэй) volume — хостын
# (Windows) binary-тай холилдохгүй, репод prebuild-ийн гаралт орохгүй.
set -euo pipefail

MOBILE=/app/mobile
OUT=${DOWNLOAD_OUT:-/out}
METRO_PORT=${METRO_PORT:-8081}
export METRO_PORT DOWNLOAD_OUT="$OUT"

need_lan_ip() {
  if [ -z "${LAN_IP:-}" ]; then
    echo "LAN_IP тохируулаагүй. .env-д утас хүрэх DEV машины IP-г бич (Windows: ipconfig, macOS: ipconfig getifaddr en0)." >&2
    exit 2
  fi
  # Metro-гийн exp:// URL ба bundle-ийн хост
  export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP"
  # APK/Expo Go-оос backend: утас localhost-д хүрэхгүй
  export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://$LAN_IP:${HOST_PORT:-8080}}"
}

ensure_deps() {
  cd "$MOBILE"
  if [ ! -d node_modules/expo ] || ! cmp -s package-lock.json node_modules/.aura-lock; then
    echo "npm ci (package-lock өөрчлөгдсөн эсвэл node_modules хоосон)…"
    npm ci --no-audit --no-fund
    cp package-lock.json node_modules/.aura-lock
  fi
}

render_page() {
  mkdir -p "$OUT"
  node /app/deploy/dev/download/render.mjs --out "$OUT" "$@"
}

build_apk() {
  # Эх кодыг контейнерийн дотоод хавтас руу хуулж тэнд prebuild хийнэ: android/ хост руу (bind mount)
  # бичигдэхгүй. node_modules — ижил нэртэй volume /build/mobile/node_modules-д ч mount хийгдсэн.
  local build=/build/mobile
  mkdir -p "$build"
  find "$build" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
  tar -C "$MOBILE" --exclude=./node_modules --exclude=./android --exclude=./ios --exclude=./.expo --exclude=./dist -cf - . \
    | tar -C "$build" -xf -
  cd "$build"
  echo "expo prebuild (/build/mobile/android)…"
  npx expo prebuild --platform android --no-install
  # DEV APK: backend нь LAN-ийн http (GAP-04/GAP-10). Release manifest-д cleartext-ийг зөвшөөрнө —
  # зөвхөн энэ контейнер дахь үүсгэсэн файлд, mobile/ репод өөрчлөлтгүй.
  manifest=android/app/src/main/AndroidManifest.xml
  grep -q 'usesCleartextTraffic="true"' "$manifest" \
    || sed -i 's/<application /<application android:usesCleartextTraffic="true" /' "$manifest"
  cd android
  # Release build нь Expo-гийн template-ийн debug keystore-оор гарын үсэг зурна — DEV туршилтад л
  ./gradlew --no-daemon -Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g" assembleRelease
  apk=$(ls -t app/build/outputs/apk/release/*.apk | head -1)
  echo "APK: $apk ($(du -h "$apk" | cut -f1))"
  render_page --apk "$apk"
}

cmd=${1:-metro}
case "$cmd" in
  metro)
    need_lan_ip
    ensure_deps
    render_page
    echo "Expo Go: exp://$LAN_IP:$METRO_PORT  ·  S-99: http://$LAN_IP:${DOWNLOAD_PORT:-8099}"
    cd "$MOBILE"
    exec npx expo start --lan --port "$METRO_PORT"
    ;;
  apk)
    need_lan_ip
    ensure_deps
    build_apk
    ;;
  page)
    need_lan_ip
    ensure_deps
    render_page
    ;;
  *)
    exec "$@"
    ;;
esac
