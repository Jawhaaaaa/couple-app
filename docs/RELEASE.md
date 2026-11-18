<!-- LAB-2 · release · Код + тест · 2026-11-14 -->
# Хувилбар гаргах

Aura нэг Expo кодоос гурван замаар түгээгдэнэ (FR-17.1…17.4):

| Зам | Хэнд | Хэрхэн | Бүртгэл |
|---|---|---|---|
| **PWA** (гол) | iPhone ба Android | `deploy/deploy.sh` — prod-ийн `mobile-web` image (`docs/OPERATIONS.md`) | Төлбөргүй |
| **APK** (DEV) | Android | `docker compose --profile devbuild run --rm expo-dev apk` → S-99 татах хуудас | Төлбөргүй |
| **Expo Go** (DEV) | iPhone ба Android | `docker compose --profile devbuild up expo-dev` → `exp://<LAN_IP>:<порт>` QR | Төлбөргүй |
| **EAS Build + Submit** | App Store, Google Play | Доорх командууд | Apple $99/жил (GAP-02), Play $25 (GAP-03), Expo акаунт (үнэгүй) |

Энэ гаргалтад EAS-ийн замыг ашиглахгүй (эзний шийдвэр §2-8). Тохиргоо нь бэлэн байгаа тул бүртгэл үүссэн
өдөр доорх алхмаар шууд гаргана.

## Expo SDK-ийн түгжээ

Апп нь **Expo SDK 58**-д түгжигдсэн: App Store-ийн Expo Go нь SDK 58-ийг л ажиллуулдаг (шаардлага §8.2).
Дараагийн SDK руу шилжих нөхцөл:

1. App Store ба Play Store-ийн Expo Go шинэ SDK-д шилжсэн (expo.dev/go-оос шалгана).
2. `npx expo install expo@^<N>.0.0 && npx expo install --fix`, дараа нь `npx expo-doctor` 0 алдаа.
3. `expo/bundledNativeModules.json`-д байхгүй native сан гараагүй (`policy-guards.test.ts`).
4. Бүтэн хаалга ногоон (доорх «Гаргахаас өмнө»), бодит утсан дээр `docs/MANUAL-TEST.md`.

## Тохиргооны файлууд

| Файл | Агуулга |
|---|---|
| `mobile/app.json` | Суурь: нэр, slug, semver хувилбар, scheme, вэб (`output: single`), router. Вэбийн шалгалт ба татах хуудас үүнийг уншина |
| `mobile/app.config.ts` | Native: `mn.aura.couple`, build дугаар, дүрс, splash, зөвшөөрлийн тайлбар, plugin, EAS project id |
| `mobile/locales/en.json`, `mn.json` | iOS зөвшөөрлийн тайлбар Англи (Info.plist) ба Монгол (InfoPlist.strings) |
| `mobile/eas.json` | `development` · `preview` · `production` profile, `submit.production` |
| `docs/store/` | Store-ийн бичвэр, шалгагчийн тэмдэглэл, маягтууд |

Дүрс ба splash-ийг `node mobile/scripts/generate-pwa-icons.mjs` үүсгэнэ (өнгө нь `src/theme/tokens.ts`-ээс).
Тохиргоог шалгах: `cd mobile && npx expo config --type public` ба `npx jest app-config` (AC-61).

## Хувилбарын дугаар

- **Semver** (`1.2.0`) — `mobile/app.json → expo.version`. Хэрэглэгчид S-91 «Тухай»-д харагдана.
  Build үед `EXPO_PUBLIC_APP_VERSION`-оор дарж болно.
- **Build дугаар** — iOS `buildNumber`, Android `versionCode`. `EXPO_PUBLIC_BUILD` бүхэл тоо бол
  түүнийг, эс бол 1. EAS Build-д `cli.appVersionSource: remote` тул EAS сервер дугаарыг хадгалж
  `production` profile-д (`autoIncrement`) build бүрд нэмэгдүүлнэ.
- **Commit SHA** — `EXPO_PUBLIC_COMMIT_SHA` (deploy-ийн `AURA_COMMIT_SHA`).
- Сервер `version.json`-ий `minVersion`-оос хуучин апп S-97 «Шинэчлэх шаардлагатай» харуулна.

