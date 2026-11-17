<!-- LAB-2 · test-report · DEV_TEST · 2026-11-17 -->
# LAB-2 Aura — DEV тест (байршуулсан хувилбарын шалгалт)

## 1. Дүгнэлт

**Амжилтгүй (`success=false`).** Шалгасан commit дээр 4 кодын согог илэрсэн (§4). AC-ийн автомат шалгалтын 217/218 нь давсан. Цорын ганц уналт нь AC-198 (Firefox, тогтворгүй). Нэмээд API хариу `contracts/openapi.yaml`-ийн schema-д нийцэхгүй байна (§4-1).

| Ангилал | Тоо |
|---|---|
| Spec-ийн нийт AC | 232 |
| Автоматаар шалгасан, давсан | 217 (үүнээс 9 нь ГАР хэсэгтэй, AC-76 нь тестийн race-тэй, AC-161 нь хэсэгчлэн) |
| Автоматаар шалгасан, унасан | 1 — AC-198 |
| Шалгагдаагүй — төхөөрөмж/хүн (DEV_APPROVE) | 13 — AC-12, AC-16, AC-50, AC-51, AC-59, AC-60, AC-101, AC-124, AC-142, AC-148, AC-159, AC-163, AC-218 |
| Зөвхөн код хяналт (runtime шалгалтгүй) | 1 — AC-203 |

## 2. Шалгасан хувилбар ба орчин

- Commit: `15e94b18231cf0687016ed6f39726077fc9cf734` (`feature/LAB-2`). `DEPLOYED.md`-ийн commit ба `EXPO_PUBLIC_COMMIT_SHA` нь энэ commit-той тэнцүү.
- **Deployed stack** (`docker compose -p lab-2`, `SPRING_PROFILES_ACTIVE=dev`): API `http://10.0.19.235:18114`, mobile-web `:18115`, татах хуудас `:18116`, Metro `:18117`, S3 `:18118`, Mailpit `:18119`. 7 контейнер бүгд healthy байсан.
- **QA stack** (`docker compose -p lab2qa`, ижил commit, `dev,e2e` profile, порт 18190–18192): deployed backend тестийн endpoint-гүй (`/api/v1/test/*` → 404, зөв). Иймээс цагийн удирдлага, seed шаарддаг E2E, k6-г тусдаа stack дээр ажиллуулсан. Тохиргоо нь CI-ийн e2e job-той ижил: тестийн IdP, Open-Meteo mock, түр VAPID. Web build: `EXPO_PUBLIC_OAUTH_GOOGLE=true`, `EXPO_PUBLIC_BUILD=qa`, `EXPO_PUBLIC_COMMIT_SHA=<дээрх>`.
- Хост: Windows 11, Docker Desktop (20 CPU), Node 24.18, JDK 25 (төсөл `release 21`), Playwright 1.65.

## 3. Шалгалтын үр дүн

| Шалгалт | Хаана | Үр дүн |
|---|---|---|
| Backend `./mvnw -B verify` (JUnit + Testcontainers IT, ArchUnit) | repo | **291 тест, 0 уналт**, BUILD SUCCESS (5 мин 59 с) |
| Mobile `npx tsc --noEmit` | repo | 0 алдаа |
| Mobile `npx jest --ci --runInBand` | repo | **123/123 suite, 1045/1045 тест** |
| `npm run export:web` (эхний ачааллын JS-ийн төсөв, AC-160) | repo | 840.3 KB gzip / 1536 KB — OK |
| E2E Playwright — Pixel 7 (Chromium) | QA stack | 164 давсан, 3 унасан, 3 алгассан → 3 уналт нь миний build-ийн env-ийн зөрүү (OAuth товч, build/commit). Тохирох build дээр дахин ажиллуулахад **3/3 давсан** |
| E2E Playwright — iPhone 14 (WebKit) | QA stack | 135 давсан, **1 унасан (AC-76, тестийн race — §4-4)**, 34 алгассан |
| E2E Playwright — Firefox | QA stack | 137 давсан, **1 унасан (AC-198 — §4-3)**, 32 алгассан |
| `AC_COVERAGE_STRICT=1` (AC-211) | QA stack | давсан — автомат AC бүр ≥ 1 тесттэй |
| `deploy/tests/compose-health.test.sh` (AC-209) | **deployed lab-2** | 10/10 PASS (5 үйлчилгээ healthy, SMTP→Mailpit, S3 sigv4 presigned PUT/GET, буруу гарын үсэгт 403) |
| `deploy/tests/prod-config.test.sh` (AC-151, AC-161, AC-162) | repo | бүгд PASS; өөрийн Dockerfile-ийн arm64 build (`ARM64_BUILD=1`) алгасагдсан |
| `deploy/tests/backup-restore.test.sh` (AC-151, AC-204) | тусдаа `aura-bt` | бүгд PASS (69 хүснэгт, мөрийн тоо тэнцүү, эвдсэн manifest-ийг илрүүлэв) |
| k6 `load/aura.k6.js` (AC-150, 1 000 хос, 200 WS, 5/20 req/s) | QA stack | compose сүлжээн дотроос: api p95 **14.9 ms**, алдаа 0%, STOMP **200/200**, exit 0. Хостоос (`host.docker.internal`): REST босго давсан (p95 20.4 ms), харин 3/200 WS handshake 30 с timeout, exit 99. Backend логт алдаа байхгүй тул Docker Desktop-ийн port-forward-ын саатал гэж ангилав |
| Deployed API урсгал ба гэрээ (`deployed-smoke`) | **deployed lab-2** | 41 шалгалтаас 40 давсан, 1 нь VAPID тохиргоогүй (орчин). 175 хариуг OpenAPI schema-тай тулгаснаас **зөрчил** гарсан (§4-1, §4-2) |
| Deployed UI урсгал (Playwright, Pixel 7 + iPhone 14) | **deployed lab-2** | 10/10: UI бүртгэл → Mailpit код → S-07 → S-13 (хоёр хөтөч), S-20, зүрх A→B ANIM-02 127–234 ms (AC-17), удаан дарах → HUG (AC-76), чат A→B 198–260 ms (AC-27), console error 0 (AC-143) |
| Deployed PWA | **deployed lab-2** | `manifest.json` (standalone, 192/512/maskable), `sw.js` 200, iOS meta, `apple-touch-icon` 180, splash, `/memories` SPA fallback 200, bundle-ийн API = `http://10.0.19.235:18114` |
| APK | **deployed lab-2** | `aura-1.0.0.apk` 200, 136 783 772 B; `aapt2 dump badging`: `package: name='mn.aura.couple' versionName='1.0.0'`, minSdk 24, targetSdk 36 — `app.config.ts`-ийн `BUNDLE_ID`-тай таарна |
| Expo Go | **deployed lab-2** | `/status` → `packager-status:running`; iOS/Android manifest 200, `runtimeVersion exposdk:58.0.0` |
| Татах хуудас S-99 (AC-58) | **deployed lab-2** | E2E (`E2E_DOWNLOAD_URL`) гурван хөтчид PASS: APK QR, `exp://10.0.19.235:18117` QR, PWA хаяг, APK URL 200 |
| Лог дахь агуулга (NFR-06) | **deployed lab-2** | Илгээсэн мессеж, захидал, хариулт, check-in, бэлэг, нууц үгийн 6 тэмдэгт мөр логт 0 удаа |
| `docs/CONTENT-SAMPLE.md` (AC-148) | repo | Энэ шатанд гаргав: асуулт 15 + санаа 15, seed `20261117` |

## 4. Кодын согог

