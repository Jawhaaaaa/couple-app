<!-- LAB-2 · test-report · DEV_TEST (дахин шалгалт, task 222) · 2026-11-18 -->
# LAB-2 Aura — DEV тест, дахин шалгалт (task 222)

Шалгасан commit: `8eb2cea6008e78533c55e883fb2eb6d6f7355ed6` (`feature/LAB-2`)
Горим: зорилтот
Өмнөх шалгалт: task 216, commit `f5d8634`. AC-198 засагдаагүй байсан (тайлан нь commit `355c35c`-ийн энэ файлд).

## 1. Дүгнэлт

**Амжилттай (`success=true`).** task 216-д унасан цорын ганц согог болох AC-198 засагдсан. Хадгалсны дараа S-31-ийн оронд Нүүр рүү буцдаг байсан алдаа байршсан хувилбар дээр давтагдсангүй. Firefox-д 170 хадгалалт бүгд давсан. Өмнө нь 39 хадгалалтаас 1 нь унадаг байв. Diff-ийн хамарсан AC-ууд мөн давсан, шинэ кодын согог илрээгүй.

| Шалгалт | Дүн |
|---|---|
| AC-198 (task 216-д унасан) | **Засагдсан.** Chromium 50/50, WebKit 50/50, Firefox 170/170 |
| AC-198 засварын зам, X товчоор хаах | Гурван хөтөч × 8/8 давсан. X товчоор хаахад S-31 хэвээр үлдсэн |
| AC-95 болзооноос дурсамж үүсгэх (`leaveEditor`-ийн өөр салаа) | Гурван хөтөч × 3/3 давсан |
| AC-143 / AC-219 route smoke (Expo SDK 58-ийн patch шинэчлэлт) | Гурван хөтөч × 81 route. Crash 0, console error 0 |
| AC-61 `app.config.ts` (`expo-web-browser` plugin) | `npx expo config` алдаагүй, `app-config.test.ts` давсан |
| AC-58 татах хуудас, APK | APK 200 (136 806 340 байт), `mn.aura.couple`, minSdk 24. Хуудсанд APK, Expo Go, PWA-ийн QR бий |

AC-ийн тоо: **дахин шалгасан 6 · өмнөх дүнгээр 213 · нийт 232 AC**. Утсан дээр гараар шалгах 13 AC шалгагдаагүй. Эдгээрийг DEV_APPROVE-д үлдээв (§6).

## 2. Шалгасан хувилбар ба орчин

- **Байршсан stack:** `docker compose -p lab-2`. 7 контейнер ажиллаж байсан, healthcheck-тэй бүгд `healthy`. `DEPLOYED.md`-ийн commit нь `8eb2cea` (HEAD).
- **Хаягууд:** API `http://10.0.19.235:18114` (`/actuator/health` нь `UP`), mobile-web `:18115`, татах хуудас `:18116`, Metro `:18117`, Mailpit `:18119`.
- **Эх кодын тулгалт:** `f5d8634..8eb2cea`-д өөрчлөгдсөн 14 файл байршсан эх (`local-dev/github-dev/lab-2/src`)-д байт түвшинд тэнцүү (`cmp`).
- **Bundle-ийн тулгалт:** байршсан bundle-ийн `memory-editor-*.js` chunk-д засварын код бий (`isLeavingEditor`, `popstate`).
- **CI:** HEAD-ийн GitHub Actions run `44225922237` (`8eb2cea`) `success`. Ногоон job-ууд:
  - mobile: tsc, lint, jest, export
  - backend: `./mvnw verify`
  - dependency audit
  - prod багц
  - e2e гурван хөтөч: chromium-pixel7, webkit-iphone14, firefox-mobile

  EAS build `skipped`, учир нь EAS token байхгүй.
- **Хэрэгсэл:** Playwright 1.65.0. Төхөөрөмжийн профайл: Pixel 7 (Chromium), iPhone 14 (WebKit), iPhone 14-ийн viewport (Firefox).

## 3. Шалгалтын үр дүн

### 3.1 AC-198 — өмнө унасан согог (байршсан UI)

Скрипт: `ac198-deployed.spec.ts`. Хэрэглэгчийг `POST /auth/register` ба Mailpit-ийн кодоор бүртгэж, хос болгосон.