Хувилбар өргөх дараалал:

```bash
cd mobile
npm version minor --no-git-tag-version   # package.json
# app.json → expo.version-ийг ижил утгаар засна
git commit -am "Хувилбар 1.1.0"
git tag v1.1.0 && git push --follow-tags  # CI-ийн eas-build job tag дээр ажиллана (EXPO_TOKEN байвал)
```

## Гаргахаас өмнө

```bash
cd mobile
npm ci && npx tsc --noEmit && npx expo lint && npx jest --ci && npx expo-doctor && npm run export:web
docker build mobile
cd ../backend && ./mvnw -B verify
```

Бүгд ногоон байх ёстой. GitHub Actions энэ бүртгэлд `startup_failure`-тэй (NFR-18) тул хаалга нь локал шалгалт.

## EAS — анхны тохиргоо (нэг удаа)

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init                    # Expo дээр project үүсгэнэ → project id
export EAS_PROJECT_ID=<project id>         # app.config.ts → extra.eas.projectId
npx eas-cli@latest credentials             # Android keystore-ийг EAS үүсгэнэ; iOS-д Apple акаунт
```

`EAS_PROJECT_ID`-ийг EAS-ийн орчны хувьсагчид (`eas env:create --name EAS_PROJECT_ID`) эсвэл CI-ийн
secret-д хадгална. `EXPO_TOKEN` (CI) — expo.dev → Access tokens; репод бичихгүй.

`EXPO_PUBLIC_*` утгууд bundle-д шигтгэгдэнэ — нууц утга хэзээ ч бүү өг. Build бүрд хэрэгтэй нь:
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_OAUTH_GOOGLE` (`eas env:create --environment production`).

## EAS Build

| Profile | Зорилго | Гаралт |
|---|---|---|
| `development` | Дотоод туршилт, debug | Android APK (debug), iOS simulator build |
| `preview` | Дотоод тестерүүд (internal distribution) | Android APK, iOS ad hoc (бүртгэсэн төхөөрөмж) |
| `production` | Store | Android App Bundle (`.aab`), iOS `.ipa` |

```bash
cd mobile
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform all --profile production
```

Expo Go-д байхгүй native модуль ашиглахгүй тул development profile нь `expo-dev-client`-гүй — Expo Go-оор
ажиллуулах нь хангалттай (§8.2).

## EAS Submit

```bash
cd mobile
# Google Play: Play Console-д апп үүсгэж, service account JSON-ийг EAS-д оруулна (eas credentials)
npx eas-cli@latest submit --platform android --profile production --latest
# App Store: Apple Developer Program шаардлагатай (GAP-02); App Store Connect-ийн апп id-г асууна
npx eas-cli@latest submit --platform ios --profile production --latest
```

`submit.production.android` нь `internal` track-д ноорог болгож илгээнэ. Шалгасны дараа Play Console-оос
production руу дэвшүүлнэ. Store-ийн бичвэр, маягт — `docs/store/`.

## Шалгагчийн акаунт

Store-ийн шалгалтад илгээх бүрд review серверт хоёр demo акаунт үүсгэж хос болгоно (S-04 → S-08 → S-09).
Нууц үгийг зөвхөн App Store Connect / Play Console-ийн маягтад бичнэ, репод хэзээ ч бичихгүй.
Шалгалт дууссаны дараа хоёр акаунтыг устгана (S-87).

## Native-д идэвхгүй хэсэг

- **Apple-ээр нэвтрэх** — код бэлэн, тугаар идэвхгүй (FR-1.5). iOS native build гарахад backend-ийн
  Apple OAuth тохиргоог асааж, `app.config.ts`-д `ios.usesAppleSignIn: true` нэмнэ.
- **Native push** — Android-д FCM (`google-services.json`, GAP-01), iOS-д APNs (GAP-02). Тохиргоо хоосон
  бол backend native сувгийг алгасна; PWA-ийн Web Push ба апп доторх мэдэгдэл ажилласаар байна.