1. **Гэрээний зөрчил: required+nullable талбар хариунаас алга болдог.** `backend/src/main/resources/application.yml:37` нь `spring.jackson.default-property-inclusion: non_null` гэж тохируулсан. Иймээс утга нь `null` үед гэрээнд `required` гэж заасан талбар JSON-оос бүрэн хасагдана. Deployed дээр бодитоор ажигласан тохиолдлууд:
   - `myView.partnerNickname`: `POST /pairings/{id}/confirm`, `PUT /couple/start-date`, `GET /couple`;
   - `myAnswer`: `GET /questions/today`;
   - `nextCursor`: `GET /memories`, `GET /questions/history`, `GET /notifications`;
   - `today.status`: `GET /me/first-week-tasks`.

   Гэрээнд ийм талбар дор хаяж 17 бий (`Me.policyVersionAccepted`, `BreakupState.restoreDeadline`, `NextMeetup.at`, `Dashboard.counter`, `CommentPage.nextCursor`, `MessageSearchPage.nextCursor`, `BudgetLine.plannedMnt`, `Reminder.sourceId` г.м.). Апп-ын урсгал унахгүй (E2E давсан). Гэхдээ хариу `contracts/openapi.yaml`-ийг зөрчиж байгаа бөгөөд backend IT хариуны schema-г шалгадаггүй тул энэ зөрчлийг барьдаггүй. Хоёр засах арга бий: ийм талбаруудад `@JsonInclude(ALWAYS)` тавих, эсвэл гэрээнээс `required`-ийг хасах. Аль замыг сонгосныг хариуны schema-гийн тестээр батална.
2. **Гэрээнд зарлагдаагүй статус.** Эхний chunk 415 `MEDIA_TYPE_FORBIDDEN`-ээр татгалзсаны дараа `POST /uploads/{id}/complete` 410 буцаадаг ч гэрээнд 410 зарлагдаагүй (AC-129-ийн урсгал). Мөн `GET /letters`-ийг `box` параметргүй дуудахад 400 буцаадаг ч энэ статус гэрээнд байхгүй.
3. **AC-198 / S-32 → S-31 навигацийн race (Firefox, тогтворгүй).** `mobile/src/app/memory-editor.tsx:117-118` дахь `leaveTo()` нь `router.back()`-ийн дараа `router.push('/memories/<id>')`-ийг шууд дууддаг. Вэбэд `back()` нь асинхрон `popstate` тул push-ийг дарж болно. Firefox-ийн E2E 4 ажиллалтын 1-д дурсамж үүссэн (`POST /memories` 201, trace) ч апп S-31 биш Нүүр (S-20) рүү буцсан. Хэрэглэгч хадгалсан дурсамжаа харахгүй үлдэнэ. Дахин ажиллуулж ногоон болгоод хаагаагүй.
4. **E2E тестийн race (AC-76, WebKit).** `e2e/tests/heart.spec.ts:87` нь `signal-overlay-text`-ийг гурван шалгалтын дараа уншдаг. Overlay нь `RECEIVE_MS.HUG = 1600` мс-ийн дараа алга болдог тул WebKit дээр текст олдохгүй болж тест унасан. Бүтээгдэхүүн зөв ажиллаж байна: deployed WebKit-д бие даан шалгахад overlay «A чамайг чанга тэврэлээ», `anim-HUG-received` = 1, ANIM-02 = 0 гарсан. Тест overlay-ийн текстийг гарсан даруйд нь шалгах ёстой.

## 5. Орчны саатал ба тохиргоо (кодын согог биш)

- **Web Push (FR-19.3):** deployed `.env`-д `AURA_VAPID_*` тохируулаагүй тул `GET /push/vapid-public-key` 204 буцаана. DEV (LAN, http) дээр Web Push ажиллахгүй нь GAP-04-ийн дагуу хүлээгдсэн зүйл. Web Push-ийн серверийн урсгалыг (AC-154) QA stack-ийн түр VAPID-аар E2E шалгасан.
- **`GET /version` → `commitSha: "0000000"`:** deployed backend-д commit SHA дамжуулаагүй. Апп-ын S-91 нь `EXPO_PUBLIC_COMMIT_SHA`-аас зөв SHA харуулдаг (AC-190 PASS). Deploy-ийн тохиргооны жижиг зөрүү.
- **Jest parallel (Windows):** transform cache-ийн `EPERM` алдаагаар ажиллалт бүрд өөр 2–4 suite ачааллагдаагүй. `--runInBand` горимд 123/123 давсан.
- **k6 host-ийн зам:** дээрх §3-ыг үз.
- **AC-201:** `ErrorReporterIT`-ийн `@Nested` 2 тест mvn логт давсан. Surefire XML эцэг класст `tests=0` гэж бичдэг нь тайлангийн хэлбэрийн асуудал.

## 6. Шалгагдаагүй

- Бодит утсан дээрх 13 AC: AC-12, AC-16, AC-50, AC-51, AC-59, AC-60, AC-101, AC-124, AC-142, AC-148, AC-159, AC-163, AC-218. Мөн «E2E + ГАР» AC-уудын төхөөрөмжийн хэсэг. Заавар нь `docs/MANUAL-TEST.md`-д бий.
- iOS standalone build: Apple Developer бүртгэл шаардлагатай (GAP-02).
- AC-161: өөрийн Dockerfile-ийг `--platform linux/arm64`-аар build хийгээгүй (QEMU). Суурь image-ууд arm64 manifest-тэй.
- AC-203 (зөвхөн CR).

## 7. AC бүрийн дүн

Нотолгоо нь тухайн AC ID-г нэрлэсэн тест файл ба түүний бодит ажиллалтын дүн юм. «E2E-*» нь гурван хөтөч тус бүрээр гарсан дүн.