**Давталт бүрийн алхам:**
1. S-32-д зураг сонгож, гарчиг оруулаад хадгална.
2. `POST /memories` 201 буцаана.
3. S-31 нээгдэж, гарчиг таарна.
4. 1.5 секундын дараа URL `/memories/<шинэ id>` хэвээр, S-31 харагдсаар байна.
5. Хөтчийн «Буцах» нь editor-ыг нээсэн дэлгэц рүү буцаана (`/home` эсвэл S-30). Ингэснээр history stack дахь editor-ын entry үлдээгүй нь батлагдана.

**Дүн:**

| Хөтөч | Нүүрээс | Timeline-аас | Нийт | DB-ийн тоо |
|---|---|---|---|---|
| chromium-pixel7 | 40/40 | 10/10 | 50/50 | 50 |
| webkit-iphone14 | 40/40 | 10/10 | 50/50 | 50 |
| firefox-mobile (1) | 40/40 | 10/10 | 50/50 | тоолоогүй¹ |
| firefox-mobile (2) | 40/40 | 10/10 | 50/50 | 50 |
| firefox-mobile (3) | 60/60 | 10/10 | 70/70 | 70 |

¹ Эхний ажиллалтад скрипт `GET /memories`-ийн эхний хуудсыг (30) л тоолсон. Энэ нь скриптийн алдаа. Навигацийн 50 шалгалт бүгд давсан. Дараагийн ажиллалтуудад хуудаслалтаар бүх хуудсыг тоолсон.

Firefox-д нийт 170 хадгалалтын 0 нь унасан. Хуучин алдааны давтамж (1/39) хэвээр байсан бол 170 оролдлогод нэг ч удаа гарахгүй байх магадлал ≈ 1.3%.

**Нэмэлт шалгалт:**
- Засварын зам: S-31-ээс засах, хадгалах (`PATCH` 200), 1 секунд хүлээх. URL `/memories/<id>` ба шинэ гарчиг хэвээр байсан. Гурван хөтөч × 8/8.
- X товчоор хаах (`sheet-close`): засварын editor-ыг хадгалахгүйгээр хаахад S-31 хэвээр үлдсэн. Гурван хөтөчид давсан.

### 3.2 Diff-ийн хамарсан AC-ууд

`git diff --stat f5d8634..8eb2cea`: 14 файл. Үүнээс `mobile/src/memories/leaveEditor.ts`, `memory-editor.tsx`, `mobile/package.json` (Expo SDK 58-ийн patch, `expo-router` 58.0.32 оролцоно), `app.config.ts`, `compliance.yaml`, `scripts/audit-gate.mjs`, `ci.yml` нь кодын өөрчлөлт.

- **AC-95** (`leaveEditor`-ийн «болзооноос» салаа). Өнгөрсөн болзоонд «Дурсамж болгох» дарж S-32-д бөглөгдсөн гарчгийг шалгаад хадгална (`POST` 201). 1 секундын дараа URL `/plans/<id>` хэвээр, S-54 харагдана. «Дурсамжийг үзэх» нь тэр дурсамжийг нээнэ. Гурван хөтөч × 3/3.
- **AC-143 / AC-219** (`smoke-deployed.spec.ts`). `support/routes.ts`-ийн `ROUTES`-ийг байршсан хувилбар дээр хөтөч бүрд нээсэн: нэвтрээгүй 8, хосгүй 4, хостой 69 route. Гурван хөтөчид бүгд нээгдэж, crash 0, console error 0. S-38 (жилийн хураангуй) серверийн цагийг шилжүүлэх тестийн endpoint шаарддаг. Dev profile-д тэр endpoint байхгүй (`PUT /test/clock` → 404) тул энд алгасав. Тэр route CI-ийн smoke-д давсан.
- **AC-61** (`expo-web-browser` config plugin нэмэгдсэн). `npx expo config --type public`-ийн гаралт: `sdkVersion 58.0.0`, `bundleIdentifier`/`package` `mn.aura.couple`, `version 1.0.0`. `src/__tests__/app-config.test.ts` давсан.
- **AC-58** (APK дахин build хийгдсэн).
  - `GET :18116/aura-1.0.0.apk` → 200, 136 806 340 байт.
  - `aapt dump badging` (`reactnativecommunity/react-native-android:v22.0`): `package: name='mn.aura.couple' versionName='1.0.0'`, `sdkVersion:'24'`, `targetSdkVersion:'36'`, `application-label:'Aura'`.
  - Татах хуудас 200 бөгөөд `qr-apk`, `qr-expo`, `qr-pwa` агуулна.
  - `apk-build.log`: `BUILD SUCCESSFUL`.