| AC | Арга | Дүн | Нотолгоо |
|---|---|---|---|
| AC-DS-01 | UT | PASS | UT(jest): contrast.test.ts |
| AC-DS-02 | UT | PASS | UT(jest): no-hex.test.ts |
| AC-DS-03 | E2E | PASS | E2E-Pixel7: theme.spec.ts; E2E-iPhone14: theme.spec.ts; E2E-Firefox: theme.spec.ts; UT(jest): settingsScreens.test.tsx, ThemeProvider.test.tsx |
| AC-DS-04 | UT | PASS | UT(jest): font-cmap.test.ts |
| AC-DS-05 | E2E | PASS | E2E-Pixel7: large-text.spec.ts; E2E-iPhone14: large-text.spec.ts (skip); E2E-Firefox: large-text.spec.ts (skip); UT(jest): memories.test.tsx |
| AC-MO-01 | E2E | PASS | E2E-Pixel7: animations.spec.ts; E2E-iPhone14: animations.spec.ts (skip); E2E-Firefox: animations.spec.ts (skip); UT(jest): motion-off.test.tsx |
| AC-MO-02 | E2E | PASS | IT/UT(java): CelebrationIT.java; E2E-Pixel7: animations.spec.ts, occasions.spec.ts, pairing.spec.ts; E2E-iPhone14: animations.spec.ts (skip), occasions.spec.ts, pairing.spec.ts; E2E-Firefox: animations.spec.ts (skip), occasions.spec.ts, pairing.spec.ts; UT(jest): occasions.test.tsx, motion-off.test.tsx |
| AC-MO-03 | UT | PASS | UT(jest): settingsScreens.test.tsx, motion-off.test.tsx |
| AC-MO-04 | UT + ГАР | PASS · ГАР үлдсэн | UT(jest): settingsScreens.test.tsx, haptics.test.ts |
| AC-MO-05 | E2E | PASS | E2E-Pixel7: lottie-size.spec.ts; E2E-iPhone14: lottie-size.spec.ts; E2E-Firefox: lottie-size.spec.ts; UT(jest): motion-off.test.tsx |
| AC-AS-01 | UT | PASS | UT(jest): assets-registry.test.ts |
| AC-AS-02 | E2E | PASS | E2E-Pixel7: settings.spec.ts; E2E-iPhone14: settings.spec.ts; E2E-Firefox: settings.spec.ts; UT(jest): settingsScreens.test.tsx, licenses.test.ts |
| AC-AS-03 | CR | PASS | UT(jest): assets-registry.test.ts |
| AC-192 | E2E | PASS | E2E-Pixel7: layout.spec.ts; E2E-iPhone14: layout.spec.ts; E2E-Firefox: layout.spec.ts; UT(jest): ScreenState.test.tsx |
| AC-193 | UT | PASS | IT/UT(java): PolicyIT.java; UT(jest): policy-guards.test.ts |
| AC-194 | CR | PASS | UT(jest): policy-guards.test.ts |
| AC-214 | E2E | PASS | E2E-Pixel7: animations.spec.ts; E2E-iPhone14: animations.spec.ts (skip); E2E-Firefox: animations.spec.ts (skip); UT(jest): heartRefresh.test.tsx, manual-test.test.ts |
| AC-215 | UT | PASS | UT(jest): haptics.test.ts |
| AC-01 | IT + E2E | PASS | IT/UT(java): EmailVerificationIT.java, TestSupportAbsentIT.java (none); E2E-Pixel7: auth.spec.ts; E2E-iPhone14: auth.spec.ts; E2E-Firefox: auth.spec.ts |
| AC-02 | IT | PASS | IT/UT(java): RegistrationIT.java |
| AC-03 | IT | PASS | IT/UT(java): PasswordResetIT.java |
| AC-04 | E2E | PASS | IT/UT(java): ProfileIT.java, RegistrationIT.java; E2E-Pixel7: auth.spec.ts; E2E-iPhone14: auth.spec.ts; E2E-Firefox: auth.spec.ts; UT(jest): registerRules.test.ts, RegisterScreen.test.tsx |
| AC-05 | IT | PASS | IT/UT(java): LoginRateLimitIT.java |
| AC-06 | E2E + ГАР | PASS · ГАР үлдсэн | IT/UT(java): GoogleOAuthIT.java; E2E-Pixel7: oauth.spec.ts; E2E-iPhone14: oauth.spec.ts; E2E-Firefox: oauth.spec.ts |
| AC-07 | IT | PASS | IT/UT(java): RefreshTokenIT.java |
| AC-62 | E2E | PASS | IT/UT(java): ProfileIT.java, GeocodingLanguageTest.java, WeatherCacheIT.java; E2E-Pixel7: profile.spec.ts; E2E-iPhone14: profile.spec.ts; E2E-Firefox: profile.spec.ts; UT(jest): profileVersion.test.ts |
| AC-63 | IT + E2E | PASS | IT/UT(java): PolicyIT.java, RegistrationIT.java; E2E-Pixel7: auth.spec.ts; E2E-iPhone14: auth.spec.ts; E2E-Firefox: auth.spec.ts; UT(jest): policies.test.tsx, registerRules.test.ts, RegisterScreen.test.tsx, markdown.test.ts |
| AC-64 | UT | PASS | UT(jest): timezonePrompt.test.ts, TimezonePrompt.test.tsx |
| AC-164 | IT + E2E | PASS | IT/UT(java): RegistrationIT.java; E2E-Pixel7: auth.spec.ts; E2E-iPhone14: auth.spec.ts; E2E-Firefox: auth.spec.ts; UT(jest): registerRules.test.ts, RegisterScreen.test.tsx |
| AC-165 | IT | PASS | IT/UT(java): EmailVerificationIT.java, InviteIT.java |
| AC-166 | IT | PASS | IT/UT(java): PasswordResetIT.java |
| AC-167 | IT | PASS | IT/UT(java): GoogleOAuthIT.java |
| AC-168 | IT | PASS | IT/UT(java): RefreshTokenIT.java; UT(jest): client-refresh.test.ts, restore-session.test.ts |
| AC-08 | IT | PASS | IT/UT(java): InviteIT.java |
| AC-09 | IT | PASS | IT/UT(java): InviteIT.java |
| AC-10 | IT | PASS | IT/UT(java): PairingIT.java, NotificationDispatcherIT.java; E2E-Pixel7: ac-coverage.spec.ts; E2E-iPhone14: ac-coverage.spec.ts (skip); E2E-Firefox: ac-coverage.spec.ts (skip) |
| AC-11 | E2E + ГАР | PASS · ГАР үлдсэн | E2E-Pixel7: pairing.spec.ts; E2E-iPhone14: pairing.spec.ts; E2E-Firefox: pairing.spec.ts |
| AC-12 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | UT(jest): inviteCode.test.ts, manual-test.test.ts |
| AC-65 | E2E | PASS | IT/UT(java): StartDateIT.java; E2E-Pixel7: home.spec.ts, pairing.spec.ts; E2E-iPhone14: home.spec.ts, pairing.spec.ts; E2E-Firefox: home.spec.ts, pairing.spec.ts; UT(jest): home.test.tsx, StartDateProposals.test.tsx, inviteCode.test.ts |
| AC-66 | IT | PASS | IT/UT(java): SpaceAccessGuardIT.java, InviteIT.java, PairingIT.java |
| AC-67 | IT + E2E | PASS | IT/UT(java): SoloShareIT.java, MemoryIT.java; E2E-Pixel7: pairing.spec.ts; E2E-iPhone14: pairing.spec.ts; E2E-Firefox: pairing.spec.ts; UT(jest): memories.test.tsx |
| AC-68 | E2E | PASS | IT/UT(java): NotificationDispatcherIT.java; E2E-Pixel7: pairing.spec.ts; E2E-iPhone14: pairing.spec.ts; E2E-Firefox: pairing.spec.ts |
| AC-169 | UT + E2E | PASS | IT/UT(java): InviteCodeGeneratorTest.java, InviteIT.java; E2E-Pixel7: pairing.spec.ts; E2E-iPhone14: pairing.spec.ts; E2E-Firefox: pairing.spec.ts; UT(jest): inviteCode.test.ts |
| AC-170 | IT + E2E | PASS | IT/UT(java): PairingIT.java; E2E-Pixel7: pairing.spec.ts; E2E-iPhone14: pairing.spec.ts; E2E-Firefox: pairing.spec.ts |
| AC-171 | IT | PASS | IT/UT(java): CoupleBreakupIT.java, InviteIT.java |
| AC-13 | UT | PASS | IT/UT(java): CoupleCalendarTest.java, DashboardIT.java; E2E-Pixel7: home.spec.ts; E2E-iPhone14: home.spec.ts; E2E-Firefox: home.spec.ts; UT(jest): home.test.tsx, dates.test.ts |
| AC-14 | UT + E2E | PASS | IT/UT(java): DashboardIT.java; E2E-Pixel7: home.spec.ts; E2E-iPhone14: home.spec.ts; E2E-Firefox: home.spec.ts; UT(jest): home.test.tsx, partnerTime.test.ts |
| AC-15 | IT + E2E | PASS | IT/UT(java): DailyQuestionIT.java; E2E-Pixel7: question.spec.ts; E2E-iPhone14: question.spec.ts; E2E-Firefox: question.spec.ts; UT(jest): question.test.tsx |
| AC-16 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | — |
| AC-69 | UT | PASS | IT/UT(java): CoupleCalendarTest.java, DashboardIT.java; E2E-Pixel7: home.spec.ts; E2E-iPhone14: home.spec.ts; E2E-Firefox: home.spec.ts; UT(jest): dates.test.ts |
| AC-70 | IT | PASS | IT/UT(java): PresenceIT.java |
| AC-71 | UT + E2E | PASS | IT/UT(java): DashboardIT.java, WeatherCacheIT.java; E2E-Pixel7: home-cards.spec.ts; E2E-iPhone14: home-cards.spec.ts; E2E-Firefox: home-cards.spec.ts; UT(jest): weatherCard.test.tsx |
| AC-72 | E2E | PASS | IT/UT(java): DashboardSectionsIT.java; E2E-Pixel7: home.spec.ts; E2E-iPhone14: home.spec.ts; E2E-Firefox: home.spec.ts; UT(jest): home.test.tsx, no-noop-actions.test.ts |
| AC-73 | UT + E2E | PASS | IT/UT(java): DashboardSectionsIT.java; E2E-Pixel7: home.spec.ts; E2E-iPhone14: home.spec.ts; E2E-Firefox: home.spec.ts; UT(jest): onThisDay.test.tsx |
| AC-74 | UT | PASS | IT/UT(java): CoupleSettingsIT.java, DashboardIT.java; UT(jest): geo.test.ts, partnerTime.test.ts |
| AC-75 | UT | PASS | IT/UT(java): DailyQuestionIT.java, QuestionPickerTest.java; UT(jest): question.test.tsx |
| AC-17 | E2E | PASS | IT/UT(java): HeartSignalIT.java; E2E-Pixel7: heart.spec.ts; E2E-iPhone14: heart.spec.ts; E2E-Firefox: heart.spec.ts; UT(jest): heartButton.test.tsx, signalReceiver.test.tsx |
| AC-18 | E2E | PASS | IT/UT(java): HeartSignalIT.java; E2E-Pixel7: heart.spec.ts; E2E-iPhone14: heart.spec.ts; E2E-Firefox: heart.spec.ts; UT(jest): home.test.tsx, persist.test.ts |
| AC-19 | IT + E2E | PASS | IT/UT(java): HeartSignalIT.java; E2E-Pixel7: heart.spec.ts; E2E-iPhone14: heart.spec.ts; E2E-Firefox: heart.spec.ts; UT(jest): heartButton.test.tsx |
| AC-76 | E2E + ГАР | PASS (бүтээгдэхүүн) · E2E тестийн race · ГАР үлдсэн | E2E-Pixel7: heart.spec.ts; E2E-iPhone14: heart.spec.ts (fail); E2E-Firefox: heart.spec.ts; UT(jest): heartButton.test.tsx, signalReceiver.test.tsx; Pixel7/Firefox PASS; iPhone14 E2E heart.spec.ts:87 overlay (1.6 с) алга болсны дараа текст шалгадаг race; deployed WebKit-д бие даан шалгахад HUG overlay «A чамайг чанга тэврэлээ», ANIM-02 0 — PASS |
| AC-77 | UT + E2E | PASS | IT/UT(java): HeartSignalIT.java; E2E-Pixel7: heart.spec.ts; E2E-iPhone14: heart.spec.ts; E2E-Firefox: heart.spec.ts; UT(jest): thinking.test.tsx, signalReceiver.test.tsx |
| AC-78 | IT | PASS | IT/UT(java): HeartSignalIT.java |
| AC-20 | E2E + ГАР | PASS · ГАР үлдсэн | IT/UT(java): QuotaIT.java, UploadResumeIT.java; E2E-Pixel7: memory-create.spec.ts; E2E-iPhone14: memory-create.spec.ts; E2E-Firefox: memory-create.spec.ts; UT(jest): blobStoreWeb.test.ts, uploadQueue.test.ts |
| AC-21 | IT | PASS | IT/UT(java): ImageProcessorIT.java, UploadResumeIT.java; E2E-Pixel7: memory-create.spec.ts; E2E-iPhone14: memory-create.spec.ts; E2E-Firefox: memory-create.spec.ts; UT(jest): memoryEditor.test.tsx, stripGps.test.ts |
| AC-22 | IT | PASS | IT/UT(java): SpaceAccessGuardIT.java, MemoryIT.java |
| AC-23 | IT | PASS | IT/UT(java): MemoryTrashIT.java; E2E-Pixel7: memory-organize.spec.ts; E2E-iPhone14: memory-organize.spec.ts; E2E-Firefox: memory-organize.spec.ts; UT(jest): memoryOrganize.test.tsx, memoriesLogic.test.ts |
| AC-24 | IT + E2E | PASS | IT/UT(java): VideoTranscodeIT.java; E2E-Pixel7: memory-video.spec.ts; E2E-iPhone14: memory-video.spec.ts; E2E-Firefox: memory-video.spec.ts; UT(jest): memory-processing.test.ts |
| AC-25 | IT | PASS | IT/UT(java): MemorySearchIT.java, TestSupportAbsentIT.java (none) |
| AC-26 | IT | PASS | IT/UT(java): DockerImageTest.java, MemoryExportIT.java |
| AC-79 | E2E | PASS | E2E-Pixel7: memory-create.spec.ts; E2E-iPhone14: memory-create.spec.ts; E2E-Firefox: memory-create.spec.ts; UT(jest): memoryEditor.test.tsx, jpegExif.test.ts, memoriesLogic.test.ts |
| AC-80 | E2E + ГАР | PASS · ГАР үлдсэн | E2E-Pixel7: memories.spec.ts; E2E-iPhone14: memories.spec.ts; E2E-Firefox: memories.spec.ts; UT(jest): memories.test.tsx, memoriesLogic.test.ts |
| AC-81 | IT + E2E | PASS | IT/UT(java): MemoryGroupIT.java; E2E-Pixel7: memory-organize.spec.ts; E2E-iPhone14: memory-organize.spec.ts; E2E-Firefox: memory-organize.spec.ts; UT(jest): memoryOrganize.test.tsx |
| AC-82 | IT + E2E | PASS | IT/UT(java): MemoryIT.java; E2E-Pixel7: memories.spec.ts; E2E-iPhone14: memories.spec.ts; E2E-Firefox: memories.spec.ts; UT(jest): memoryDetail.test.tsx |
| AC-83 | IT | PASS | IT/UT(java): MemoryIT.java; E2E-Pixel7: memory-organize.spec.ts; E2E-iPhone14: memory-organize.spec.ts; E2E-Firefox: memory-organize.spec.ts |
| AC-84 | IT | PASS | IT/UT(java): MemoryRecapIT.java; UT(jest): recapExport.test.tsx |
| AC-85 | IT | PASS | IT/UT(java): MemoryExportIT.java |
| AC-86 | E2E | PASS | E2E-Pixel7: map.spec.ts, year.spec.ts; E2E-iPhone14: map.spec.ts, year.spec.ts; E2E-Firefox: map.spec.ts, year.spec.ts; UT(jest): memories.test.tsx |
| AC-172 | IT + E2E | PASS | IT/UT(java): ImageProcessorIT.java, UploadResumeIT.java, VideoTranscodeIT.java, MemoryIT.java; E2E-Pixel7: memory-create.spec.ts; E2E-iPhone14: memory-create.spec.ts; E2E-Firefox: memory-create.spec.ts; UT(jest): memoryEditor.test.tsx, memoriesLogic.test.ts |
| AC-173 | E2E | PASS | E2E-Pixel7: memories.spec.ts; E2E-iPhone14: memories.spec.ts; E2E-Firefox: memories.spec.ts; UT(jest): memoryDetail.test.tsx, memoriesLogic.test.ts |
| AC-174 | E2E | PASS | IT/UT(java): MemoryTrashIT.java; E2E-Pixel7: memory-organize.spec.ts; E2E-iPhone14: memory-organize.spec.ts; E2E-Firefox: memory-organize.spec.ts; UT(jest): memoryDetail.test.tsx, memoriesLogic.test.ts |
| AC-175 | IT + E2E | PASS | IT/UT(java): MemorySearchIT.java; E2E-Pixel7: memory-organize.spec.ts; E2E-iPhone14: memory-organize.spec.ts; E2E-Firefox: memory-organize.spec.ts; UT(jest): memoryOrganize.test.tsx, memoriesLogic.test.ts |
| AC-27 | E2E | PASS | IT/UT(java): ChatMessageIT.java; E2E-Pixel7: chat.spec.ts; E2E-iPhone14: chat.spec.ts; E2E-Firefox: chat.spec.ts; UT(jest): chatCache.test.ts |
| AC-28 | E2E | PASS | IT/UT(java): ChatMessageIT.java; E2E-Pixel7: chat.spec.ts; E2E-iPhone14: chat.spec.ts; E2E-Firefox: chat.spec.ts; UT(jest): chat.test.tsx, chatCache.test.ts, outbox.test.ts, outboxRuntime.test.ts |
| AC-29 | E2E | PASS | IT/UT(java): ChatMessageIT.java; E2E-Pixel7: chat.spec.ts; E2E-iPhone14: chat.spec.ts; E2E-Firefox: chat.spec.ts; UT(jest): chat.test.tsx, chatCache.test.ts |
| AC-30 | IT | PASS | IT/UT(java): ChatMessageIT.java, ChatSearchIT.java, DisappearingMessageIT.java, DataExportIT.java; UT(jest): chatCache.test.ts |
| AC-31 | IT | PASS | IT/UT(java): RealtimeIsolationIT.java; UT(jest): realtime-contract.test.ts, stompClient.test.ts |
| AC-32 | E2E + ГАР | PASS · ГАР үлдсэн | IT/UT(java): AudioTranscodeIT.java; E2E-Pixel7: chat-voice.spec.ts; E2E-iPhone14: chat-voice.spec.ts (skip); E2E-Firefox: chat-voice.spec.ts (skip); UT(jest): chat.test.tsx, voice.test.tsx |
| AC-87 | IT + E2E | PASS | IT/UT(java): ChatMessageIT.java, UploadResumeIT.java; E2E-Pixel7: chat-actions.spec.ts; E2E-iPhone14: chat-actions.spec.ts; E2E-Firefox: chat-actions.spec.ts; UT(jest): chatPanels.test.tsx, attachments.test.ts |
| AC-88 | E2E | PASS | IT/UT(java): ChatMessageIT.java; E2E-Pixel7: chat.spec.ts; E2E-iPhone14: chat.spec.ts; E2E-Firefox: chat.spec.ts; UT(jest): chat.test.tsx |
| AC-89 | E2E | PASS | IT/UT(java): ChatSearchIT.java; E2E-Pixel7: chat-actions.spec.ts; E2E-iPhone14: chat-actions.spec.ts; E2E-Firefox: chat-actions.spec.ts; UT(jest): chatPanels.test.tsx, attachments.test.ts |
| AC-90 | E2E | PASS | IT/UT(java): ChatSearchIT.java; E2E-Pixel7: chat-actions.spec.ts; E2E-iPhone14: chat-actions.spec.ts; E2E-Firefox: chat-actions.spec.ts; UT(jest): chatPanels.test.tsx |
| AC-91 | E2E | PASS | E2E-Pixel7: chat-actions.spec.ts; E2E-iPhone14: chat-actions.spec.ts; E2E-Firefox: chat-actions.spec.ts; UT(jest): chatPanels.test.tsx, ideas.test.tsx, lists.test.tsx, attachments.test.ts, lists.test.ts, memoriesLogic.test.ts, ideaForm.test.ts |
| AC-92 | IT + E2E | PASS | IT/UT(java): DisappearingMessageIT.java; E2E-Pixel7: chat-disappearing.spec.ts; E2E-iPhone14: chat-disappearing.spec.ts; E2E-Firefox: chat-disappearing.spec.ts; UT(jest): disappearing.test.tsx, chatCache.test.ts |
| AC-93 | E2E | PASS | IT/UT(java): SharedPromiseIT.java; E2E-Pixel7: chat-promise.spec.ts; E2E-iPhone14: chat-promise.spec.ts; E2E-Firefox: chat-promise.spec.ts; UT(jest): promise.test.tsx |
| AC-176 | E2E | PASS | IT/UT(java): ChatMessageIT.java; E2E-Pixel7: chat.spec.ts; E2E-iPhone14: chat.spec.ts; E2E-Firefox: chat.spec.ts; UT(jest): chat.test.tsx, chatCache.test.ts |
| AC-177 | IT + E2E | PASS | IT/UT(java): ChatMessageIT.java, PresenceIT.java; E2E-Pixel7: chat.spec.ts; E2E-iPhone14: chat.spec.ts; E2E-Firefox: chat.spec.ts; UT(jest): chat.test.tsx |
| AC-178 | E2E | PASS | E2E-Pixel7: chat.spec.ts; E2E-iPhone14: chat.spec.ts; E2E-Firefox: chat.spec.ts; UT(jest): chat.test.tsx |
| AC-33 | E2E | PASS | IT/UT(java): DatePlanIT.java; E2E-Pixel7: plans.spec.ts; E2E-iPhone14: plans.spec.ts; E2E-Firefox: plans.spec.ts; UT(jest): plans.test.tsx, planForm.test.ts |
| AC-34 | UT | PASS | IT/UT(java): DatePlanIT.java, DateRecurrenceTest.java; UT(jest): plans.test.tsx, planTime.test.ts |
| AC-35 | UT | PASS | IT/UT(java): DatePlanIT.java; UT(jest): localReminders.test.ts |
| AC-36 | IT + E2E | PASS | IT/UT(java): SecretDeckIT.java; E2E-Pixel7: ideas.spec.ts; E2E-iPhone14: ideas.spec.ts; E2E-Firefox: ideas.spec.ts; UT(jest): ideas.test.tsx |
| AC-37 | UT | PASS | IT/UT(java): DateRecurrenceIT.java, DateRecurrenceTest.java; UT(jest): planForm.test.ts |
| AC-94 | E2E | PASS | E2E-Pixel7: plans.spec.ts; E2E-iPhone14: plans.spec.ts; E2E-Firefox: plans.spec.ts; UT(jest): plans.test.tsx, calendarGrid.test.ts |
| AC-95 | E2E | PASS | IT/UT(java): DatePlanIT.java; E2E-Pixel7: plans.spec.ts; E2E-iPhone14: plans.spec.ts; E2E-Firefox: plans.spec.ts; UT(jest): memoryEditor.test.tsx, plans.test.tsx, memoriesLogic.test.ts |
| AC-96 | E2E | PASS | IT/UT(java): DatePlanIT.java; E2E-Pixel7: plans.spec.ts; E2E-iPhone14: plans.spec.ts; E2E-Firefox: plans.spec.ts; UT(jest): plans.test.tsx |
| AC-97 | UT | PASS | IT/UT(java): BudgetSummaryServiceTest.java, DateRecurrenceIT.java; UT(jest): ideas.test.tsx, budget.test.ts |
| AC-98 | UT | PASS | IT/UT(java): DateIdeaIT.java, RandomIdeaPickerTest.java; UT(jest): ideas.test.tsx, randomFilter.test.ts |
| AC-99 | E2E | PASS | IT/UT(java): IdeaLibraryIT.java; E2E-Pixel7: ideas.spec.ts; E2E-iPhone14: ideas.spec.ts; E2E-Firefox: ideas.spec.ts; UT(jest): ideas.test.tsx |
| AC-100 | UT | PASS | IT/UT(java): WeatherCacheIT.java; UT(jest): plans.test.tsx, weatherCard.test.tsx, forecastWindow.test.ts |
| AC-101 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | IT/UT(java): DatePlanIT.java; UT(jest): plans.test.tsx |
| AC-179 | E2E | PASS | IT/UT(java): DateIdeaIT.java; E2E-Pixel7: ideas.spec.ts; E2E-iPhone14: ideas.spec.ts; E2E-Firefox: ideas.spec.ts; UT(jest): ideas.test.tsx, ideaForm.test.ts |
| AC-180 | UT + IT | PASS | IT/UT(java): ReminderSchedulerIT.java, DatePlanIT.java |
| AC-38 | UT | PASS | IT/UT(java): AutoMilestoneCalculatorTest.java, CoupleCalendarTest.java |
| AC-39 | E2E | PASS | IT/UT(java): CelebrationIT.java; E2E-Pixel7: occasions.spec.ts; E2E-iPhone14: occasions.spec.ts; E2E-Firefox: occasions.spec.ts; UT(jest): occasions.test.tsx |
| AC-40 | IT | PASS | IT/UT(java): GiftIdeaIT.java; UT(jest): occasions.test.tsx |
| AC-102 | UT | PASS | IT/UT(java): AnniversaryIT.java, AutoMilestoneCalculatorTest.java, CoupleCalendarTest.java |
| AC-103 | UT | PASS | IT/UT(java): AnniversaryIT.java, AutoMilestoneCalculatorTest.java; UT(jest): occasions.test.tsx, plans.test.tsx, occasionCountdown.test.ts |
| AC-104 | UT | PASS | IT/UT(java): AnniversaryIT.java; UT(jest): localReminders.test.ts |
| AC-105 | E2E | PASS | IT/UT(java): AnniversaryIT.java; E2E-Pixel7: occasions.spec.ts; E2E-iPhone14: occasions.spec.ts; E2E-Firefox: occasions.spec.ts; UT(jest): occasions.test.tsx |
| AC-181 | E2E | PASS | IT/UT(java): AnniversaryIT.java, AutoMilestoneCalculatorTest.java; E2E-Pixel7: occasions.spec.ts; E2E-iPhone14: occasions.spec.ts; E2E-Firefox: occasions.spec.ts; UT(jest): occasions.test.tsx |
| AC-41 | IT | PASS | IT/UT(java): SharedListIT.java; UT(jest): lists.test.tsx |
| AC-42 | E2E | PASS | IT/UT(java): GoalIT.java; E2E-Pixel7: goals.spec.ts; E2E-iPhone14: goals.spec.ts; E2E-Firefox: goals.spec.ts; UT(jest): lists.test.tsx, goalProgress.test.ts |
| AC-106 | E2E | PASS | IT/UT(java): SharedListIT.java; E2E-Pixel7: lists.spec.ts; E2E-iPhone14: lists.spec.ts; E2E-Firefox: lists.spec.ts; UT(jest): lists.test.tsx, lists.test.ts |
| AC-107 | E2E | PASS | IT/UT(java): SharedListIT.java; E2E-Pixel7: lists.spec.ts; E2E-iPhone14: lists.spec.ts; E2E-Firefox: lists.spec.ts; UT(jest): lists.test.tsx, lists.test.ts |
| AC-108 | UT | PASS | IT/UT(java): GoalIT.java; UT(jest): lists.test.tsx, goalProgress.test.ts |
| AC-109 | E2E | PASS | IT/UT(java): SharedListIT.java; E2E-Pixel7: lists.spec.ts; E2E-iPhone14: lists.spec.ts; E2E-Firefox: lists.spec.ts; UT(jest): lists.test.tsx, lists.test.ts |
| AC-110 | E2E | PASS | E2E-Pixel7: lists.spec.ts; E2E-iPhone14: lists.spec.ts; E2E-Firefox: lists.spec.ts; UT(jest): lists.test.tsx, plans.test.tsx, lists.test.ts, planForm.test.ts |
| AC-43 | IT | PASS | IT/UT(java): LetterIT.java |
| AC-44 | IT | PASS | IT/UT(java): LetterIT.java, TestSupportAbsentIT.java (none) |
| AC-45 | IT | PASS | IT/UT(java): TimeCapsuleIT.java; UT(jest): letters.test.tsx, letters.test.ts |
| AC-111 | E2E | PASS | IT/UT(java): LetterIT.java; E2E-Pixel7: letters.spec.ts; E2E-iPhone14: letters.spec.ts; E2E-Firefox: letters.spec.ts; UT(jest): letters.test.tsx, letters.test.ts |
| AC-112 | IT | PASS | IT/UT(java): LetterIT.java; UT(jest): letters.test.tsx, letters.test.ts |
| AC-113 | E2E | PASS | E2E-Pixel7: letters.spec.ts; E2E-iPhone14: letters.spec.ts; E2E-Firefox: letters.spec.ts; UT(jest): letters.test.tsx, letters.test.ts |
| AC-182 | E2E | PASS | IT/UT(java): LetterIT.java; E2E-Pixel7: letters.spec.ts; E2E-iPhone14: letters.spec.ts; E2E-Firefox: letters.spec.ts; UT(jest): letters.test.tsx, letters.test.ts |
| AC-46 | IT | PASS | IT/UT(java): CheckInIT.java |
| AC-114 | IT | PASS | IT/UT(java): CheckInIT.java; UT(jest): checkin.test.tsx |
| AC-115 | UT + E2E | PASS | IT/UT(java): CheckInIT.java; E2E-Pixel7: checkin.spec.ts; E2E-iPhone14: checkin.spec.ts; E2E-Firefox: checkin.spec.ts; UT(jest): checkin.test.tsx, moodChart.test.ts |
| AC-183 | E2E | PASS | IT/UT(java): ProfileIT.java, CheckInIT.java; E2E-Pixel7: checkin.spec.ts; E2E-iPhone14: checkin.spec.ts; E2E-Firefox: checkin.spec.ts; UT(jest): checkin.test.tsx |
| AC-47 | UT | PASS | IT/UT(java): FootstepsCalculatorTest.java, StatsIT.java; UT(jest): stats.test.tsx |
| AC-116 | E2E | PASS | E2E-Pixel7: map.spec.ts; E2E-iPhone14: map.spec.ts; E2E-Firefox: map.spec.ts; UT(jest): map.test.tsx |
| AC-117 | IT | PASS | IT/UT(java): StatsIT.java; E2E-Pixel7: year.spec.ts; E2E-iPhone14: year.spec.ts; E2E-Firefox: year.spec.ts; UT(jest): stats.test.tsx |
| AC-118 | UT + E2E | PASS | IT/UT(java): StatsIT.java; E2E-Pixel7: year.spec.ts; E2E-iPhone14: year.spec.ts; E2E-Firefox: year.spec.ts; UT(jest): stats.test.tsx |
| AC-48 | IT | PASS | IT/UT(java): NotificationDispatcherIT.java, NotificationPreferenceIT.java; UT(jest): notificationSettings.test.tsx |
| AC-49 | IT | PASS | IT/UT(java): NotificationDispatcherIT.java, NotificationPreferenceIT.java; UT(jest): notificationSettings.test.tsx |
| AC-50 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | UT(jest): notifications.test.tsx, pwaScreens.test.tsx, notificationSettings.test.tsx, serviceWorker.test.ts |
| AC-51 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | — |
| AC-119 | IT | PASS | IT/UT(java): NotificationDispatcherIT.java, NotificationPreferenceIT.java; UT(jest): notificationSettings.test.tsx |
| AC-120 | E2E | PASS | IT/UT(java): NotificationDispatcherIT.java; E2E-Pixel7: notifications.spec.ts; E2E-iPhone14: notifications.spec.ts; E2E-Firefox: notifications.spec.ts; UT(jest): notifications.test.tsx |
| AC-121 | IT | PASS | IT/UT(java): ReminderSchedulerIT.java |
| AC-122 | IT | PASS | IT/UT(java): ReminderSchedulerIT.java |
| AC-123 | IT + E2E | PASS | IT/UT(java): NotificationDispatcherIT.java, NotificationPreferenceIT.java; E2E-Pixel7: notification-settings.spec.ts; E2E-iPhone14: notification-settings.spec.ts; E2E-Firefox: notification-settings.spec.ts; UT(jest): notificationSettings.test.tsx, persist.test.ts |
| AC-184 | UT + E2E | PASS | IT/UT(java): NotificationPreferenceIT.java; E2E-Pixel7: notification-settings.spec.ts; E2E-iPhone14: notification-settings.spec.ts; E2E-Firefox: notification-settings.spec.ts |
| AC-52 | UT | PASS | UT(jest): appLock.test.tsx |
| AC-53 | IT | PASS | IT/UT(java): DataExportIT.java |
| AC-54 | IT | PASS | IT/UT(java): CoupleBreakupIT.java |
| AC-55 | IT | PASS | IT/UT(java): SpaceAccessGuardIT.java, CoupleIsolationIT.java |
| AC-56 | IT | PASS | IT/UT(java): DeviceSessionIT.java, RefreshTokenIT.java; E2E-Pixel7: devices.spec.ts, infra.spec.ts, layout.spec.ts; E2E-iPhone14: devices.spec.ts, infra.spec.ts, layout.spec.ts; E2E-Firefox: devices.spec.ts, infra.spec.ts, layout.spec.ts; UT(jest): client-refresh.test.ts, needsLogin.test.ts, deviceSessions.test.tsx |
| AC-124 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | UT(jest): appLock.test.tsx |
| AC-125 | IT | PASS | IT/UT(java): DeviceSessionIT.java; E2E-Pixel7: devices.spec.ts; E2E-iPhone14: devices.spec.ts; E2E-Firefox: devices.spec.ts; UT(jest): needsLogin.test.ts, deviceSessions.test.tsx |
| AC-126 | IT | PASS | IT/UT(java): DataExportIT.java, MemoryExportIT.java; E2E-Pixel7: data-export.spec.ts; E2E-iPhone14: data-export.spec.ts; E2E-Firefox: data-export.spec.ts; UT(jest): dataSettings.test.tsx, recapExport.test.tsx |
| AC-127 | IT + E2E | PASS | IT/UT(java): CoupleBreakupIT.java, StartDateIT.java; E2E-Pixel7: breakup.spec.ts; E2E-iPhone14: breakup.spec.ts; E2E-Firefox: breakup.spec.ts; UT(jest): breakup.test.tsx, coupleSettings.test.tsx |
| AC-128 | IT | PASS | IT/UT(java): AccountDeletionIT.java; UT(jest): deleteAccount.test.tsx |
| AC-129 | IT | PASS | IT/UT(java): ImageProcessorIT.java, MediaInspectorTest.java, UploadResumeIT.java |
| AC-130 | E2E | PASS | IT/UT(java): PolicyIT.java; E2E-Pixel7: policies.spec.ts; E2E-iPhone14: policies.spec.ts; E2E-Firefox: policies.spec.ts; UT(jest): policies.test.tsx, markdown.test.ts |
| AC-185 | E2E | PASS | IT/UT(java): CoupleBreakupIT.java; E2E-Pixel7: breakup.spec.ts; E2E-iPhone14: breakup.spec.ts; E2E-Firefox: breakup.spec.ts; UT(jest): breakup.test.tsx |
| AC-186 | IT | PASS | IT/UT(java): AdminIT.java, CoupleIsolationIT.java |
| AC-187 | IT | PASS | IT/UT(java): DeviceSessionIT.java |
| AC-131 | IT + E2E | PASS | IT/UT(java): SharedListIT.java, MemoryIT.java, DatePlanIT.java; E2E-Pixel7: goals.spec.ts, lists.spec.ts; E2E-iPhone14: goals.spec.ts, lists.spec.ts; E2E-Firefox: goals.spec.ts, lists.spec.ts; UT(jest): lists.test.tsx, memoryEditor.test.tsx |
| AC-132 | UT | PASS | UT(jest): calendarDate.test.ts |
| AC-216 | CR | PASS | UT(jest): policy-guards.test.ts |
| AC-57 | E2E | PASS | E2E-Pixel7: onboarding.spec.ts; E2E-iPhone14: onboarding.spec.ts; E2E-Firefox: onboarding.spec.ts; UT(jest): empty-state-actions.test.ts |
| AC-133 | E2E | PASS | E2E-Pixel7: auth.spec.ts; E2E-iPhone14: auth.spec.ts; E2E-Firefox: auth.spec.ts; UT(jest): intro.test.tsx |
| AC-134 | UT + E2E | PASS | IT/UT(java): FirstWeekIT.java; E2E-Pixel7: onboarding.spec.ts; E2E-iPhone14: onboarding.spec.ts; E2E-Firefox: onboarding.spec.ts; UT(jest): firstWeekTasks.test.tsx, firstWeek.test.ts |
| AC-188 | E2E | PASS | E2E-Pixel7: pairing.spec.ts; E2E-iPhone14: pairing.spec.ts; E2E-Firefox: pairing.spec.ts; UT(jest): empty-state-actions.test.ts |
| AC-135 | UT + E2E | PASS | E2E-Pixel7: settings.spec.ts; E2E-iPhone14: settings.spec.ts; E2E-Firefox: settings.spec.ts; UT(jest): settingsScreens.test.tsx, i18n-parity.test.tsx, no-raw-strings.test.ts |
| AC-136 | IT | PASS | IT/UT(java): EmailChangeIT.java |
| AC-137 | E2E | PASS | IT/UT(java): CoupleSettingsIT.java; E2E-Pixel7: couple-settings.spec.ts; E2E-iPhone14: couple-settings.spec.ts; E2E-Firefox: couple-settings.spec.ts; UT(jest): coupleSettings.test.tsx |
| AC-138 | E2E | PASS | IT/UT(java): CoupleSettingsIT.java; E2E-Pixel7: couple-settings.spec.ts; E2E-iPhone14: couple-settings.spec.ts; E2E-Firefox: couple-settings.spec.ts; UT(jest): coupleSettings.test.tsx |
| AC-139 | UT | PASS | UT(jest): settingsScreens.test.tsx, formatDate.test.ts |
| AC-189 | IT | PASS | IT/UT(java): EmailChangeIT.java |
| AC-190 | E2E | PASS | E2E-Pixel7: couple-settings.spec.ts; E2E-iPhone14: couple-settings.spec.ts; E2E-Firefox: couple-settings.spec.ts; UT(jest): coupleSettings.test.tsx, settingsScreens.test.tsx, buildInfo.test.ts |
| AC-58 | E2E | PASS | E2E-Pixel7: download-page.spec.ts; E2E-iPhone14: download-page.spec.ts; E2E-Firefox: download-page.spec.ts |
| AC-59 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | UT(jest): manual-test.test.ts |
| AC-60 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | UT(jest): manual-test.test.ts |
| AC-61 | UT | PASS | UT(jest): app-config.test.ts |
| AC-140 | E2E | PASS | E2E-Pixel7: pwa-manifest.spec.ts, pwa-offline.spec.ts; E2E-iPhone14: pwa-manifest.spec.ts, pwa-offline.spec.ts; E2E-Firefox: pwa-manifest.spec.ts, pwa-offline.spec.ts; UT(jest): buildSw.test.ts, pwaManifest.test.ts, registerSW.test.tsx, serviceWorker.test.ts |
| AC-141 | UT + E2E | PASS | IT/UT(java): VersionIT.java; E2E-Pixel7: version.spec.ts; E2E-iPhone14: version.spec.ts; E2E-Firefox: version.spec.ts; UT(jest): version.test.tsx, versionCompare.test.ts |
| AC-152 | E2E | PASS | E2E-Pixel7: perf.spec.ts, pwa-manifest.spec.ts; E2E-iPhone14: perf.spec.ts (skip), pwa-manifest.spec.ts; E2E-Firefox: perf.spec.ts (skip), pwa-manifest.spec.ts; UT(jest): pwaManifest.test.ts |
| AC-153 | E2E | PASS | E2E-Pixel7: pwa-install.spec.ts; E2E-iPhone14: pwa-install.spec.ts; E2E-Firefox: pwa-install.spec.ts; UT(jest): pwaScreens.test.tsx, installPrompt.test.ts |
| AC-154 | IT + E2E | PASS | IT/UT(java): WebPushIT.java, TestSupportAbsentIT.java (none); E2E-Pixel7: web-push.spec.ts; E2E-iPhone14: web-push.spec.ts (skip); E2E-Firefox: web-push.spec.ts; UT(jest): pwaScreens.test.tsx, installPrompt.test.ts, serviceWorker.test.ts, subscribePush.test.ts |
| AC-155 | IT | PASS | IT/UT(java): ReminderSchedulerIT.java |
| AC-156 | E2E | PASS | E2E-Pixel7: pwa-offline.spec.ts; E2E-iPhone14: pwa-offline.spec.ts; E2E-Firefox: pwa-offline.spec.ts; UT(jest): useNetworkStatus.test.tsx, outboxRuntime.test.ts, persist.test.ts, registerSW.test.tsx, serviceWorker.test.ts |
| AC-157 | E2E | PASS | IT/UT(java): PasskeyIT.java; E2E-Pixel7: passkey.spec.ts; E2E-iPhone14: passkey.spec.ts; E2E-Firefox: passkey.spec.ts; UT(jest): passkeySettings.test.tsx, passkey.test.ts |
| AC-158 | E2E + ГАР | PASS · ГАР үлдсэн | IT/UT(java): AudioTranscodeIT.java; E2E-Pixel7: chat-voice.spec.ts; E2E-iPhone14: chat-voice.spec.ts (skip); E2E-Firefox: chat-voice.spec.ts (skip); UT(jest): memoryEditor.test.tsx, plans.test.tsx, webFallbacks.test.tsx |
| AC-159 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | UT(jest): manual-test.test.ts |
| AC-160 | E2E | PASS | E2E-Pixel7: lottie-size.spec.ts, perf.spec.ts; E2E-iPhone14: lottie-size.spec.ts, perf.spec.ts (skip); E2E-Firefox: lottie-size.spec.ts, perf.spec.ts (skip); UT(jest): pwaManifest.test.ts, perf-budget.test.tsx |
| AC-191 | E2E | PASS | E2E-Pixel7: memory-create.spec.ts; E2E-iPhone14: memory-create.spec.ts; E2E-Firefox: memory-create.spec.ts; UT(jest): letters.test.tsx, registerSW.test.tsx, serviceWorker.test.ts |
| AC-217 | E2E + UT | PASS | IT/UT(java): ProfileIT.java; E2E-Pixel7: web-fallbacks.spec.ts; E2E-iPhone14: web-fallbacks.spec.ts; E2E-Firefox: web-fallbacks.spec.ts; UT(jest): settingsScreens.test.tsx, haptics.test.ts, webFallbacks.test.tsx |
| AC-142 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | — |
| AC-143 | E2E | PASS | E2E-Pixel7: smoke.spec.ts; E2E-iPhone14: smoke.spec.ts; E2E-Firefox: smoke.spec.ts; UT(jest): tokenStoreWeb.test.ts |
| AC-144 | UT | PASS | UT(jest): no-hex.test.ts |
| AC-145 | UT | PASS | UT(jest): content.test.ts, error-codes-coverage.test.ts |
| AC-146 | UT | PASS | UT(jest): content.test.ts |
| AC-147 | UT | PASS | UT(jest): content.test.ts |
| AC-148 | ГАР | шалгагдаагүй (хүн — DEV_APPROVE) | docs/CONTENT-SAMPLE.md (30 мөр, seed 20261117) энэ шатанд гаргав |
| AC-213 | E2E | PASS | E2E-Pixel7: screen-states.spec.ts; E2E-iPhone14: screen-states.spec.ts; E2E-Firefox: screen-states.spec.ts; UT(jest): ScreenState.test.tsx |
| AC-149 | UT | PASS | UT(jest): manual-test.test.ts |
| AC-150 | IT | PASS | shell: aura.k6.js, seed.k6.js; k6 (1 000 хос, 200 WS, 5/20 req/s) compose сүлжээн дотроос: api p95 14.9 ms, алдаа 0%, STOMP 200/200, exit 0. host.docker.internal-аар 3/200 WS handshake 30 с timeout (орчин — Docker Desktop port-forward), REST босго тэнд ч давсан |
| AC-151 | IT | PASS | shell: backup-restore.test.sh, prod-config.test.sh |
| AC-161 | IT | PASS (image-ууд) · өөрийн Dockerfile-ийн arm64 build шалгагдаагүй | IT/UT(java): DockerImageTest.java; shell: prod-config.test.sh; prod-config: caddy/seaweedfs/postgres/rclone linux/arm64; суурь image eclipse-temurin:21-jre-jammy, maven:3.9-eclipse-temurin-21, nginx:1.27-alpine arm64 manifest-тэй; ARM64_BUILD=1 (QEMU) ажиллуулаагүй |
| AC-162 | UT | PASS | shell: prod-config.test.sh |
| AC-163 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | — |
| AC-195 | IT + CR | PASS | IT/UT(java): PasswordHashTest.java, CorsIT.java, SignedUrlIT.java |
| AC-196 | IT + CR | PASS | IT/UT(java): AuthLogRedactionIT.java, LogRedactionIT.java; UT(jest): policy-guards.test.ts |
| AC-197 | E2E + ГАР | PASS · ГАР үлдсэн | E2E-Pixel7: a11y.spec.ts, memory-create.spec.ts; E2E-iPhone14: a11y.spec.ts, memory-create.spec.ts; E2E-Firefox: a11y.spec.ts, memory-create.spec.ts |
| AC-198 | E2E | FAIL (тогтворгүй, Firefox) | E2E-Pixel7: one-hand.spec.ts; E2E-iPhone14: one-hand.spec.ts; E2E-Firefox: one-hand.spec.ts (fail); Firefox 1/4 ажиллалтад дурсамж хадгалсны дараа (POST /memories 201) S-31 биш Нүүр рүү буцав — memory-editor.tsx:117-118 router.back()+router.push() race |
| AC-199 | UT | PASS | UT(jest): formatDate.test.ts |
| AC-200 | IT + E2E | PASS | IT/UT(java): StorageQuotaIT.java, QuotaIT.java; E2E-Pixel7: storage.spec.ts; E2E-iPhone14: storage.spec.ts; E2E-Firefox: storage.spec.ts; UT(jest): storageFull.test.tsx, uploadQueue.test.ts |
| AC-201 | IT | PASS | IT/UT(java): ErrorReporterIT.java (none); ErrorReporterIT-ийн @Nested 2 тест давсан (mvn лог: «DSN …» 1+1, 0 уналт); surefire XML эцэг класст 0 гэж бичдэг |
| AC-202 | IT + CR | PASS | IT/UT(java): ActuatorIT.java, LogRedactionIT.java |
| AC-203 | CR | CR (код хяналт — runtime шалгалтгүй) | — |
| AC-204 | IT + CR | PASS | shell: backup-restore.test.sh |
| AC-205 | E2E | PASS | E2E-Pixel7: perf.spec.ts; E2E-iPhone14: perf.spec.ts (skip); E2E-Firefox: perf.spec.ts (skip) |
| AC-206 | IT | PASS | IT/UT(java): AdminIT.java, CoupleIsolationIT.java |
| AC-207 | UT + E2E | PASS | IT/UT(java): SurveyIT.java; E2E-Pixel7: survey.spec.ts; E2E-iPhone14: survey.spec.ts; E2E-Firefox: survey.spec.ts; UT(jest): home.test.tsx, surveyCard.test.tsx |
| AC-208 | UT + CR | PASS | UT(jest): policy-guards.test.ts |
| AC-209 | IT | PASS | shell: compose-health.test.sh; E2E-Pixel7: infra.spec.ts; E2E-iPhone14: infra.spec.ts; E2E-Firefox: infra.spec.ts |
| AC-210 | IT | PASS | IT/UT(java): WeatherCacheIT.java |
| AC-211 | CR | PASS | E2E-Pixel7: ac-coverage.spec.ts; E2E-iPhone14: ac-coverage.spec.ts (skip); E2E-Firefox: ac-coverage.spec.ts (skip) |
| AC-212 | CR | PASS | UT(jest): policy-guards.test.ts |
| AC-218 | ГАР | шалгагдаагүй (төхөөрөмж — DEV_APPROVE) | — |
| AC-219 | E2E + ГАР | PASS · ГАР үлдсэн | IT/UT(java): SignedUrlIT.java; E2E-Pixel7: smoke.spec.ts; E2E-iPhone14: smoke.spec.ts; E2E-Firefox: smoke.spec.ts |