- **Expo Go.**
  - `:18117/status` → `packager-status:running`.
  - iOS manifest-ийн утгууд: `runtimeVersion exposdk:58.0.0`, `mn.aura.couple`.
  - iOS bundle 200, 6 060 015 байт.
- **Unit ба төрлийн шалгалт** (локал, HEAD):
  - `npx tsc --noEmit` алдаагүй.
  - `npx jest --ci`: 124 suite, 1051 давсан, 1 алгассан, 0 унасан. Алгассан нь `pwaManifest.test.ts`-ийн AC-140 `dist/`-ийн тест бөгөөд локалд export хийгээгүй үед л алгасагддаг. Байршсан HTML-д manifest ба iOS meta бий.
  - Засварын тест `leaveEditor.test.ts` ба `memoryEditor.test.tsx`: 19/19.
- **Dependency audit** (NFR-05, NFR-18).
  - `node --test scripts/audit-gate.test.mjs`: 11/11.
  - `node scripts/audit-gate.mjs mobile`: чөлөөлөгдөөгүй high/critical 0. Picomatch-ийн GHSA-fc5q-39xc-vjpf чөлөөлөлттэй. Эзэн нь Jawhaaaaa, хугацаа 2026-12-18, засвартай хувилбар алга.
  - `e2e`: advisory 0.
- **Гол урсгалын smoke.** UI-аар нэвтэрч, дурсамж нэмж, DB-д хадгалагдсаныг шалгасан (§3.1-ийн DB-ийн тоо).

### 3.3 Өмнөх дүнгээр (213 AC)

Diff нь backend, гэрээ, бусад дэлгэцэд хүрээгүй. HEAD-ийн CI run бүх job-оор ногоон (e2e гурван хөтөч), гол урсгалын smoke давсан. Тиймээс task 216, 210-ын «давсан» дүнг зааврын 3-р дүрмээр дахин ашиглав. Үүнд гэрээний нийцэл (138/138 хариу) ба AC-76 орно.

## 4. Кодын согог

Байхгүй.

## 5. Ажиглалт (согог биш)

- `npm audit` (mobile) нь 71 high advisory харуулдаг. Audit gate бүгдийг ганц advisory (picomatch, GHSA-fc5q-39xc-vjpf)-д холбож чөлөөлдөг. Засвартай хувилбар гармагц эсвэл 2026-12-18-нд gate өөрөө унана.
- Байршсан `.env`-д VAPID түлхүүр хоосон хэвээр. Энэ нь DEV (http, LAN) орчинд хүлээгдсэн зүйл (GAP-04).
- Апп API-г `http://10.0.19.235:18114` хаягаар дууддаг. Тиймээс PWA-г `localhost:18115`-аас нээвэл refresh cookie өөр сайтынх болж, хуудсыг дахин ачаалахад нэвтрэлт алдагдана. Энэ удаагийн шалгалтыг LAN хаягаар (`10.0.19.235:18115`) хийсэн. Утас ч LAN хаягаар нээнэ. Production-д API ба апп нэг HTTPS домэйнд байрлах тул энэ асуудал гарахгүй.
- Байршсан backend-ийн `GET /api/v1/version` нь `commitSha: "0000000"`, `build: "dev"` буцаадаг. DEV build-д commit дамжуулагдаагүй байна. FR-18.7-ийн S-91 дээрх commit SHA DEV-д бодит утгаа харуулахгүй. AC-д шууд хамааралгүй тул согог гэж тооцоогүй.

## 6. Шалгагдаагүй

- Утсан дээр гараар шалгах 13 AC (`docs/MANUAL-TEST.md`). Бодит Android, iPhone, PWA push, камерын QR зэрэг эдгээрийг DEV_APPROVE-д хүнд үлдээв.
- iOS standalone build — Apple Developer бүртгэл шаардлагатай (GAP-02).
- S-38 route-ыг байршсан хувилбар дээр нээгээгүй (§3.2). CI-ийн smoke-д давсан.

## 7. Нотолгоо

`artifacts/LAB-2/222/evidence/`-д:
- `ac198-deployed.spec.ts` — AC-198, AC-95, засварын давталт.
- `smoke-deployed.spec.ts` — байршсан хувилбарын route smoke.

Ажиллуулах орчин: `E2E_BASE_URL=http://10.0.19.235:18115 E2E_API_URL=http://10.0.19.235:18114 E2E_MAILPIT_URL=http://localhost:18119`. Скриптүүдийг `e2e/tests/qa222/`-д байрлуулж ажиллуулсан. Тэдгээрийг git-д оруулаагүй.
