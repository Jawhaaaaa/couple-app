---
id: aura
type: lld
title: Aura — хосын апп (Expo + Spring Boot) · Нарийвчилсан загвар
status: draft
work_item: LAB-2
spec_version: docs/LAB-2/spec.md @ f37e648 (SPEC_APPROVE 2026-11-07, SD-01…SD-06 ба GAP-12…GAP-26 анхдагчаар)
---
<!-- LAB-2 · lld · Design · 2026-11-07 -->

# LAB-2 — Aura хосын апп: нарийвчилсан загвар

| Талбар | Утга |
|---|---|
| Эх | `docs/LAB-2/spec.md` @ `f37e648` (AC-01…AC-219, INV-01…16, SD-01…06, GAP-12…26, TQ-01…09) · `docs/LAB-2/plan.md`, `docs/LAB-2/tasks.md` @ `830fbfe` (T-01…T-94) · `docs/STACK.md` |
| Дизайн | Issue-ийн 6 зураг (спекийн E2). Дэлгэцийн дуурайлт — `docs/LAB-2/lld.html` |
| Гэрээ | `contracts/openapi.yaml` (OpenAPI 3.1, REST `/api/v1`) · `contracts/asyncapi.yaml` (AsyncAPI 3.0, STOMP `/ws`). Хоёулаа `info.version: 1.0.0` |
| Модулийн танигч | `AURA` (`DD-AURA-NNN`, `OPS-AURA-NNN`, `PAR-AURA-NNN`) |
| Огноо | 2026-11-07 |

Спекийн шаардлагыг энд давтахгүй; AC, INV, SD, GAP-ийн ID-аар холбоно.
`/api/v1` угтварыг хүснэгтэд орхив.

## 1. Хүрээ

Энэ хэсэг: загвар юуг тогтоож, юуг тогтоохгүй вэ?

| Хөндөгдөнө | Хөндөгдөхгүй |
|---|---|
| `backend/` — Spring Boot 3.5 (Java 21) модульчлагдсан монолит: 20 домэйн багц, Flyway схем, REST, STOMP, scheduler, ffmpeg, PDF | Native iOS build, Apple нэвтрэлтийг идэвхжүүлэх (GAP-02) — код `aura.oauth.apple.enabled=false` тугтай л |
| `mobile/` — Expo SDK 58 апп (native + PWA), Expo Router мод `mobile/src/app/`, төлөв, offline, хөдөлгөөн, service worker | Native APK-ийн FCM push (GAP-01) — `ExpoPushSender` тохиргоо хоосон бол алгасна |
| `contracts/` — HTTP ба realtime гэрээний бүтэн бие | Бодит prod байршуулалт, Oracle/DuckDNS/SMTP бүртгэл (GAP-11) — багц ба заавар л |
| `e2e/` — Playwright орчин, fixture, тестийн endpoint-ийн хэрэглээ | Автомат CSAM таних (GAP-06) |
| `docker-compose.yml`, root `Dockerfile`, `mobile/Dockerfile`, `deploy/**`, `load/`, `.github/workflows/ci.yml` | `docs/MANUAL-TEST.md`, `docs/CONTENT-SAMPLE.md` — DEV_TEST шатны гаралт (plan §2) |
| Агуулгын сан `mobile/src/content/*.json` (нэг эх, backend classpath-д хуулагдана) | Админ UI — зөвхөн API (GAP-16) |
| `lld.html` — S-01…S-102 дэлгэцийн дуурайлт (AC-142), ERD, урсгал | Spec-д байхгүй функц; E2-ийн GAP-25-д хассан элемент (шифрлэлтийн бичвэр, календарь синк, EXIF цаг агаар) |

## 2. Шийдвэр

Энэ хэсэг: хэрэгжүүлэлтэд нөлөөлөх шийдвэр, тус бүрийн үндэслэл ба татгалзсан хувилбар.

| Шийдвэр | Сонголт | Яагаад |
|---|---|---|
| DD-AURA-001 Backend-ийн бүтэц | Нэг Spring Boot процесс, `mn.aura.couple.<домэйн>` багц (auth, account, couple, realtime, notification, media, memory, chat, plan, anniversary, lists, letter, checkin, stats, dashboard, question, signal, weather, export, admin, common, testsupport). Багц бүр `api` (controller), `app` (service), `domain` (entity, repository). Багц хоорондын дуудлага зөвхөн `app` давхаргын public service-ээр — ArchUnit тест `ArchitectureTest` | Always Free нэг VM (NFR-16), 10 000 хос (NFR-13) нэг процесст багтана. Микросервис татгалзав: нэг хүн ажиллуулна, сүлжээний алдааны гадаргуу нэмнэ |
| DD-AURA-002 Гэрээнээс эхлэх | `contracts/openapi.yaml`-аас `openapi-generator-maven-plugin` (`spring`, `interfaceOnly=true`, `useTags=true`, `useSpringBoot3=true`) controller интерфейс ба DTO үүсгэнэ; controller нь интерфейсийг хэрэгжүүлнэ. `ContractConformanceIT` (`swagger-request-validator`) IT-ийн хариуг гэрээтэй тулгана. Mobile: `npm run gen:api` = `openapi-typescript ../contracts/openapi.yaml -o src/api/schema.d.ts`; файл commit хийгдэнэ, `api-schema-fresh.test.ts` дахин үүсгэж зөрүүг барина | DEVELOPMENT гэрээг дахин зохиохгүй (plan §2). Хоёр тал нэг эхээс төрөл авна. Код→гэрээ (springdoc) татгалзав: гэрээ хэрэгжүүлэлтийн дараа хөдөлнө |
| DD-AURA-003 Хос ба ганцаараа орон зай | Агуулга бүр `space_id`-тай. Бүртгэлд хэрэглэгч бүрд `SOLO` space, хос холбогдоход `COUPLE` space үүснэ. FR-2.5 «Тийм» → SOLO-гийн мөрүүдийн `space_id`-г COUPLE болгоно; «Үгүй» → SOLO-д үлдэж «Хувийн» шүүлтэд (R-4) харагдана | AC-67-г нэг багана солих транзакцаар шийднэ. `couple_id NULL` хувилбар татгалзав: тусгаарлалтын шүүлт бүрд `OR owner` нөхцөл нэмж INV-01-ийн эрсдэл өсгөнө |
| DD-AURA-004 Тусгаарлалтын хаалга | `SpaceAccessGuard` — хүсэлт бүрд JWT-ийн `sub`-аас идэвхтэй гишүүнчлэлийг (`space_member`) уншиж `SpaceContext`-д тавина. Repository бүрийн хайлт `space_id = :ctx` нөхцөлтэй (Hibernate `@Filter` биш, тодорхой параметр). Өөр space-ийн объект → **404** (`NOT_FOUND`), өөрийн space-ийн бусдын объектыг засах → **403** (`NOT_OWNER`) | INV-01, INV-03, AC-22, AC-55. 404 нь өөр хосын ID байгаа эсэхийг ил гаргахгүй |
| DD-AURA-005 Нууц агуулгын проекц | Нууц талбартай биет (асуултын хариулт, deck swipe, бэлгийн санаа, захидал, capsule, check-in) нь DTO-г `ViewerProjection.forViewer(entity, viewerId)`-ээр л үүсгэнэ; realtime үйл явдал хүлээн авагч бүрд тусад нь проекцлогдоно (DD-AURA-009) | INV-04: хариунд талбар байхгүй (null биш) — AC-15, AC-36, AC-40, AC-43, AC-45, AC-46 IT-ээр JSON-ийн түлхүүрийг шалгана |
| DD-AURA-006 Токен (TQ-01) | Access JWT 15 мин (HS256, `sub`, `sid`, `sv`), санах ойд. Refresh — opaque 256 бит, DB-д SHA-256 hash, 30 хоног, rotation, гэр бүл (`device_session`). Native: refresh `expo-secure-store` (`aura.refresh`), биед дамжина. Web (PWA): refresh зөвхөн `HttpOnly; SameSite=Strict; Path=/api/v1/auth` cookie `aura_rt` (prod-д `Secure`), JS-д хүрэхгүй; `/auth/refresh` дуудлага `X-Aura-Client: web` header шаардана (CSRF) | XSS-ээр refresh хулгайлагдахгүй. IndexedDB/localStorage татгалзав (скриптэд ил). Prod-д Caddy нэг origin; DEV-д `localhost:8090`→`:8080` same-site тул cookie ажиллана |
| DD-AURA-007 Refresh давхар ашиглалт | Rotate хийгдсэн токеныг дахин үзүүлбэл тухайн хэрэглэгчийн бүх `device_session`-ийг `revoked_reason=REUSE` болгоно; access JWT-ийн `sv` (session version) `users.session_version`-тэй таарахгүй бол 401 | AC-07, AC-03, AC-56, AC-125: access token 15 мин хүлээлгүй шууд хүчингүй. `sv`-г `SessionVersionCache` (Caffeine 5 с) уншина |
| DD-AURA-008 Realtime | STOMP over WebSocket `/ws` (SockJS-гүй), CONNECT header `Authorization: Bearer`. Сервер→client зөвхөн `/user/queue/events` (хэрэглэгч тутам). Client→сервер `/app/typing`, `/app/presence`, `/app/chat.delivered`. `CoupleChannelInterceptor` нь `/user/queue/events`-ээс өөр SUBSCRIBE-ийг татгалзана | AC-31: хуваалцсан `/topic/couple.{id}` байхгүй тул өөр хосын суваг руу subscribe хийх зам үгүй. Нэг процесс тул simple broker хангалттай; RabbitMQ relay татгалзав |
| DD-AURA-009 Үйл явдлын дамжуулалт | Домэйн service транзакц дотор `DomainEvent` нийтэлнө → `@TransactionalEventListener(AFTER_COMMIT)` `RealtimePublisher` хүлээн авагч бүрд проекцлон илгээнэ, `NotificationDispatcher` мэдэгдэл үүсгэнэ. Envelope: `{id, type, occurredAt, actorId, payload}`; mobile нь `type`-аар TanStack кэшийг шинэчилнэ (§4.4) | Commit болоогүй өгөгдөл түгэхгүй. Outbox хүснэгт татгалзав: WS алдагдвал client дахин холбогдохдоо query-гээ invalidate хийнэ (`reconnect → invalidateQueries`) |
| DD-AURA-010 Ажлын дараалал ба хуваарь | `job` хүснэгт (`SELECT … FOR UPDATE SKIP LOCKED`) — видео/дуу хөрвүүлэх, экспорт, PDF, ZIP, purge. Хугацаат ажил Spring `@Scheduled` + ShedLock (JDBC): захидал/capsule 15 с, алга болдог мессеж 2 с, сануулга/push outbox 30 с, мэндчилгээ 60 с, inactivity 1 цаг, хогийн сав/хос purge 1 цаг, recap 15 мин (хосын бүсийн 00:05) | AC-44 (≤ 1 мин), AC-92 (60 ± 5 с), AC-121 (± 5 мин). Гадаад дараалал (Redis, RabbitMQ) татгалзав — Always Free дээр нэмэлт үйлчилгээ |
| DD-AURA-011 Тестийн цаг ба seed (TQ-02) | Бүх цаг `TimeProvider` (`java.time.Clock`)-оор. `e2e` profile-д л `MutableClock` ба `TestSupportController` (`/test/**`, гэрээнд `x-aura-scope: test`) бүртгэгдэнэ: цаг тохируулах, scenario seed, job-ыг шууд ажиллуулах, push sink. Prod профайлд bean үүсэхгүй; `TestSupportAbsentIT` prod profile-д `/api/v1/test/clock` → 404 | INV-10. Mobile E2E-д хөтчийн цагийг `page.clock`-оор, серверийнхийг `/test/clock`-оор нэг утгад тавина |
| DD-AURA-012 Resumable upload (TQ-04) | Өөрийн chunk протокол backend дээгүүр: `POST /uploads` (S3 `CreateMultipartUpload`) → `PUT /uploads/{id}/chunks/{n}` (5 MiB, `Content-Range`-гүй, индексээр) → `GET /uploads/{id}` (хүлээн авсан индекс) → `POST /uploads/{id}/complete`. Эхний chunk-аар `MediaInspector` агуулгын MIME шалгана; квот `POST /uploads` дээр нөөцлөгдөнө | AC-20 (дахин илгээх байт < нийт), AC-129, AC-200. tus татгалзав: RN fetch-д нэмэлт сан, header протокол. Presigned шууд S3 татгалзав: SeaweedFS-ийг утсанд ил гаргаж CORS тохируулна, MIME шалгалт upload-ын дараа л |
| DD-AURA-013 Медиа хандалт | DTO-д `MediaRef.urls` — S3 presigned GET (15 мин, sigv4). Хугацаа дуусвал client `GET /media/{id}` дахин дуудаж шинэ URL авна. S3 bucket private | NFR-05, AC-195 (дууссан URL → 403 S3-ээс). Backend-ээр stream хийх татгалзав — JVM-ийн сүлжээ, санах ой |
| DD-AURA-014 Зураг, видео боловсруулалт | Зураг: client урт тал ≤ 2560 px (`expo-image-manipulator` / canvas), сервер `ImageProcessor` (Thumbnailator + TwelveMonkeys) дахин кодолж metadata хасна, 3 хувилбар (`sm` 320, `md` 960, `lg` 1920) + blurhash. Видео: `VideoTranscodeJob` ffmpeg `-c:v libx264 -vf scale=-2:720 -c:a aac -map_metadata -1`, poster 1 с-ээс. Дуу: `AudioTranscodeJob` → AAC m4a + 64 цэгийн waveform | AC-21, AC-24, AC-129, AC-172, AC-32. GPS EXIF-ийг client ч, сервер ч хасна (давхар хамгаалалт) |
| DD-AURA-015 Хайлт (TQ-06) | PostgreSQL `pg_trgm`: `memory.search_text` (гарчиг + тайлбар + шошго, `lower()`), `memory_comment.text`, `chat_message.text` дээр GIN `gin_trgm_ops`. Хайлт `ILIKE '%' || :q || '%'` ба `space_id` B-tree-тэй хослол | Монгол хэлний stemmer байхгүй; «аялал/аяллын» хэсэгчилсэн тохирол trigram-аар. AC-25 ≤ 500 ms-ийг `MemorySearchIT` 10 000 seed дээр хэмжинэ. `tsvector('simple')` татгалзав — үгийн хэсгийг олохгүй |
| DD-AURA-016 Зэрэг засвар | Засагддаг биет бүр `version bigint` (JPA `@Version`). PATCH/PUT биед `version` заавал; зөрвөл **409** `VERSION_CONFLICT` + `current` (серверийн хувилбар) + `updatedBy`. Mobile `ConflictResolutionSheet` «Миний / Түүний хувилбар» | AC-41, AC-131, INV-07. Last-write-wins татгалзав — чимээгүй дарна |
| DD-AURA-017 Offline outbox | `src/offline/outbox.ts`: үйлдэл бүр `{clientId (uuid v7), method, path, body, createdAt}` — native AsyncStorage, вэб IndexedDB (`idb-keyval`). Апп нээгдэх, `online`, AppState `active` үед FIFO-оор илгээнэ. Сервер `clientMessageId`/`clientId`-аар idempotent (`UNIQUE(author_id, client_id)`); давхар ирвэл 200 + анхны объект | AC-28, AC-156, NFR-03. Background Sync татгалзав — iOS-д байхгүй (FR-19.5) |
| DD-AURA-018 Хосын өдөр (SD-02) | `space.timezone` = хос холбогдох мөчийн урилга үүсгэгчийн бүс, өөрчлөгдөхгүй. `CoupleDay.today(space, clock)` нь өдрийн асуулт, зүрхний тоонд. Хувь хүний (check-in, DND, мэндчилгээ, сануулга) — `users.timezone` | SD-02, AC-75, AC-78 |
| DD-AURA-019 Тоолуур ба ой (SD-01, SD-03) | Цэвэр функц `mobile/src/domain/dates.ts` ба `backend …/common/time/CoupleCalendar.java` — ижил тестийн хүснэгтээр (`date-cases.json`, хоёр тал уншина). Тоолуур = `start ≤ today ? days(start, today) + 1`; «N хоног» ой = `start + N − 1`; 02-29 → үсэрт бус жилд 02-28; сарын 29–31 → сарын сүүл | AC-13, AC-38, AC-102, AC-37. Нэг тест хүснэгт хоёр хэлний зөрүүг барина |
| DD-AURA-020 Агуулгын сан (R-7) | Нэг эх: `mobile/src/content/*.json` (+ `content.schema.json`, stoplist). Backend Maven `resources` нь `../mobile/src/content`-ийг classpath `content/`-д хуулна (root `Dockerfile`-ийн context = репо). Асуулт, санааны сан, мэдэгдэл/мэндчилгээний бичвэр серверээс; хоосон төлөв, onboarding, алдааны мессеж client bundle-д | Хуулбаргүй (AC-145…147 нэг газар). Өдрийн асуулт сервер сонгоно (AC-15, AC-75), санааг сервер хуулна (AC-99) |
| DD-AURA-021 Өдрийн асуултын сонголт | `QuestionPicker`: хос тутмын тогтвортой seed (`space.id`) бүхий permutation; эхний 30 хосын өдөрт `depth=1` ≥ 70% байхаар эхний 30-ыг depth 1-ээс 21+, бусдыг дараа. `daily_question` мөр нь өдрийн эхний хүсэлтэд үүсч царцна | AC-75 (хоёр хүнд ижил), Б.1 |
| DD-AURA-022 Мэдэгдлийн дамжуулалт | `NotificationDispatcher.dispatch(recipient, type, params, ref)`: (1) `notification` мөр (апп доторх, үргэлж); (2) төрлийн тохиргоо унтраастай / `quiet_until` / DND бол push алгасна эсвэл `push_outbox.deliver_after`-д хойшлуулна; (3) `hide_content` бол payload-д зөвхөн төрлийн ерөнхий гарчиг; (4) `PushChannel` — `WebPushSender` (VAPID, `nl.martijndwars:web-push`) эсвэл `ExpoPushSender`. DND дуусахад хүлээгдсэн бүхнийг нэг нэгтгэсэн push | AC-48, AC-49, AC-119, AC-123, AC-154 (404/410 → subscription устгах) |
| DD-AURA-023 Хуваарьт сануулга (FR-19.4) | `scheduled_reminder` хүснэгт: болзоо, ой, захидлын сануулга төхөөрөмжийн төрлөөс үл хамааран серверт хадгалагдана. Web subscription-тай хэрэглэгчид сервер Web Push илгээнэ; native-д `LocalNotificationScheduler` (`expo-notifications`) ижил хүснэгтийн `GET /reminders`-оор локал товлоно, давхардахгүйн тулд native төхөөрөмжийн push subscription-д `localReminders=true` тэмдэг | AC-35, AC-104, AC-155, AC-180 |
| DD-AURA-024 PDF (TQ-03, SD-05) | `MemoryBookPdfService`: Thymeleaf HTML → OpenHTMLtoPDF (`com.openhtmltopdf:openhtmltopdf-pdfbox`), фонт Nunito + Playfair Display TTF (`backend/src/main/resources/fonts/`, OFL, `docs/ASSETS.md`)-ийг `useFont`-оор embed. Ажил `job`-оор, үр дүн `data_export` | AC-26: PDF-ийн текст задлалт (PDFBox `PDFTextStripper`) эх тексттэй тэнцүү. `expo-print` татгалзав (SD-05) |
| DD-AURA-025 Вэбийн service worker | `expo export --platform web`-ийн дараа `workbox-cli injectManifest` (`mobile/sw/sw.ts` → `dist/sw.js`): precache shell, фонт, Lottie, дүрс; runtime кэш `/api` биш (өгөгдөл TanStack persist-д IndexedDB); `push`, `notificationclick` handler. Бүртгэл `src/pwa/registerSW.ts` | RSK-AURA-003, AC-140, AC-156, AC-191 |
| DD-AURA-026 ANIM ажиглалт (TQ-05) | `<AnimatedMoment anim="ANIM-01">` нь `testID="anim-ANIM-01"` ба вэбэд `data-anim-state="playing|done|reduced|off"` тавина. `useMotionPreference()` нь `full|reduced|off`. Playwright `expect(page.getByTestId('anim-ANIM-02')).toHaveAttribute('data-anim-state','playing')` | AC-214, AC-MO-01, AC-MO-03 |
| DD-AURA-027 Web Push тест (TQ-07) | `e2e` profile-д `POST /test/push-sink` нь тестийн endpoint URL буцаана (`/api/v1/test/push-sink/{id}/receive`); E2E нь subscription-ийг тэр URL-аар бүртгэж ирсэн payload-ыг `GET /test/push-sink/{id}/messages`-ээр уншина, `POST …/respond {status:410}` | AC-154: хөтчийн push service-гүйгээр серверийн илгээлт ба 410-ийн цэвэрлэгээг шалгана. Хөтчийн бодит хүлээн авалт — ГАР (AC-51, AC-159) |
| DD-AURA-028 Тусгаарлалтын тест (TQ-09) | Operation бүр `x-aura-scope: public|user|space|admin|test`. `CoupleIsolationIT` classpath-ын `contracts/openapi.yaml`-ийг уншиж `space` scope-ын бүх operation-ийг цуглуулна; `IsolationFixture` C2-д resource төрөл бүрийн объект үүсгэж path параметрт орлуулна; C1-ийн A-аар дуудахад 403/404, C2-ийн өгөгдөл өөрчлөгдөөгүй. Fixture-гүй шинэ path параметр → тест унана | AC-55: шинэ endpoint автоматаар орно |
| DD-AURA-029 Rate limit | `AttemptLimiter` — `attempt_counter(key, window_start, count, locked_until)` DB-д: нэвтрэх `login:{ip}:{email}` 10/15 мин, имэйлийн код `verify:{userId}` 5 → 15 мин, урилга `invite:{userId}` 10/цаг, зүрх `signal:{userId}` 10/мин (санах ойд Caffeine — сэргээлт шаардлагагүй) | AC-05, AC-01, AC-09, AC-19. Bucket4j+Redis татгалзав |
| DD-AURA-030 Нууц үг | Argon2id (`spring-security-crypto`, m=19 MiB, t=2, p=1). Нийтлэг/алдагдсан жагсаалт `backend/src/main/resources/security/common-passwords.txt` (10 000 мөр) | AC-164, AC-195 |
| DD-AURA-031 Timing-safe бүртгэл | `POST /auth/register` үргэлж 202 + ижил бие; бүртгэлтэй имэйлд «аль хэдийн бүртгэлтэй» имэйл, шинэд кодтой имэйл. Хариу өгөхөөс өмнө Argon2 hash-ийг хоёр замд ч тооцож, имэйл илгээлт async | AC-02 |
| DD-AURA-032 OAuth | Backend дамжсан: `GET /auth/oauth/google/start?client=web|native` → Google → `GET /auth/oauth/google/callback` → web-д `302 /oauth-callback?code=…`, native-д `302 aura://oauth-callback?code=…`; client `POST /auth/oauth/exchange {code}` (60 с, нэг удаа). Ижил имэйлтэй баталгаажсан акаунт байвал `linkRequired=true` + нууц үг эсвэл имэйлийн кодоор `POST /auth/oauth/link`. Apple — ижил зам, `enabled=false`. E2E — `e2e` profile-д `aura.oauth.google.issuer` нь stub IdP (GAP-18) | AC-06, AC-167 |
| DD-AURA-033 Апп түгжээ | Client-д: PIN (4–6) PBKDF2-SHA256 hash `expo-secure-store` / IndexedDB; биометр `expo-local-authentication`; вэбэд passkey — серверээр баталгаажуулна (`webauthn4j`, `/passkeys/**`). `AppLockProvider` AppState/`visibilitychange`-ээр арын хугацааг тоолно (GAP-20) | AC-52, AC-124, AC-157. 10 буруу → refresh устгаж S-03 |
| DD-AURA-034 Хос тасалалт ба устгал | `space.status`: `ACTIVE → BREAKING (14 хоног, зөвхөн унших/экспорт) → PURGING → устсан` эсвэл `→ ACTIVE` (хоёулаа сэргээвэл). Акаунт устгал (GAP-14): хэрэглэгчийн хувийн өгөгдөл шууд устна, space `ORPHANED` (30 хоног, B зөвхөн унших/экспорт) → purge. Бичих endpoint бүр `SpaceWritableGuard` → 423 `SPACE_READ_ONLY` | AC-54, AC-127, AC-128, AC-171, INV-16 |
| DD-AURA-035 Дэлгэцийн бүтэц | Expo Router: 5 табын stack (`(tabs)/home|memories|chat|plans|together`), modal/sheet нь `presentation: 'formSheet'|'modal'|'fullScreenModal'`. Таблет ≥ 768 dp — жагсаалтын route нь `useWideLayout()`-оор дэлгэрэнгүйг баруун баганад; вэб ≥ 1024 px — `(tabs)/_layout.tsx` sidebar (`AppTabs.web.tsx`) | AC-192, §4.2 |
| DD-AURA-036 Хэл, огноо | `i18next` + `react-i18next`, түлхүүрийн файл `src/i18n/mn.json`, `en.json`; огноо `Intl.DateTimeFormat` + өөрийн `formatDate(date, pattern)` (3 формат); тоо `formatNumber` (mn: зайгаар мянгатыг). `calendarDate.ts` — цаггүй огноо `YYYY-MM-DD` string хэлбэрээр л (Date объект руу хөрвүүлэхгүй) | AC-135, AC-139, AC-199, AC-132 |
| DD-AURA-037 Ажиглалт | `logstash-logback-encoder` JSON; `LogRedaction` — `@Sensitive` DTO талбарыг `toString`/MDC-д хасна, request body лог унтраастай; Micrometer Prometheus; Sentry Java SDK `aura.sentry.dsn` хоосон бол init хийхгүй | AC-196, AC-201, AC-202 |
| DD-AURA-039 Урилгын код (AC-169) | 8 тэмдэгт = тогтмол угтвар `AURA` + 4 санамсаргүй тэмдэгт (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, `SecureRandom`); харагдац `AURA-7K3M`, гэрээнд `^AURA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$`. Хүчинтэй кодтой давхцвал дахин үүсгэнэ | FR-2.1-ийн жишээтэй ижил. 32⁴ ≈ 1 сая хувилбар, акаунт тутам 10 буруу/цаг (AC-09), 7 хоногийн хугацаа — таах эрсдэл бага. 8 санамсаргүй тэмдэгт татгалзав: гараар оруулахад урт |
| DD-AURA-038 Тохиргоонд үлдээх хязгаар | `aura.storage.quota-bytes` (10 GiB), `aura.storage.warn-ratio` 0.8, upload хязгаарууд, rate limit-ийн тоо `application.yml`-д, гэрээнд `x-aura-limit` тайлбартай | NFR-11 «серверийн тохиргоо» |

Буцаахад үнэтэй гурван шийдвэрийн дэлгэрэнгүй:

- **DD-AURA-003 (space)** — Өөр хувилбар: хос тасрахад SOLO руу буцаах. Tasралтын дараа хосын агуулга устах (FR-14.6) тул буцаалт хэрэггүй. Migration: Flyway `V1__baseline.sql`-д `space`, `space_member` эхнээс; бусад хүснэгт `space_id NOT NULL REFERENCES space ON DELETE CASCADE`. Алдааны үед: FR-2.5-ын шилжүүлэлт нэг транзакц; унавал хоёр тал SOLO-д үлдэж асуулт дахин гарна.
- **DD-AURA-006 (cookie)** — Өөр хувилбар: вэбэд ч refresh-ийг биед. XSS-д ил болох тул татгалзав. Migration шаардлагагүй (шинэ систем). Алдааны үед: cookie хаагдсан хөтөч (iOS Safari ITP-ийн 7 хоногийн цэвэрлэгээ standalone PWA-д хамаарахгүй) — refresh 401 → S-03.
- **DD-AURA-008 (хэрэглэгч тутмын queue)** — Өөр хувилбар: хосын нэг topic. Нууц агуулгын проекц (INV-04) хүлээн авагч бүрд ялгаатай тул нэг topic-оор хоёуланд ижил payload очно. Алдааны үед: WS тасарвал client exponential backoff (1→30 с) ба дахин холбогдоход бүх query invalidate.

Спекийн TQ ба plan-ийн R асуултын хариу:

| Асуулт | Хариу |
|---|---|
| TQ-01 · TQ-02 · TQ-03 · TQ-04 · TQ-05 | DD-AURA-006 · DD-AURA-011 · DD-AURA-024 · DD-AURA-012 · DD-AURA-026 |
| TQ-06 · TQ-07 · TQ-08 · TQ-09 | DD-AURA-015 · DD-AURA-027 · §4.3 · DD-AURA-028 |
| R-1 (AC-149) | DEV_TEST шат баримт ба тестийг хоёуланг (plan-ийн анхдагч) |
| R-2 (S-97) | `GET /version` → `updateRequired` → `update-required.tsx`; AC-141-ийн хүрээнд шалгана |
| R-3 (хоёр өнцгийн дуу) | `PerspectiveInput.audioMediaId` (сонголтот) — бичвэр ба дуу хоёулаа |
| R-4 («Хувийн») | S-30-ийн шүүлтийн чип `scope=private` |
| R-5 (уулзалт) | S-20-ийн алс зайн хэсгийн sheet → `PUT /couple/next-meetup` |
| R-6 (санал асуулга) | S-20-ийн нэг удаагийн `SurveyCard` → `GET/POST /me/survey` |
| R-7 (агуулгын эх) | DD-AURA-020 |

## 3. Өгөгдөл

Энэ хэсэг: ямар хүснэгт, ямар түлхүүр ба хязгаарлалт вэ? ERD — `lld.html` ③.

Нийтлэг: PK `uuid` (апп UUIDv7), цаг `timestamptz` (UTC, INV-08), «бүх өдрийн» огноо `date`, мөнгө `bigint` (₮), засагддаг биет `version bigint NOT NULL DEFAULT 0`, `created_at`, `updated_at`. Space-д хамаарах хүснэгт бүр `space_id uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE` + `(space_id, …)` индекс. Flyway: `V1__baseline.sql` (суурь, T-02), дараа нь домэйн бүрд `V<n>__<домэйн>.sql` (нэгжийн дарааллаар). Өргөтгөл: `pg_trgm`, `citext`.

| Биет | Түлхүүр | Холбоос | Инвариант |
|---|---|---|---|
| `users` (id, email `citext`, password_hash, display_name, call_name, birth_date `date`, timezone, locale, city_name, city_lat, city_lon, country_code, avatar_media_id, email_verified_at, status `ACTIVE/SUSPENDED/DELETED`, require_password `bool`, session_version `int`, policy_version, policy_accepted_at, online_visible, typing_visible, last_active_at, version) | PK id; UNIQUE email | → `media` (avatar) | Баталгаажаагүй хэрэглэгч хос болохгүй (AC-165); 18+ (AC-04) |
| `user_preference` (user_id, theme `DARK/LIGHT/SYSTEM`, date_format `YMD_DOT/DMY_SLASH/MDY_SLASH`, animation `ALL/REDUCED/OFF`, haptics, sound, checkin_auto_share, mascot_color, intro_seen, first_week_hidden) | PK user_id | → users | Анхдагч: DARK, YMD_DOT, ALL, haptics=true, sound=false, auto_share=false (AC-183, AC-217) |
| `oauth_identity` (id, user_id, provider `GOOGLE/APPLE`, subject, email) | UNIQUE(provider, subject) | → users | Нэг хэрэглэгчид provider тутам нэг |
| `email_token` (id, user_id, purpose `VERIFY/EMAIL_CHANGE/PASSWORD_RESET/NOT_ME/OAUTH_LINK`, code_hash, link_token_hash, new_email, expires_at, attempts, consumed_at) | UNIQUE link_token_hash | → users | VERIFY 15 мин, RESET 30 мин, нэг удаагийн (AC-165, AC-166) |
| `device_session` (id, user_id, device_name, platform `IOS/ANDROID/WEB`, created_at, last_used_at, revoked_at, revoked_reason) | PK id | → users | Revoke → бүх refresh хүчингүй |
| `refresh_token` (id, session_id, token_hash, expires_at, rotated_at, replaced_by) | UNIQUE token_hash | → device_session | rotated токен дахин ирвэл бүх session revoke (AC-07) |
| `attempt_counter` (key, window_start, count, locked_until) | PK key | — | DD-AURA-029 |
| `policy_acceptance` (user_id, version, accepted_at) | PK(user_id, version) | → users | AC-63; одоогийн хувилбар `aura.policy.version` |
| `space` (id, kind `SOLO/COUPLE`, status `ACTIVE/BREAKING/ORPHANED/PURGING`, timezone, start_date, start_date_confirmed `bool`, theme `CORAL/LAVENDER/FOREST/OCEAN`, next_meetup_at, chat_disappear_seconds, linked_at, read_only_until, storage_bytes `bigint`, version) | PK id | — | COUPLE-д яг 2 идэвхтэй гишүүн |
| `space_member` (space_id, user_id, space_kind, joined_at, left_at, proposed_start_date, partner_nickname, partner_avatar_media_id, solo_share_decision `PENDING/SHARED/KEPT`, breakup_confirmed_at, restore_confirmed_at) | PK(space_id, user_id); **UNIQUE(user_id) WHERE space_kind='COUPLE' AND left_at IS NULL** | → space, users | INV-02 (AC-66) |
| `theme_proposal` (id, space_id, proposer_id, theme, status `PENDING/ACCEPTED/DECLINED`) | PK id | → space | Нэг PENDING / space |
| `invite` (id, code `varchar(9)` «AURA-XXXX», inviter_id, expires_at, status `ACTIVE/USED/CANCELLED/EXPIRED`) | UNIQUE code | → users | Алфавит `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (0/O/1/I-гүй), 7 хоног (AC-169) |
| `pairing` (id, invite_id, inviter_id, joiner_id, status `AWAITING_INVITER/LINKED/CANCELLED`, space_id) | UNIQUE invite_id | → invite, users | Хоёр баталгаа (AC-170); тасалснаас 14 хоногт шинэ pairing-гүй (AC-171) |
| `notification` (id, user_id, space_id, type, params `jsonb`, deep_link, created_at, read_at) | PK id; idx(user_id, created_at desc) | → users | Push-ийн тохиргооноос үл хамааран бичигдэнэ (AC-119) |
| `notification_setting` (user_id, dnd_start `time`, dnd_end, hide_content, greeting_morning, greeting_evening, greeting_morning_at, greeting_evening_at, quiet_until, disabled_types `text[]`) | PK user_id | → users | DND анхдагч 23:00–07:00 (AC-184); мэндчилгээ анхдагч = алс зайн (GAP-26) |
| `push_subscription` (id, user_id, session_id, kind `WEB/EXPO`, endpoint, p256dh, auth, expo_token, local_reminders, created_at) | UNIQUE endpoint | → users, device_session | 404/410 → устгана (AC-154) |
| `push_outbox` (id, user_id, notification_id, deliver_after, status `PENDING/SENT/MERGED/DROPPED`) | idx(status, deliver_after) | → notification | DND-ийн нэгтгэл (AC-48) |
| `scheduled_reminder` (id, user_id, space_id, source_type `DATE_PLAN/ANNIVERSARY/LETTER/GREETING/INACTIVITY`, source_id, fire_at, status) | idx(status, fire_at) | → users | Эх объект өөрчлөгдөхөд устгаж дахин үүсгэнэ (AC-35) |
| `media` (id, space_id, owner_id, kind `IMAGE/VIDEO/AUDIO/FILE`, mime, size_bytes, file_name, s3_key, variants `jsonb`, blurhash, width, height, duration_ms, waveform `jsonb`, status `PENDING/PROCESSING/READY/FAILED`) | PK id | → space | Хуучин сервер дээр GPS 0 (AC-21) |
| `upload_session` (id, owner_id, space_id, purpose, file_name, declared_mime, total_bytes, chunk_size, received `int[]`, s3_upload_id, etags `jsonb`, status, expires_at, media_id) | PK id | → users, space | 24 цагийн дараа abort |
| `memory` (id, space_id, author_id, client_id, title, description, occurred_on `date`, location_name, lat, lon, city, country_code, location_source `EXIF/MANUAL/NONE`, date_source, status `UPLOADING/READY`, date_plan_id, deleted_at, purge_after, search_text, version) | UNIQUE(author_id, client_id); GIN trgm(search_text); idx(space_id, occurred_on desc) | → space, users, date_plan | Зөвхөн author засна (INV-03); устгавал 30 хоног (AC-23) |
| `memory_media` (memory_id, media_id, position, alt_text) | PK(memory_id, media_id) | → memory, media | 1–20 (AC-172) |
| `memory_tag` (memory_id, tag) | PK(memory_id, tag) | → memory | — |
| `memory_group` (id, space_id, name, cover_media_id, version) · `memory_group_item` (group_id, memory_id) | PK | → memory | Бүлэг устахад дурсамж хэвээр (AC-81) |
| `memory_perspective` (id, memory_id, author_id, text, audio_media_id, version) | UNIQUE(memory_id, author_id) | → memory | Өөрийнхийг л засна (AC-82) |
| `memory_comment` (id, space_id, memory_id, author_id, text, edited_at) | GIN trgm(text) | → memory | AC-173 |
| `reaction` (id, space_id, target_type `MEMORY/MESSAGE/COMMENT`, target_id, user_id, emoji) | UNIQUE(target_type, target_id, user_id) | — | Хүн тутам нэг реакц / объект |
| `memory_favorite` (memory_id, user_id) | PK | → memory | Хүн тутам (AC-83) |
| `memory_recap` (id, space_id, anniversary_on `date`, year_label, memory_ids `uuid[]`) | UNIQUE(space_id, anniversary_on) | → space | ≥ 5 дурсамжтай жилд л (AC-84) |
| `heart_signal` (id, space_id, sender_id, kind `HEART/HUG/THINKING`, text ≤ 80, couple_day `date`, created_at, seen_at) | idx(space_id, couple_day) | → space | 10/мин (AC-19) |
| `daily_question` (space_id, couple_day, question_id) · `question_answer` (id, space_id, couple_day, user_id, text, created_at) | PK(space_id, couple_day); UNIQUE(space_id, couple_day, user_id) | → space | INV-04 (AC-15) |
| `chat_message` (id, space_id, sender_id, client_message_id, kind `TEXT/IMAGE/VOICE/FILE/LOCATION/HEART`, text, media_id, location `jsonb`, reply_to_id, edited_at, deleted_at, disappear_seconds, expires_at, delivered_at, read_at, pinned_at, pinned_by, screenshot_at) | UNIQUE(sender_id, client_message_id); GIN trgm(text); idx(space_id, created_at) | → space | INV-05: устгах/дуусахад `text`, `media_id`, `location` NULL болж медиа устна |
| `shared_promise` (id, space_id, proposer_id, text, status `PROPOSED/ACTIVE/DECLINED/ENDED`, starts_on, ends_on, outcome_a, outcome_b) | idx(space_id, status) | → space | Нэг ACTIVE / space |
| `date_idea` (id, space_id, author_id, title ≤ 80, description, category `FOOD/TRAVEL/HOME/SPORT/CULTURE/OUTDOOR/OTHER`, budget_mnt, place_name, lat, lon, url, setting `HOME/OUTDOOR`, library_id, version) | idx(space_id) | → space | Сангийн хуулбар эхийг өөрчлөхгүй (AC-99) |
| `date_plan` (id, space_id, proposer_id, idea_id, title, description, category, starts_at, timezone, place_name, lat, lon, status `PENDING/COUNTER_PROPOSED/CONFIRMED/DECLINED/CANCELLED`, recurrence `NONE/WEEKLY/MONTHLY`, recurrence_until, series_id, occurrence_on, planned_budget_mnt, reminder_offsets `int[]` (минут), memory_id, version) | idx(space_id, starts_at) | → space, date_idea | UTC (AC-34); exception мөр нь `series_id`+`occurrence_on` (AC-37) |
| `plan_counter_option` (id, plan_id, proposer_id, starts_at, chosen) | — | → date_plan | 1–3 (AC-33) |
| `checklist_item` (id, plan_id, text, position, done_by, done_at, version) | — | → date_plan | AC-96 |
| `expense` (id, plan_id, payer_id, amount_mnt, note, spent_on `date`) | — | → date_plan | AC-97 |
| `deck_swipe` (space_id, user_id, idea_ref, liked) | PK(user_id, idea_ref) | → space | Нөгөөгийн мөр API-д гарахгүй (AC-36) |
| `anniversary` (id, space_id, author_id, title, date `date`, kind `ANNIVERSARY/BIRTHDAY/FIRST_MET/OTHER`, recurring, note, reminder_days `int[]` (7,1,0), version) · `anniversary_memory` | idx(space_id) | → space | Автомат ойн мөр хадгалагдахгүй — тооцоолно (AC-102) |
| `milestone_note` (space_id, occasion_key, note, memory_ids `uuid[]`, reminder_days, version) | PK(space_id, occasion_key) | → space | Автомат ойд тэмдэглэл, сануулга (AC-105) |
| `gift_idea` (id, space_id, owner_id, occasion_key, text, done) | idx(owner_id, occasion_key) | → space | Owner-оос бусдад 0 (AC-40) |
| `celebration_seen` (user_id, event_key, seen_at) | PK | → users | GAP-23 (AC-39, AC-MO-02) |
| `list_item` (id, space_id, list_kind `BUCKET/TODO/SHOPPING/WISHLIST`, title, description, category, wish_type `MOVIE/BOOK/PLACE/OTHER`, position, created_by, done_by, done_at, cleared_at, version) · `list_item_vote` (item_id, user_id) | idx(space_id, list_kind, position) | → space | AC-41, AC-109 |
| `goal` (id, space_id, title, target_date, target_amount_mnt, created_by, completed_at, version) · `goal_step` (id, goal_id, title, position, done_by, done_at) · `goal_contribution` (id, goal_id, user_id, amount_mnt, created_at) | — | → space | Явц = Σ contribution / target (AC-108) |
| `letter` (id, space_id, author_id, recipient_id, template `PAPER_1/PAPER_2/PAPER_3`, body, deliver_at, occasion_label, status `DRAFT/SCHEDULED/DELIVERED/READ/CANCELLED`, delivered_at, read_at, version) · `letter_media` (≤ 5) | idx(status, deliver_at) | → space | Хүргэхээс өмнө хүлээн авагчид агуулга 0 (AC-43) |
| `capsule` (id, space_id, creator_id, title, open_on `date`, status `WRITING/SEALED/OPENED`, opened_at) · `capsule_part` (capsule_id, author_id, body, sealed_at, media) | PK(capsule_id, author_id) | → space | Хоёулаа битүүмжилсний дараа түгжинэ; нээхээс өмнө хэнд ч агуулга 0 (AC-45, GAP-15) |
| `check_in` (id, user_id, space_id, local_date, level 1–5, note, shared) | UNIQUE(user_id, local_date) | → users | Өнгөрсөн өдөр засахгүй (AC-114) |
| `data_export` (id, user_id, space_id, kind `FULL/BOOK_PDF/ALBUM_ZIP`, params `jsonb`, status `QUEUED/RUNNING/READY/FAILED/EXPIRED`, s3_key, ready_at, expires_at) | idx(user_id) | → users | 7 хоногийн дараа 410 (AC-126) |
| `job` (id, type, payload `jsonb`, run_at, status, attempts, locked_until, last_error) | idx(status, run_at) | — | DD-AURA-010 |
| `webauthn_credential` (id, user_id, credential_id, public_key, sign_count, created_at) | UNIQUE credential_id | → users | AC-157 |
| `first_week_task` (user_id, task_key, status `DONE/SKIPPED`, at) | PK | → users | AC-134 |
| `survey_response` (id, user_id, score 1–5 NULL=алгассан, created_at) | idx(user_id, created_at) | → users | 30 хоногт ≤ 1 (AC-207, GAP-17) |
| `shedlock` | PK name | — | ShedLock-ийн стандарт хүснэгт |

Устгалын журам (INV-16): `CouplePurgeJob` нь space-ийн `media.s3_key` + variants-ыг S3-аас устгаж, дараа нь `DELETE FROM space` (CASCADE). `AC-54`-ийн IT нь бүх хүснэгтийн `space_id`-аар тоолж 0, S3 prefix `spaces/{id}/` хоосон гэдгийг шалгана. S3 key: `spaces/{spaceId}/{mediaId}/{variant}`.

## 4. Гадаргуу — индекс

Энэ хэсэг: давхарга бүр юуг хэрэгжүүлж, аль гэрээгээр холбогдох вэ? BFF давхарга байхгүй — mobile нь backend-ийн `/api/v1`-ийг шууд дуудна.

| Гадаргуу | Юу хэрэгжүүлнэ | Компонент | Гэрээ | AC |
|---|---|---|---|---|
| Домэйн · auth | Бүртгэл, баталгаажуулалт, нэвтрэлт, session, OAuth, нууц үг, имэйл солих, «Би биш» | `RegistrationService`, `EmailVerificationService`, `JwtService`, `RefreshTokenService`, `LoginRateLimiter`, `PasswordResetService`, `EmailChangeService`, `GoogleOAuthController`, `DeviceSessionService` | openapi `Auth`, `Me`, `Sessions` | AC-01…07, AC-03, AC-56, AC-125, AC-136, AC-164…168, AC-187, AC-189 |
| Домэйн · account | Профайл, тохиргоо, бодлого, эхний 7 хоног, баяр, санал асуулга, geocoding | `ProfileService`, `PreferenceService`, `PolicyVersionService`, `FirstWeekTasks`, `CelebrationSeenService`, `SurveyService` | `Me`, `Policies`, `Geo` | AC-62…64, AC-130, AC-134, AC-207, AC-39 |
| Домэйн · couple | Урилга, хос холбох, эхэлсэн өдөр, ганцаараа агуулга, хосын тохиргоо, сэдэв, уулзалт, тасалалт, сэргээлт | `InviteService`, `CoupleService`, `StartDateService`, `SoloContentShareService`, `CoupleSettingsService`, `CoupleBreakupService`, `AccountDeletionService`, `CouplePurgeJob` | `Couple`, `Invites` | AC-08…12, AC-65…68, AC-169…171, AC-54, AC-127, AC-128, AC-137, AC-138, AC-185 |
| Домэйн · realtime | STOMP, хэрэглэгч тутмын queue, presence, typing | `WebSocketConfig`, `CoupleChannelInterceptor`, `PresenceService`, `RealtimePublisher` | asyncapi `userEvents`, `typing`, `presence`, `chatDelivered` | AC-17, AC-27, AC-31, AC-70, AC-177 |
| Домэйн · notification | Апп доторх жагсаалт, push суваг, DND, нуух, тайван горим, сануулга, мэндчилгээ, inactivity | `NotificationService`, `NotificationDispatcher`, `NotificationPreferenceService`, `QuietModeService`, `PushSubscriptionService`, `WebPushSender`, `ExpoPushSender`, `ReminderScheduler`, `GreetingJob`, `InactivityReminderJob` | `Notifications`, `Push` | AC-48…51, AC-68, AC-119…123, AC-154, AC-155, AC-180, AC-184 |
| Домэйн · media | Chunk upload, MIME шалгалт, дахин кодлолт, thumbnail, квот, хөрвүүлэлт | `UploadSessionService`, `MediaStorageService`, `MediaInspector`, `ImageProcessor`, `StorageQuota`, `VideoTranscodeJob`, `AudioTranscodeJob` | `Uploads`, `Media` | AC-20, AC-21, AC-24, AC-129, AC-172, AC-195, AC-200 |
| Домэйн · dashboard, signal, question, weather | Нүүрний нэгтгэл, зүрх, өдрийн асуулт, цаг агаар | `DashboardService`, `HeartSignalService`, `DailyQuestionService`, `WeatherService`, `OpenMeteoClient` | `Dashboard`, `Signals`, `Questions`, `Weather` | AC-13…19, AC-69…78, AC-100, AC-210 |
| Домэйн · memory | Дурсамж, медиа, сэтгэгдэл, реакц, дуртай, өнцөг, хогийн сав, бүлэг, хайлт, recap, PDF, ZIP | `MemoryService`, `MemoryTrashService`, `TrashPurgeJob`, `MemoryGroupService`, `MemorySearchService`, `MemoryRecapJob`, `MemoryBookPdfService`, `MemoryAlbumZipService` | `Memories`, `MemoryGroups`, `Recaps`, `Exports` | AC-20…26, AC-79…86, AC-172…175 |
| Домэйн · chat | Мессеж, төлөв, reply, реакц, засах/устгах, хайлт, pin, алга болдог, амлалт | `ChatMessageService`, `ChatSearchService`, `PinService`, `DisappearingMessageJob`, `SharedPromiseService` | `Chat`, `Promises` | AC-27…32, AC-87…93, AC-176…178 |
| Домэйн · plan | Санаа, сан, санамсаргүй, болзоо, хариу, давталт, checklist, төсөв, deck, ICS | `DateIdeaService`, `IdeaLibraryService`, `RandomIdeaPicker`, `DatePlanService`, `DateRecurrence`, `ReminderRegistry`, `BudgetSummaryService`, `SecretDeckService` | `Ideas`, `Plans`, `Deck`, `Budget` | AC-33…37, AC-94…101, AC-179, AC-180 |
| Домэйн · anniversary | Ой, автомат ой, сануулга, нууц бэлэг | `AnniversaryService`, `AutoMilestoneCalculator`, `GiftIdeaService` | `Anniversaries`, `GiftIdeas` | AC-38…40, AC-102…105, AC-181 |
| Домэйн · lists | Жагсаалт, санал, эрэмбэ, зорилго, алхам, хандив | `SharedListService`, `GoalService` | `Lists`, `Goals` | AC-41, AC-42, AC-106…110, AC-131 |
| Домэйн · letter | Захидал, хүргэлт, capsule | `LetterService`, `LetterDeliveryJob`, `TimeCapsuleService` | `Letters`, `Capsules` | AC-43…45, AC-111…113, AC-182 |
| Домэйн · checkin, stats | Check-in, газрын зураг, статистик, «Бидний жил» | `CheckInService`, `StatsService`, `FootstepsCalculator`, `YearInReviewService` | `CheckIns`, `Stats` | AC-46, AC-47, AC-114…118, AC-183, AC-86 |
| Домэйн · export, admin, security | Экспорт, админ, passkey, хувилбар | `DataExportJob`, `AdminAuthorization`, `PasskeyService`, `VersionController` | `Exports`, `Admin`, `Passkeys`, `System` | AC-53, AC-126, AC-186, AC-206, AC-157, AC-141 |
| Домэйн · testsupport (`e2e` profile) | Цаг, seed, job, push sink | `TestSupportController`, `MutableClock`, `ScenarioSeeder`, `PushSinkController` | `TestSupport` (`x-aura-scope: test`) | INV-10, AC-154, AC-211 |
| UI · суурь | Token, theme, фонт, i18n, хөдөлгөөн, маскот, ScreenState, API клиент, outbox, realtime | `src/theme`, `src/i18n`, `src/motion`, `src/components/Mascot`, `src/components/ScreenState`, `src/api`, `src/offline`, `src/realtime` | — | AC-DS-01…05, AC-MO-01…05, AC-AS-01…03, AC-192, AC-213…215 |
| UI · дэлгэцүүд | S-01…S-102 (§4.3) | `mobile/src/app/**` | openapi бүх tag; asyncapi | §5 |
| UI · PWA | Manifest, `+html.tsx`, service worker, суулгах заавар, Web Push client, passkey, вэбийн орлуулга | `public/manifest.json`, `sw/sw.ts`, `src/pwa/*` | `Push`, `Passkeys` | AC-140, AC-152…160, AC-191, AC-217 |
| Ажиллуулах орчин | Compose, Dockerfile, prod багц, backup, CI, k6 | §4.5 | — | AC-151, AC-161…163, AC-202…204, AC-209, AC-150 |

### 4.1 REST endpoint-ууд (`contracts/openapi.yaml`)

Нийтлэг дүрэм — хүснэгтэд давтахгүй:
- Нэвтрэлт: `scope=public`-аас бусад нь `Authorization: Bearer <access>`; токен байхгүй/хүчингүй → **401** `TOKEN_INVALID` / `TOKEN_EXPIRED`; түдгэлзсэн → **403** `ACCOUNT_SUSPENDED`.
- `scope=space` — хүсэгчийн идэвхтэй space-д хамаарна (хосгүй бол SOLO space). Өөр space-ийн ID → **404** `NOT_FOUND` (DD-AURA-004). Хос шаарддаг endpoint (`*` тэмдэгтэй) SOLO үед **409** `NOT_PAIRED`.
- Бичих үйлдэл space `BREAKING`/`ORPHANED` үед **423** `SPACE_READ_ONLY` (AC-127).
- Оролтын алдаа **400** `VALIDATION_FAILED` + `fieldErrors[]`. Засварт `version` зөрвөл **409** `VERSION_CONFLICT` + `current` (DD-AURA-016). Бусдын объектыг засах/устгах → **403** `NOT_OWNER`.
- Алдааны бие `ApiError {code, message, traceId, fieldErrors?, retryAfterSeconds?, details?}`; `message` нь `Accept-Language` (mn/en)-ээр.
- Жагсаалт: `?cursor&limit` (анхдагч 30, ≤ 100) → `{items[], nextCursor}`.
- `x-aura-scope` ба `x-aura-ac` нь operation бүрд гэрээнд.

**Auth · public**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `POST /auth/register` | public | `RegisterRequest {email, password, displayName, birthDate, locale, timezone, acceptedPolicyVersion}` | 202 `AcceptedResponse` (бүртгэлтэй эсэхээс үл хамааран ижил) | 400 `PASSWORD_WEAK`/`PASSWORD_COMMON`/`AGE_RESTRICTED`/`POLICY_NOT_ACCEPTED` | AC-02, AC-04, AC-63, AC-164 |
| `POST /auth/verify-email` | public | `VerifyEmailRequest {email, code}` | 200 `TokenResponse` | 400 `CODE_INVALID` (+`attemptsLeft`), 423 `CODE_LOCKED` (+`retryAfterSeconds`), 410 `CODE_EXPIRED` | AC-01, AC-165 |
| `POST /auth/verify-email/link` | public | `TokenRequest {token}` | 200 `TokenResponse` | 410 `TOKEN_EXPIRED`, 400 `TOKEN_INVALID` | AC-165 |
| `POST /auth/verify-email/resend` | public | `EmailRequest {email}` | 202 | 429 `RATE_LIMITED` (60 с) | AC-01 |
| `POST /auth/login` | public | `LoginRequest {email, password, device {name, platform}}` | 200 `TokenResponse {accessToken, accessExpiresAt, refreshToken? (native л), user: Me}`; web-д `Set-Cookie: aura_rt` | 401 `AUTH_INVALID_CREDENTIALS`, 403 `AUTH_EMAIL_NOT_VERIFIED`, 429 `RATE_LIMITED` (+`Retry-After`) | AC-05, AC-195 |
| `POST /auth/refresh` | public | `RefreshRequest {refreshToken?}` эсвэл cookie + `X-Aura-Client: web` | 200 `TokenResponse` (шинэ refresh) | 401 `AUTH_SESSION_REVOKED` (дахин ашиглалт → бүх session хаагдсан) | AC-03, AC-07, AC-168 |
| `POST /auth/logout` | user | — | 204 (cookie цэвэрлэнэ) | — | AC-56 |
| `POST /auth/password-reset/request` | public | `EmailRequest` | 202 (ижил хариу) | 429 | AC-166 |
| `POST /auth/password-reset/confirm` | public | `PasswordResetConfirm {token, newPassword}` | 204 (бүх session хаагдана) | 410 `TOKEN_EXPIRED`, 400 `TOKEN_INVALID`/`PASSWORD_*` | AC-03, AC-166 |
| `POST /auth/not-me` | public | `TokenRequest` (имэйлийн «Би биш») | 204 — бүх session revoke, `require_password=true` | 410, 400 | AC-125, AC-187 |
| `GET /auth/oauth/{provider}/start` | public | `provider: google|apple`, `?client=web|native` | 302 → IdP | 404 `PROVIDER_DISABLED` | AC-06 |
| `GET /auth/oauth/{provider}/callback` | public | `?code&state` | 302 → `/oauth-callback?code=` эсвэл `aura://oauth-callback?code=` | 302 `?error=` | AC-06 |
| `POST /auth/oauth/exchange` | public | `OAuthExchangeRequest {code, device}` | 200 `OAuthExchangeResponse {tokens?: TokenResponse, linkRequired, linkToken?, isNewUser}` | 400 `CODE_INVALID`, 410 | AC-06, AC-167 |
| `POST /auth/oauth/link` | public | `OAuthLinkRequest {linkToken, password? , emailCode?}` | 200 `TokenResponse` | 401 `AUTH_INVALID_CREDENTIALS`, 410 | AC-167 |
| `GET /policies/current` | public | `?locale` | 200 `PolicyDocument {version, publishedAt, privacyMarkdown, termsMarkdown}` | — | AC-63, AC-130 |
| `GET /version` | public | `?platform=web|android|ios&current` | 200 `VersionInfo {latest, minVersion, build, commitSha, downloadUrl, storeUrl, updateAvailable, updateRequired}` | — | AC-141 |

**Me, sessions, тохиргоо · user**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /me` | user | — | 200 `Me {id, email, displayName, callName, birthDate, timezone, locale, city, avatar: MediaRef?, emailVerified, policyVersionAccepted, policyUpdateRequired, onlineVisible, typingVisible, space: SpaceSummary}` | — | AC-63, AC-64 |
| `PATCH /me` | user | `ProfileUpdate {displayName?, callName?, birthDate?, timezone?, locale?, city?: CityRef, onlineVisible?, typingVisible?, version}` | 200 `Me` (+ WS `profile.updated` хамтрагчид) | 400 `AGE_RESTRICTED`, 409 | AC-62, AC-64, AC-70, AC-177 |
| `PUT /me/avatar` | user | `AvatarRequest {mediaId}` (≤ 10 MB зураг) | 200 `Me` | 413 `MEDIA_TOO_LARGE`, 415 | AC-62 |
| `GET /me/preferences` · `PATCH /me/preferences` | user | `Preferences {theme, dateFormat, animation, haptics, sound, checkinAutoShare, mascotColor, introSeen, firstWeekHidden}` | 200 `Preferences` | — | AC-183, AC-190, AC-217, AC-139 |
| `POST /me/policy-acceptance` | user | `PolicyAcceptance {version}` | 204 | 400 | AC-63 |
| `POST /me/password` | user | `PasswordChange {currentPassword, newPassword}` | 204 (бусад session хаана) | 401, 400 `PASSWORD_*` | AC-189 |
| `POST /me/email-change` | user | `EmailChangeRequest {newEmail, password}` | 202 | 401 | AC-136 |
| `POST /me/email-change/confirm` | user | `CodeRequest {code}` | 200 `Me` (хуучин хаягт «та биш бол» имэйл) | 400 `CODE_INVALID`, 423 | AC-136 |
| `GET /me/sessions` | user | — | 200 `DeviceSession[] {id, deviceName, platform, createdAt, lastUsedAt, current}` | — | AC-56 |
| `DELETE /me/sessions/{sessionId}` | user | — | 204 | 404 | AC-56 |
| `POST /me/sessions/revoke-all` | user | `RevokeAllRequest {requirePassword}` | 204 | — | AC-125, AC-187 |
| `POST /me/deletion` | user | `AccountDeletionRequest {password, confirmPhrase}` | 202 `AccountDeletionResult {partnerExportUntil?}` | 401 | AC-128 |
| `GET /me/first-week-tasks` | user | — | 200 `FirstWeekState {day 1–7, today: FirstWeekTask?, visible}` | — | AC-134 |
| `PUT /me/first-week-tasks/{taskKey}` | user | `TaskStatusRequest {status: DONE|SKIPPED}` | 200 `FirstWeekState` | 404 | AC-134 |
| `GET /me/celebrations` | user | — | 200 `Celebration[] {eventKey, kind: ANNIVERSARY|MILESTONE|LINKED|MATCH|GOAL|CAPSULE, title, days?}` (үзээгүй) | — | AC-39, AC-MO-02 |
| `POST /me/celebrations/{eventKey}/seen` | user | — | 204 (idempotent) | — | AC-39, AC-MO-02 |
| `GET /me/survey` · `POST /me/survey` | user | `SurveyAnswer {score 1–5 | null=алгасах}` | 200 `SurveyPrompt {due}` / 204 | 409 `SURVEY_NOT_DUE` | AC-207 |
| `GET /geo/cities` | user | `?q&locale` | 200 `CityRef[] {name, countryCode, lat, lon, timezone}` | 503 `UPSTREAM_UNAVAILABLE` | AC-62, AC-74 |

**Couple · урилга ба хос**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `POST /invites` | user | — | 201 `Invite {id, code "AURA-7K3M", link, expiresAt}` | 403 `AUTH_EMAIL_NOT_VERIFIED`, 409 `ALREADY_PAIRED`, 409 `PAIRING_COOLDOWN` (+`availableAt`) | AC-66, AC-165, AC-169, AC-171 |
| `GET /invites/current` | user | — | 200 `Invite` / 204 | — | AC-169 |
| `DELETE /invites/{inviteId}` | user | — | 204 | 404 | AC-169 |
| `GET /invites/lookup` | user | `?code` | 200 `InvitePreview {inviterName, inviterAvatar, expiresAt}` | 410 `INVITE_INVALID`, 423 `INVITE_LOCKED`, 409 `ALREADY_PAIRED` | AC-08, AC-09, AC-66, AC-170 |
| `POST /pairings` | user | `PairingRequest {code}` | 201 `Pairing {id, status: AWAITING_INVITER, inviter, joiner}` (inviter-т мэдэгдэл + push) | 410, 423, 409 `ALREADY_PAIRED`, 403 `AUTH_EMAIL_NOT_VERIFIED` | AC-68, AC-170 |
| `GET /pairings/current` | user | — | 200 `Pairing` / 204 | — | AC-170 |
| `POST /pairings/{pairingId}/confirm` | user | — (inviter) | 200 `Couple` (хоёуланд WS `couple.linked`) | 409 `ALREADY_PAIRED`, 404 | AC-11, AC-170 |
| `POST /pairings/{pairingId}/cancel` | user | — | 204 (хоёуланд мэдэгдэл) | 404 | AC-10 |
| `GET /couple` | space | — | 200 `Couple {id, kind, status, timezone, startDate, startDateStatus: CONFIRMED|PENDING|MISMATCH, myProposal, partnerProposal, theme, pendingThemeProposal?, partner: PartnerCard?, myView {partnerNickname, partnerAvatar, mascotColor}, nextMeetupAt, isLongDistance, readOnlyUntil?, breakup?: BreakupState, soloShare?: {pendingCount}}` | — | AC-65, AC-137 |
| `PUT /couple/start-date` * | space | `StartDateProposal {date}` | 200 `Couple` | 400 (ирээдүйн огноо) | AC-65 |
| `POST /couple/solo-share` * | space | `SoloShareDecision {share: bool}` | 200 `{movedCount}` | 409 `ALREADY_DECIDED` | AC-67 |
| `PATCH /couple/my-view` * | space | `MyViewUpdate {partnerNickname?, partnerAvatarMediaId?, mascotColor?}` | 200 `Couple` (зөвхөн дуудагчид) | — | AC-137, AC-190 |
| `POST /couple/theme-proposals` * | space | `ThemeProposalRequest {theme}` | 201 `ThemeProposal` | 409 (PENDING бий) | AC-138 |
| `POST /couple/theme-proposals/{proposalId}/accept` · `/decline` * | space | — | 200 `Couple` / 204 (proposer-т мэдэгдэл) | 403 (өөрийнхийг) | AC-138 |
| `PUT /couple/next-meetup` * | space | `NextMeetup {at: date-time|null}` | 200 `Couple` | — | AC-74 |
| `POST /couple/breakup` * | space | `BreakupRequest {password, confirmStep: 2}` | 202 `BreakupState {status, restoreDeadline, myRestoreConfirmed, partnerRestoreConfirmed}` | 401 | AC-185 |
| `POST /couple/restore` * | space | — | 200 `BreakupState` (хоёулаа бол `ACTIVE`) | 409 `NOT_BREAKING` | AC-127 |

**Нүүр, зүрх, асуулт, цаг агаар**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /dashboard` | space | `?tz` | 200 `Dashboard {counter {days, startDate, breakdown {years, months, days}, confirmed}, me: PersonCard, partner: PersonCard? {name, onlineStatus?, localTime, utcOffsetMinutes, offsetFromMeMinutes, weather?: WeatherNow, quietUntil?}, longDistance? {distanceKm, nextMeetupAt}, signalsToday {sent, received}, unseenSignals: SignalSummary?, nextDate?: DatePlanSummary, upcoming: OccasionSummary[], recentMemories: MemorySummary[] (≤ 5), unreadMessages, onThisDay?: OnThisDaySummary, recap?: RecapSummary, incomingLetters: LetterTeaser[], survey?: SurveyPrompt, update?: VersionInfo}` | — | AC-13, AC-14, AC-65, AC-71…74, AC-78, AC-84, AC-182, AC-123 |
| `GET /questions/today` * | space | — | 200 `DailyQuestion {coupleDay, question {id, textMn, textEn, category}, myAnswer?, partnerAnswered: bool, partnerAnswer? (зөвхөн myAnswer байвал)}` | — | AC-15, AC-75 |
| `POST /questions/today/answer` * | space | `AnswerRequest {text ≤ 1000}` | 200 `DailyQuestion` | 409 `ALREADY_ANSWERED` | AC-15 |
| `GET /questions/history` * | space | cursor | 200 `DailyQuestionPage` (хоёулаа хариулсных л хариулттай) | — | AC-75 |
| `POST /signals` * | space | `SignalRequest {kind: HEART|HUG|THINKING, text? ≤ 80, clientId}` | 201 `Signal` | 429 `RATE_LIMITED` (+`retryAfterSeconds`), 400 `TEXT_TOO_LONG` | AC-17, AC-19, AC-76, AC-77, AC-178 |
| `GET /signals/unseen` * | space | — | 200 `SignalSummary {count, kinds, lastText?}` | — | AC-18 |
| `POST /signals/seen` * | space | — | 204 | — | AC-18 |
| `GET /weather` | user | `?lat&lon&date?` | 200 `WeatherNow {tempC, code, icon, attribution}` эсвэл `WeatherForecast` (date ≤ 14 хоног) / 204 (> 14) | 503 `UPSTREAM_UNAVAILABLE` | AC-71, AC-100, AC-210 |

**Медиа ба upload**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `POST /uploads` | space | `UploadCreate {purpose: MEMORY|CHAT|LETTER|AVATAR|PERSPECTIVE_AUDIO|VOICE|FILE, fileName, mime, totalBytes, durationMs?}` | 201 `UploadSession {id, chunkSize, totalChunks, receivedChunks[], quotaWarning?}` | 413 `MEDIA_TOO_LARGE`, 415 `MEDIA_TYPE_FORBIDDEN`, 400 `VIDEO_TOO_LONG`/`AUDIO_TOO_LONG`, 507 `STORAGE_QUOTA_EXCEEDED` | AC-172, AC-87, AC-200 |
| `GET /uploads/{uploadId}` | space | — | 200 `UploadSession` | 404, 410 (хугацаа дууссан) | AC-20 |
| `PUT /uploads/{uploadId}/chunks/{index}` | space | `application/octet-stream` | 200 `UploadSession` | 415 (эхний chunk-ийн агуулга), 409 `CHUNK_SIZE_MISMATCH` | AC-20, AC-129 |
| `POST /uploads/{uploadId}/complete` | space | — | 200 `MediaRef {id, kind, status, mime, sizeBytes, width?, height?, durationMs?, blurhash?, waveform?, fileName?, urls {original, sm?, md?, lg?, poster?}, urlsExpireAt}` | 409 `UPLOAD_INCOMPLETE`, 415 | AC-21, AC-24, AC-129 |
| `DELETE /uploads/{uploadId}` | space | — | 204 | — | AC-20 |
| `GET /media/{mediaId}` | space | — | 200 `MediaRef` (шинэ URL) | 404 | AC-24, AC-55, AC-195 |
| `GET /storage/usage` | space | — | 200 `StorageUsage {usedBytes, quotaBytes, ratio, warning}` | — | AC-200 |

**Дурсамж**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /memories` | space | `?cursor&limit&q&from&to&tag&groupId&author=me|partner&favorite&hasLocation&scope=shared|private|all&place` | 200 `MemoryPage {items: MemorySummary[], nextCursor}` | — | AC-25, AC-67, AC-80, AC-175 |
| `GET /memories/months` | space | `?scope` | 200 `MonthCount[] {year, month, count}` | — | AC-80 |
| `POST /memories` | space | `MemoryCreate {clientId, title, description?, occurredOn, dateSource: EXIF|MANUAL, location?: Place, locationSource, tags[], groupIds[], media: MemoryMediaInput[] {mediaId, altText?} (1–20), datePlanId?}` | 201 `Memory` (status `UPLOADING` бол медиа бэлэн болоход `READY`) | 400 `MEDIA_LIMIT_EXCEEDED` | AC-20, AC-79, AC-95, AC-172 |
| `GET /memories/{memoryId}` | space | — | 200 `Memory {…MemorySummary, description, media[], tags[], groups[], perspectives: Perspective[], comments: Comment[] (сүүлийн 20), reactions: ReactionSummary[], myFavorite, author, datePlan?, version}` | 404 | AC-22, AC-82 |
| `PATCH /memories/{memoryId}` | space | `MemoryUpdate {…, version}` | 200 `Memory` | 403 `NOT_OWNER`, 409 | AC-22, AC-131 |
| `GET /memories/{memoryId}/delete-preview` | space | — | 200 `DeletePreview {partnerCommentCount, partnerName}` | 403 | AC-174 |
| `DELETE /memories/{memoryId}` | space | — | 200 `TrashEntry {memoryId, purgeAfter}` | 403 | AC-22, AC-174 |
| `GET /memories/trash` | space | — | 200 `TrashEntry[] {memory: MemorySummary, deletedAt, purgeAfter, daysLeft}` (зөвхөн өөрийнх) | — | AC-174, AC-23 |
| `POST /memories/{memoryId}/restore` | space | — | 200 `Memory` (сэтгэгдэл, реакцтай) | 403, 410 | AC-23 |
| `DELETE /memories/{memoryId}/purge` | space | — | 204 (storage-оос устгана) | 403 | AC-23 |
| `PUT /memories/{memoryId}/favorite` · `DELETE` | space | — | 204 | — | AC-83 |
| `PUT /memories/{memoryId}/perspective` | space | `PerspectiveInput {text ≤ 2000, audioMediaId?, version?}` | 200 `Perspective {id, author, text, audio?, version}` | 409 | AC-82 |
| `DELETE /memories/{memoryId}/perspective` | space | — | 204 (өөрийнх л) | — | AC-82 |
| `GET /memories/{memoryId}/comments` | space | cursor | 200 `CommentPage` | — | AC-173 |
| `POST /memories/{memoryId}/comments` | space | `CommentCreate {text ≤ 1000, clientId}` | 201 `Comment` | — | AC-173 |
| `PATCH /comments/{commentId}` · `DELETE /comments/{commentId}` | space | `CommentUpdate {text, version}` | 200 / 204 | 403 `NOT_OWNER` | AC-173 |
| `PUT /memories/{memoryId}/reaction` · `DELETE` | space | `ReactionInput {emoji: LOVE|ADORE|HEART_EYES|KISS|HUG|SPARKLE}` | 200 `ReactionSummary[]` | — | AC-173 |
| `GET /memories/on-this-day` | space | `?date` | 200 `OnThisDayGroup[] {year, memories[]}` | — | AC-73 |
| `GET /memories/places` | space | `?bbox` | 200 `MemoryPlace[] {lat, lon, placeName, memoryIds[], count}` | — | AC-86, AC-116 |
| `GET /memory-tags` | space | — | 200 `string[]` | — | AC-175 |
| `GET /memory-groups` · `POST /memory-groups` | space | `MemoryGroupInput {name, coverMediaId?}` | 200 `MemoryGroup[]` / 201 `MemoryGroup {id, name, cover?, count, version}` | — | AC-81 |
| `GET /memory-groups/{groupId}` · `PATCH` · `DELETE` | space | `MemoryGroupInput + version` | 200 `MemoryGroupDetail` / 200 / 204 (дурсамж хэвээр) | 409 | AC-81 |
| `PUT /memory-groups/{groupId}/memories/{memoryId}` · `DELETE` | space | — | 204 | 404 | AC-81 |
| `GET /recaps` · `GET /recaps/{recapId}` | space | — | 200 `RecapSummary[]` / `Recap {id, anniversaryOn, yearLabel, slides: RecapSlide[]}` | 404 | AC-84 |

**Экспорт**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `POST /exports` | space | `ExportRequest {kind: FULL|BOOK_PDF|ALBUM_ZIP, groupId?, from?, to?, locale}` | 202 `DataExport {id, kind, status, createdAt, readyAt?, expiresAt?}` | 429 (нэг зэрэг 1) | AC-26, AC-53, AC-85, AC-126 |
| `GET /exports` · `GET /exports/{exportId}` | space | — | 200 `DataExport[]` / `DataExport` | 404 | AC-126 |
| `GET /exports/{exportId}/download` | space | — | 302 → presigned URL | 410 `EXPORT_EXPIRED`, 409 `EXPORT_NOT_READY` | AC-126 |

**Чат**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /messages` * | space | `?before&after&around&limit` | 200 `MessagePage {items: Message[], hasMoreBefore, hasMoreAfter}` | — | AC-27, AC-88, AC-89 |
| `POST /messages` * | space | `MessageCreate {clientMessageId, kind, text? ≤ 4000, mediaId?, location?: Place, replyToId?, disappearSeconds?: 60|3600|86400}` | 201 `Message {id, clientMessageId, sender, kind, text?, media?, location?, replyTo?: MessageQuote, status: SENT|DELIVERED|READ, editedAt?, deleted, disappearSeconds?, expiresAt?, pinnedAt?, reactions[], createdAt}`; давхар `clientMessageId` → 200 анхны | 415, 413 | AC-27, AC-28, AC-87, AC-92 |
| `PATCH /messages/{messageId}` * | space | `MessageEdit {text}` | 200 `Message` | 403 `NOT_OWNER`, 409 `MESSAGE_DELETED` | AC-88 |
| `DELETE /messages/{messageId}` * | space | — | 204 (агуулга NULL, медиа устна) | 403 | AC-30, AC-176 |
| `POST /messages/read` * | space | `ReadReceipt {upToMessageId}` | 204 (WS `chat.receipt`) | — | AC-29, AC-92 |
| `GET /messages/search` * | space | `?q&cursor` | 200 `MessageSearchPage {items: {message, highlights: [start,end][]}[]}` | — | AC-89, AC-30 |
| `GET /messages/jump` * | space | `?date` | 200 `MessagePage` (тухайн өдрийн эхний мессеж төвтэй) | — | AC-89 |
| `GET /messages/pinned` * | space | — | 200 `Message[]` | — | AC-90 |
| `PUT /messages/{messageId}/pin` · `DELETE` * | space | — | 204 (хоёулаа) | — | AC-90 |
| `PUT /messages/{messageId}/reaction` · `DELETE` * | space | `ReactionInput` | 200 `ReactionSummary[]` | — | AC-88 |
| `GET /messages/media` * | space | `?kind=IMAGE|FILE|VOICE|LINK&cursor` | 200 `MessagePage` | — | S-44 |
| `POST /messages/{messageId}/screenshot` * | space | — | 204 (илгээгчид мэдэгдэл) | — | AC-92 |
| `PUT /chat/settings` * | space | `ChatSettings {disappearSeconds: 0|60|3600|86400}` | 200 `ChatSettings` | — | AC-92 |
| `GET /promises/current` · `POST /promises` * | space | `PromiseCreate {text ≤ 140}` | 200 `SharedPromise?` / 201 `SharedPromise {id, text, status, proposer, startsOn?, endsOn?, myOutcome?, partnerOutcome?}` | 409 (ACTIVE бий) | AC-93 |
| `POST /promises/{promiseId}/accept` · `/decline` * | space | — | 200 `SharedPromise` | 403 (өөрийнхийг) | AC-93 |
| `POST /promises/{promiseId}/outcome` * | space | `PromiseOutcome {kept: bool}` | 200 `SharedPromise` | 409 `PROMISE_NOT_ENDED` | AC-93 |

**Төлөвлөгөө**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /ideas` · `POST /ideas` | space | `?category&setting&maxBudget&q` / `DateIdeaInput {title, description?, category, budgetMnt?, place?, url?, setting?, clientId}` | 200 `DateIdea[]` / 201 `DateIdea` | 400 (гарчиггүй) | AC-179 |
| `GET /ideas/{ideaId}` · `PATCH` · `DELETE` | space | `DateIdeaInput + version` | 200 / 200 / 204 | 403, 409 | AC-179 |
| `GET /ideas/random` | space | `?category&setting&maxBudget&includeLibrary` | 200 `RandomPick {idea: DateIdea|LibraryIdea, candidates: int}` / 204 (тохирох алга) | — | AC-98 |
| `GET /idea-library` | user | `?season=WINTER|SPRING|SUMMER|AUTUMN&budget=FREE|UPTO_50K|50K_150K|OVER_150K&setting&longDistance&category&locale` | 200 `LibraryIdea[] {id, title, description, category, budgetBand, seasons[], setting, longDistance, durationMinutes, preparation}` | — | AC-99 |
| `POST /idea-library/{libraryId}/adopt` | space | — | 201 `DateIdea` (хуулбар) | 404 | AC-99 |
| `GET /plans` | space | `?from&to&status&view=upcoming|past|pending` | 200 `DatePlanSummary[]` (давталтыг тухайн мужид задлана) | — | AC-94 |
| `POST /plans` | space | `DatePlanCreate {clientId, title, description?, category?, ideaId?, startsAt, timezone, place?, plannedBudgetMnt?, reminderOffsets[] (минут), recurrence, recurrenceUntil?, checklist[]}` | 201 `DatePlan` (`PENDING`, хамтрагчид мэдэгдэл) | — | AC-33, AC-34, AC-110 |
| `GET /plans/{planId}` | space | `?occurrenceOn` | 200 `DatePlan {…, status, proposer, counterOptions[], checklist: ChecklistItem[], checklistProgress {done, total}, expenses[], budget: BudgetLine, weather?: WeatherForecast, memoryId?, version}` | 404 | AC-96, AC-100 |
| `PATCH /plans/{planId}` | space | `DatePlanUpdate {…, version, scope: SERIES|OCCURRENCE, occurrenceOn?}` | 200 `DatePlan` (сануулга дахин товлоно) | 409 | AC-35, AC-37, AC-131 |
| `DELETE /plans/{planId}` | space | `?scope&occurrenceOn` | 204 (цуцлах — сануулга устна) | — | AC-35, AC-37 |
| `POST /plans/{planId}/respond` | space | `PlanResponse {action: ACCEPT|DECLINE|COUNTER, options?: date-time[] (1–3)}` | 200 `DatePlan` | 403 (proposer өөрөө), 409 `PLAN_NOT_PENDING` | AC-33 |
| `POST /plans/{planId}/choose-option` | space | `ChooseOption {optionId}` | 200 `DatePlan` (`CONFIRMED`) | 409 | AC-33 |
| `POST /plans/{planId}/checklist` | space | `ChecklistInput {text}` | 201 `ChecklistItem` | — | AC-96 |
| `PATCH /checklist-items/{itemId}` · `DELETE` | space | `ChecklistUpdate {text?, done?, version}` | 200 / 204 | 409 | AC-96 |
| `POST /plans/{planId}/expenses` | space | `ExpenseInput {amountMnt, payerId, note?, spentOn}` | 201 `Expense` | — | AC-97 |
| `DELETE /expenses/{expenseId}` | space | — | 204 | 403 | AC-97 |
| `POST /plans/{planId}/memory` | space | `LinkMemory {memoryId}` | 200 `DatePlan` | 409 | AC-95 |
| `GET /plans/{planId}/ics` | space | `?occurrenceOn` | 200 `text/calendar` | — | AC-101, AC-158 |
| `GET /budget/summary` | space | `?month=YYYY-MM` | 200 `BudgetSummary {month, plannedTotal, actualTotal, overBy, shares: {userId, amount, percent}[], plans: BudgetLine[]}` | — | AC-97 |
| `GET /deck/next` | space | `?limit` | 200 `DeckCard[] {ideaRef, idea: LibraryIdea|DateIdea}` (хоёулаа swipe хийгээгүй, GAP-22) | — | AC-36 |
| `POST /deck/swipes` | space | `DeckSwipe {ideaRef, liked}` | 200 `SwipeResult {matched: bool, match?: DeckMatch}` (хоёуланд WS `deck.matched`) | 409 `ALREADY_SWIPED` | AC-36 |
| `GET /deck/matches` | space | — | 200 `DeckMatch[] {ideaRef, idea, matchedAt}` — нөгөөгийн сонголт ямар ч талбарт байхгүй | — | AC-36 |

**Ой, жагсаалт, зорилго**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /anniversaries` | space | `?from&to&tz` | 200 `Occasion[] {occasionKey, source: CUSTOM|AUTO_DAYS|AUTO_YEARS|BIRTHDAY, anniversaryId?, title, kind, date, nextOn, daysUntil, daysSince?, recurring, reminderDays[], note?, memoryCount}` | — | AC-38, AC-102, AC-103 |
| `POST /anniversaries` | space | `AnniversaryInput {title, date, kind, recurring, note?, reminderDays[]}` | 201 `Anniversary` | — | AC-181 |
| `GET /anniversaries/{anniversaryId}` · `PATCH` · `DELETE` | space | `+version` | 200 `Anniversary {…, memories: MemorySummary[]}` / 200 / 204 | 403, 409 | AC-104, AC-105 |
| `GET /occasions/{occasionKey}` | space | — | 200 `OccasionDetail {occasion, note?, memories[], reminderDays[], version}` | 404 | AC-105 |
| `PUT /occasions/{occasionKey}/note` | space | `OccasionNoteInput {note?, memoryIds[], reminderDays[], version}` | 200 `OccasionDetail` | 409 | AC-104, AC-105 |
| `GET /gift-ideas` · `POST /gift-ideas` | space | `?occasionKey` / `GiftIdeaInput {occasionKey, text}` | 200 `GiftIdea[]` (зөвхөн өөрийн) / 201 | — | AC-40 |
| `PATCH /gift-ideas/{giftIdeaId}` · `DELETE` | space | `{text?, done?}` | 200 / 204 | 404 (бусдынх) | AC-40 |
| `GET /lists/{listKind}/items` | space | `listKind: bucket|todo|shopping|wishlist` | 200 `ListItem[] {id, title, description?, category?, wishType?, position, createdBy, doneBy?, doneAt?, votes: userId[], bothWant, version}` | — | AC-107, AC-109 |
| `POST /lists/{listKind}/items` | space | `ListItemInput {title, description?, category?, wishType?, clientId}` | 201 `ListItem` | — | AC-107 |
| `PATCH /list-items/{itemId}` · `DELETE` | space | `ListItemUpdate {title?, description?, done?, version}` | 200 `ListItem` / 204 | 409 | AC-41, AC-106, AC-131 |
| `PUT /list-items/{itemId}/vote` · `DELETE` | space | — | 200 `ListItem` | — | AC-109 |
| `PUT /lists/{listKind}/order` | space | `ListOrder {itemIds[]}` | 200 `ListItem[]` | 409 (жагсаалт өөрчлөгдсөн) | AC-109 |
| `POST /lists/{listKind}/clear-done` | space | — | 200 `{cleared}` | — | AC-107 |
| `GET /goals` · `POST /goals` | space | `GoalInput {title, targetDate?, targetAmountMnt?, steps[]}` | 200 `GoalSummary[]` / 201 `Goal` | — | AC-108 |
| `GET /goals/{goalId}` · `PATCH` · `DELETE` | space | `+version` | 200 `Goal {…, steps[], stepsDone, contributions[], totals: {userId, amount}[], progressPercent}` | 409 | AC-42, AC-108 |
| `POST /goals/{goalId}/steps` · `PATCH /goal-steps/{stepId}` · `DELETE /goal-steps/{stepId}` | space | `GoalStepInput {title?, done?}` | 201/200 `Goal` / 204 | — | AC-108 |
| `POST /goals/{goalId}/contributions` · `DELETE /goal-contributions/{contributionId}` | space | `ContributionInput {amountMnt > 0}` | 201 `Goal` / 204 | 403 | AC-42 |

**Захидал, capsule, check-in, статистик**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /letters` * | space | `?box=inbox|sent|upcoming` | 200 `LetterListItem[]` — inbox: хүргэгдсэн; upcoming (хүлээн авагчид): `LetterTeaser {id, deliverAt?, occasionLabel?}` агуулгагүй | — | AC-43, AC-113, AC-182 |
| `POST /letters` * | space | `LetterInput {template, body ≤ 20000, mediaIds[] ≤ 5, deliverAt? (null=шууд), occasionLabel?, draft: bool}` | 201 `Letter` | 400 `MEDIA_LIMIT_EXCEEDED` | AC-111, AC-44 |
| `GET /letters/{letterId}` * | space | — | 200 `Letter` (зохиогч эсвэл хүргэгдсэн бол хүлээн авагч) / 404 (хүргэгдээгүй, хүлээн авагч) | 404 | AC-43 |
| `PATCH /letters/{letterId}` · `DELETE` * | space | `LetterInput + version` | 200 / 204 (цуцлах) | 403, 409 `LETTER_ALREADY_DELIVERED` | AC-112 |
| `POST /letters/{letterId}/read` * | space | — | 200 `Letter` (зохиогчид WS) | — | AC-182 |
| `GET /capsules` · `POST /capsules` * | space | `CapsuleCreate {title, openOn}` | 200 `CapsuleSummary[]` / 201 `Capsule` | — | AC-45 |
| `GET /capsules/{capsuleId}` * | space | — | 200 `Capsule {id, title, openOn, status, parts: {author, sealed, body? (OPENED үед л)}[]}` | — | AC-45 |
| `PUT /capsules/{capsuleId}/my-part` * | space | `CapsulePartInput {body, mediaIds[]}` | 200 `Capsule` | 409 `CAPSULE_SEALED` | AC-45 |
| `POST /capsules/{capsuleId}/seal` * | space | — | 200 `Capsule` | 409 | AC-45 |
| `GET /checkins` | space | `?from&to` | 200 `CheckInSeries {mine: CheckIn[], partner: CheckIn[] (shared=true л)}` | — | AC-46, AC-115 |
| `PUT /checkins/today` | space | `CheckInInput {level 1–5, note? ≤ 280, shared?}` (`shared` хоосон бол `checkinAutoShare`) | 200 `CheckIn {localDate, level, note?, shared}` | — | AC-114, AC-183 |
| `PATCH /checkins/{localDate}` | space | `CheckInInput` | 200 / 403 `CHECKIN_PAST_DAY` | 403 | AC-114 |
| `GET /stats` | space | — | 200 `Stats {memories, photos, videos, dates, goalsCompleted, letters, daysTogether, heartsSent, cities, countries, distanceKm}` | — | AC-117, AC-47 |
| `GET /year-in-review/{year}` | space | — | 200 `YearInReview {year, totals, topMonth, topPlace, topMemories[], slides: RecapSlide[] (6–10)}` | 404 | AC-118 |

**Мэдэгдэл, push, passkey, админ**

| Method · Path | Scope | Оролт | Гаралт | Алдаа | AC |
|---|---|---|---|---|---|
| `GET /notifications` | user | cursor | 200 `NotificationPage {items: Notification[] {id, type, title, body, deepLink, createdAt, readAt?}, unreadCount}` | — | AC-120 |
| `POST /notifications/{notificationId}/read` · `POST /notifications/read-all` | user | — | 204 | — | AC-120 |
| `GET /notification-settings` · `PUT` | user | `NotificationSettings {disabledTypes[], dndStart, dndEnd, hideContent, greetingMorning, greetingEvening, greetingMorningAt, greetingEveningAt}` | 200 | — | AC-48, AC-49, AC-119, AC-121, AC-184 |
| `PUT /me/quiet-mode` · `DELETE` | user | `QuietModeRequest {durationMinutes 60–10080}` | 200 `{quietUntil}` / 204 | — | AC-123 |
| `GET /push/vapid-public-key` | user | — | 200 `{publicKey}` / 204 (тохиргоо хоосон) | — | AC-154 |
| `POST /push-subscriptions` | user | `PushSubscriptionInput {kind: WEB|EXPO, endpoint?, keys? {p256dh, auth}, expoToken?, localReminders}` | 201 `{id}` | — | AC-154 |
| `DELETE /push-subscriptions/{subscriptionId}` | user | — | 204 | — | AC-154 |
| `GET /reminders` | user | `?from&to` | 200 `Reminder[] {id, sourceType, sourceId, fireAt, title, deepLink}` (native локал товлолтод) | — | AC-35, AC-104, AC-180 |
| `POST /passkeys/registration-options` · `POST /passkeys` | user | — / `PasskeyRegistration {credential (WebAuthn JSON)}` | 200 `PublicKeyCredentialCreationOptions` / 201 | 400 `PASSKEY_INVALID` | AC-157 |
| `POST /passkeys/assertion-options` · `POST /passkeys/assertion` | user | — / `PasskeyAssertion {credential}` | 200 options / 200 `{verified: true}` | 400 `PASSKEY_INVALID` | AC-157 |
| `DELETE /passkeys/{credentialId}` | user | — | 204 | — | AC-157 |
| `GET /admin/metrics` | admin | `?from&to` | 200 `AdminMetrics {pairingSuccessRate, firstWeek3MemoriesRate, weeklyActiveAfter30d, dailyAvg {opens, messages, memories, hearts}, survey {count, average, distribution}}` | 403 `ADMIN_ONLY` | AC-206 |
| `POST /admin/users/{userId}/suspend` · `/unsuspend` | admin | `SuspendRequest {reason}` | 204 | 403 | AC-186 |

**TestSupport · `e2e` profile (`x-aura-scope: test`, prod-д 404)**

| Method · Path | Оролт | Гаралт | AC |
|---|---|---|---|
| `PUT /test/clock` · `DELETE /test/clock` | `{now: date-time}` | 204 | INV-10, AC-23, AC-44, AC-92 |
| `POST /test/seed` | `{scenario: COUPLE_BASIC|DASHBOARD_FULL|MEMORIES_10K|MILESTONE_1000|…, params}` | 200 `SeedResult {users[], spaceIds[], ids{}}` | AC-25, AC-39, AC-72, AC-117 |
| `POST /test/jobs/{jobName}/run` | — | 200 `{processed}` | AC-44, AC-54, AC-84 |
| `POST /test/push-sink` · `GET /test/push-sink/{sinkId}/messages` · `POST /test/push-sink/{sinkId}/respond` · `POST /test/push-sink/{sinkId}/receive` | `{status}` | 201 `{sinkId, endpoint}` / 200 `PushSinkMessage[]` | AC-154 |
| `GET /test/mail/last` | `?to` (IT-д Mailpit-ийн оронд) | 200 `{subject, code?, link?}` | AC-01 |

Нийт: 224 operation, 177 path — `contracts/openapi.yaml`-тай нэг бүрчлэн тулгагдсан (scope: public 15 · user 47 · space 150 · admin 3 · test 9).

### 4.2 Realtime үйл явдлууд (`contracts/asyncapi.yaml`)

Холболт: `ws(s)://<host>/ws`, STOMP 1.2, CONNECT header `Authorization: Bearer <access>`; access дуусахад client шинэ токеноор дахин холбогдоно. Heartbeat 10 с/10 с.

| Чиглэл | Destination | Мессеж | Хэн хүлээн авна | AC |
|---|---|---|---|---|
| сервер → client | `/user/queue/events` | `RealtimeEnvelope {id, type, occurredAt, actorId, payload}` | Тухайн хэрэглэгч (хамтрагч ба өөрийн бусад төхөөрөмж) | AC-17, AC-27, AC-31 |
| client → сервер | `/app/typing` | `TypingSignal {typing: bool}` | Хамтрагч (`typing_visible` хоёулаа true үед л, INV-06) | AC-177 |
| client → сервер | `/app/presence` | `PresencePing {state: FOREGROUND|BACKGROUND}` | Хамтрагч (`online_visible` хоёулаа true үед л) | AC-70 |
| client → сервер | `/app/chat.delivered` | `DeliveredAck {upToMessageId}` | Илгээгч (`chat.receipt`) | AC-176 |

`type`-ийн жагсаалт ба mobile-ийн хариу үйлдэл:

| `type` | payload | Mobile (TanStack кэш / UI) |
|---|---|---|
| `signal.received` | `{signalId, kind, text?}` | ANIM-02 / тэврэлт / ANIM-03; `['dashboard']` invalidate |
| `chat.message.created` · `.updated` · `.deleted` | `Message` / `{messageId}` | `['messages']` infinite-д оруулах/солих; хүргэгдсэн ack илгээх |
| `chat.receipt` | `{upToMessageId, status: DELIVERED|READ, at}` | Өөрийн мессежийн төлөв |
| `chat.typing` | `{typing}` | ANIM-08 |
| `chat.pinned` · `chat.reaction` · `chat.expired` | `{messageId, …}` | `['messages']`, `['messages','pinned']` |
| `presence.changed` | `{online: bool, lastActiveAt?}` | Хамтрагчийн карт |
| `profile.updated` · `couple.updated` | `PartnerCard` / `Couple` | `['me']`, `['couple']`, `['dashboard']`; сэдэв солигдоход палитр (AC-138) |
| `couple.linked` · `pairing.requested` · `pairing.cancelled` | `{coupleId}` / `Pairing` | S-12 ANIM-14 / S-10 |
| `memory.created` · `.updated` · `.deleted` · `memory.comment` · `memory.reaction` | `MemorySummary` / `{memoryId}` | `['memories']`, `['memory', id]` |
| `plan.updated` · `checklist.updated` · `deck.matched` | `DatePlanSummary` / `ChecklistItem` / `DeckMatch` | `['plans']`, `['plan', id]`; ANIM-18 |
| `list.updated` · `goal.updated` | `ListItem` / `Goal` | `['list', kind]`, `['goal', id]`; ANIM-20 |
| `letter.delivered` · `letter.read` · `capsule.opened` | `LetterTeaser` / `{letterId}` / `{capsuleId}` | `['letters']`; S-67 / ANIM-21 |
| `question.revealed` | `{coupleDay}` | `['question','today']` → ANIM-19 |
| `checkin.shared` | `{localDate}` | `['checkins']` |
| `notification.created` | `{id, type, title, deepLink}` | `['notifications']`, хонхны тоо |
| `promise.updated` | `SharedPromise` | `['promise']` |
| `quiet.changed` | `{userId, quietUntil?}` | «🌙 түр тайван байна» тэмдэг (AC-123) |
| `session.revoked` | `{sessionId}` | Токен устгаж S-03 (AC-56) |

### 4.3 Mobile — Expo Router мод ба дэлгэц (TQ-08)

Үндэс `mobile/src/app/` (template-ийн бүтэц, DD-AURA-035). Нэг дэлгэц = нэг файл; табын дэлгэц `(tabs)/<таб>/` stack дотор. «Төлөв» багана: А — ачаалж буй (skeleton, ANIM-16), Х — хоосон (маскот + өгүүлбэр + товч, ANIM-11), Ал — алдаа + «Дахин оролдох», О — offline (кэш + S-95), З — зөвшөөрөл татгалзсан. «—» = хамаарахгүй (AC-213). Дуурайлт — `lld.html` ①.

| S-ID | Route файл (`mobile/src/app/…`) | Төлөв | Гол компонент / query |
|---|---|---|---|
| S-01 | `_layout.tsx` (`SplashGate`) | А · — · Ал (S-96) · О · — | `useBootstrap()` → `['version']`, `['me']` |
| S-02 | `(onboarding)/intro.tsx` | — · — · — · — · — | `IntroCarousel`, `Mascot` |
| S-03 | `(auth)/login.tsx` | — · — · Ал · О (товч идэвхгүй) · — | `useLogin`, `GoogleButton`, `AppleButton` (`enabled=false`) |
| S-04 | `(auth)/register.tsx` | — · — · Ал · О · — | `PasswordStrength`, `BirthDateField`, `PolicyCheckbox` |
| S-05 | `(auth)/verify-email.tsx` | — · — · Ал · О · — | `CodeInput` (6), `ResendTimer` (60 с) |
| S-06 | `(auth)/forgot-password.tsx`, `(auth)/reset-password.tsx` | — · — · Ал · О · — | `?token` |
| S-07 | `(setup)/profile.tsx` | — · — · Ал · О · З (камер/зураг) | `CityPicker` (`/geo/cities`), `AvatarCropper` |
| S-08 | `(setup)/invite-create.tsx` | А · — · Ал · О · — | `['invite']`, `InviteQr`, Web Share |
| S-09 | `(setup)/invite-enter.tsx` | — · — · Ал · О · З (камер → гараар) | `QrScanner` (`expo-camera`), `?code` |
| S-10 | `(setup)/join-confirm.tsx` | А · — · Ал · О · — | `['pairing']` |
| S-11 | `(setup)/start-date.tsx` | А · — · Ал · О · — | `['couple']` зөрүүний харагдац |
| S-12 | `(setup)/linked.tsx` | — · — · — · — · — | ANIM-14, solo-share асуулт |
| S-13 | `(setup)/waiting.tsx` | А · Х · Ал · О · — | Ганцаараа үйлдлүүд |
| S-14 | `lock.tsx` (`fullScreenModal`) | — · — · Ал (түгжээ) · — · З (биометр → PIN) | `AppLockProvider` |
| S-20 | `(tabs)/home/index.tsx` | А · Х (хэсэг тутам) · Ал · О · З (байршил → хот) | `['dashboard']`, `HeartButton`, `CounterOdometer` |
| S-21 | `(tabs)/home/counter.tsx` (`formSheet`) | — · — · — · О · — | `breakdown` |
| S-22 | `(tabs)/home/question.tsx` | А · — · Ал · О · — | `['question','today']`, `['question','history']` |
| S-23 | `(tabs)/home/on-this-day.tsx` | А · Х · Ал · О · — | `['memories','on-this-day']` |
| S-24 | `notifications.tsx` | А · Х · Ал · О · З (мэдэгдэл → S-101) | `['notifications']` |
| S-25 | `celebration.tsx` (`fullScreenModal`) | — · — · — · — · — | ANIM-05, `['celebrations']` |
| S-26 | `(tabs)/home/thinking.tsx` (`formSheet`) | — · — · Ал · О (outbox) · — | `≤ 80` тоолуур |
| S-30 | `(tabs)/memories/index.tsx` (`?view=timeline|map|recap&scope`) | А · Х · Ал · О · — | `['memories', filters]` infinite, `['memory-months']` |
| S-31 | `(tabs)/memories/[id].tsx` | А · — · Ал · О · — | `['memory', id]` |
| S-32 | `memory-editor.tsx` (`modal`, `?id&draft`) | — · — · Ал · О (outbox) · З (камер, зураг, байршил, микрофон) | `uploadQueue`, `ExifSuggestion` |
| S-33 | `media/[id].tsx` (`fullScreenModal`) | А · — · Ал · О · З (хадгалах) | `expo-image`, `expo-video` |
| S-34 | `(tabs)/memories/search.tsx` | А · Х · Ал · О (идэвхгүй) · — | `['memories', filters]` |
| S-35 | `(tabs)/memories/groups/index.tsx`, `groups/[id].tsx` | А · Х · Ал · О · — | `['memory-groups']`, `['memory-group', id]` |
| S-36 | `(tabs)/memories/favorites.tsx` | А · Х · Ал · О · — | `favorite=true` |
| S-37 | `(tabs)/memories/trash.tsx` | А · Х · Ал · О · — | `['trash']` |
| S-38 | `recap/[id].tsx` (`fullScreenModal`) | А · — · Ал · О · — | ANIM-22 |
| S-39 | `(tabs)/memories/export.tsx` | А · — · Ал · О (идэвхгүй) · — | `['exports']` |
| S-40 | `(tabs)/chat/index.tsx` | А · Х · Ал · О (outbox) · З (зураг, микрофон, байршил) | `['messages']` infinite, STOMP |
| S-41 | `(tabs)/chat/message-menu.tsx` (`formSheet`, `?id`) | — · — · Ал · О · — | Реакц ANIM-07 |
| S-42 | `(tabs)/chat/pins.tsx` | А · Х · Ал · О · — | `['messages','pinned']` |
| S-43 | `(tabs)/chat/search.tsx` | А · Х · Ал · О (идэвхгүй) · — | `['messages','search', q]` |
| S-44 | `(tabs)/chat/media.tsx` | А · Х · Ал · О · — | `['messages','media', kind]` |
| S-45 | `(tabs)/chat/index.tsx` доторх `VoiceRecorderOverlay` | — · — · Ал · — · З (микрофон) | ANIM-23 |
| S-46 | `(tabs)/chat/disappearing.tsx` (`formSheet`) | — · — · Ал · О · — | GAP-12 бичвэр |
| S-47 | `(tabs)/chat/promise.tsx` (`formSheet`) | А · Х · Ал · О · — | `['promise']` |
| S-50 | `(tabs)/plans/index.tsx` | А · Х · Ал · О · — | `['plans','upcoming']`, `['anniversaries']` |
| S-51 | `(tabs)/plans/ideas.tsx` | А · Х · Ал · О · — | `['ideas', filters]` |
| S-52 | `(tabs)/plans/calendar.tsx` (`?mode=month|week`) | А · Х · Ал · О · — | `['plans', range]` |
| S-53 | `(tabs)/plans/idea-editor.tsx` (`?id&draft`) | — · — · Ал · О (outbox) · — | Форм |
| S-54 | `(tabs)/plans/[id].tsx`, `(tabs)/plans/new.tsx` | А · — · Ал · О · З (календарь → .ics, байршил) | `['plan', id]`, `addToCalendar` |
| S-55 | `(tabs)/plans/[id]/counter.tsx` (`formSheet`) | — · — · Ал · О (идэвхгүй) · — | 1–3 цаг |
| S-56 | `(tabs)/plans/random.tsx` | А · Х (тохирох алга) · Ал · О · — | ANIM-17 |
| S-57 | `(tabs)/plans/deck.tsx` | А · Х · Ал · О (идэвхгүй) · — | ANIM-18 |
| S-58 | `(tabs)/plans/library.tsx` | А · Х · Ал · О · — | `['idea-library', filters]` |
| S-59 | `(tabs)/plans/budget.tsx` (`?month`) | А · Х · Ал · О · — | `['budget', month]` |
| S-60 | `(tabs)/together/index.tsx` | А · Х (карт тутам) · Ал · О · — | Хаб |
| S-61 | `(tabs)/together/occasions/index.tsx`, `occasions/[key].tsx` | А · Х · Ал · О · — | `['anniversaries']`, `['occasion', key]`, `['gift-ideas', key]` |
| S-62 | `(tabs)/together/occasions/edit.tsx` (`?id`) | — · — · Ал · О · — | Форм |
| S-63 | `(tabs)/together/lists.tsx` (`?kind`) | А · Х · Ал · О (outbox) · — | `['list', kind]`, drag эрэмбэ |
| S-64 | `(tabs)/together/goals/index.tsx`, `goals/[id].tsx` | А · Х · Ал · О · — | ANIM-20 |
| S-65 | `(tabs)/together/letters/index.tsx` (`?box`) | А · Х · Ал · О · — | `['letters', box]` |
| S-66 | `(tabs)/together/letters/compose.tsx` (`?id`) | — · — · Ал · О (ноорог) · З (зураг) | `draftStore` |
| S-67 | `(tabs)/together/letters/[id].tsx` | А · — · Ал · О · — | ANIM-06 |
| S-68 | `(tabs)/together/capsules/[id].tsx`, `capsules/new.tsx` | А · Х · Ал · О · — | ANIM-21 |
| S-69 | `(tabs)/together/checkin.tsx` | А · Х · Ал · О (outbox) · — | ANIM-15, `MoodChart` |
| S-70 | `(tabs)/together/map.tsx` | А · Х · Ал · О (tile кэш) · — | `MapView` (Leaflet) |
| S-71 | `(tabs)/together/stats.tsx` | А · — · Ал · О · — | `['stats']` |
| S-72 | `year/[year].tsx` (`fullScreenModal`) | А · Х · Ал · О · З (зураг хадгалах) | ANIM-22, `captureRef` / canvas |
| S-80 | `settings/index.tsx` | — · — · — · О · — | Жагсаалт |
| S-81 | `settings/profile.tsx` | А · — · Ал · О · З (зураг) | `AvatarCropper` |
| S-82 | `settings/couple.tsx` | А · — · Ал · О · — | Хоч, сэдэв, маскотын өнгө |
| S-83 | `settings/notifications.tsx` | А · — · Ал · О · З (мэдэгдэл → S-101) | `['notification-settings']` |
| S-84 | `settings/security.tsx` | А · — · Ал · О · З (биометр) | `['sessions']`, түгжээ |
| S-85 | `settings/data.tsx` | А · — · Ал · О · — | `['storage']`, `['exports']` |
| S-86 | `settings/breakup.tsx` | А · — · Ал · О (идэвхгүй) · — | 3 алхам |
| S-87 | `settings/delete-account.tsx` | — · — · Ал · О (идэвхгүй) · — | Баталгаажуулалт |
| S-88 | `settings/appearance.tsx` | — · — · — · — · — | Хэл, theme, формат, анимаци, haptic, дуу |
| S-89 | `settings/licenses.tsx` | — · — · — · — · — | `docs/ASSETS.md`-ээс үүссэн `licenses.json` |
| S-90 | `settings/policies.tsx` (+ `(auth)/policy-update.tsx` хаалга) | А · — · Ал · О · — | `['policies']` |
| S-91 | `settings/about.tsx` | А · — · — · О · — | `['version']` |
| S-95 | `src/components/OfflineBanner.tsx` (`_layout.tsx`-д) | — | `useNetworkStatus` |
| S-96 | `src/components/ServerUnreachable.tsx` (`ScreenState` error) | — | «Дахин оролдох» |
| S-97 | `update-required.tsx` | — | `updateRequired` |
| S-98 | `storage-full.tsx` (`formSheet`) | А · — · Ал · — · — | `['storage']` |
| S-99 | `deploy/dev/download/index.html` (апп-аас гадуур, T-89) | — | APK QR, `exp://` QR, PWA хаяг |
| S-100 | `install.tsx` (вэбэд л) | — | `useInstallPrompt` |
| S-101 | `push-permission.tsx` (`formSheet`) | — · — · Ал · — · З | `subscribePush` |
| S-102 | `settings/passkey.tsx` | — · — · Ал · О · З (passkey → PIN) | `/passkeys/**` |

Нэмэлт route (S-ID-гүй): `index.tsx` (gate), `+html.tsx`, `+not-found.tsx`, `(auth)/oauth-callback.tsx`, `(auth)/not-me.tsx`, `(setup)/solo-share.tsx` (FR-2.5, S-12-ийн дараа). Табын `_layout.tsx` — `(tabs)/_layout.tsx` (ANIM-10), табын stack бүрд `_layout.tsx`.

`src/` (route биш): `api/` (`schema.d.ts`, `client.ts`, `queries/*.ts`), `realtime/` (`stompClient.ts`, `eventRouter.ts`), `offline/` (`outbox.ts`, `persist.ts`), `upload/uploadQueue.ts`, `theme/`, `i18n/`, `motion/`, `components/`, `domain/` (`dates.ts`, `geo.ts`, `budget.ts`), `pwa/` (`registerSW.ts`, `useInstallPrompt.ts`, `subscribePush.ts`), `content/*.json`, `stores/`.

### 4.4 Mobile — төлөв, токен, төрөл үүсгэх

| Зүйл | Шийдэл |
|---|---|
| Серверийн төлөв | TanStack Query v5. Key: `['me']`, `['couple']`, `['dashboard']`, `['question','today']`, `['question','history']`, `['memories', filters]`, `['memory-months', scope]`, `['memory', id]`, `['memory', id, 'comments']`, `['memories','on-this-day']`, `['memory-groups']`, `['memory-group', id]`, `['trash']`, `['recaps']`, `['recap', id]`, `['exports']`, `['storage']`, `['messages']`, `['messages','pinned']`, `['messages','search', q]`, `['messages','media', kind]`, `['promise']`, `['ideas', filters]`, `['idea-library', filters]`, `['plans', range|view]`, `['plan', id, occurrenceOn]`, `['budget', month]`, `['deck']`, `['deck','matches']`, `['anniversaries']`, `['occasion', key]`, `['gift-ideas', key]`, `['list', kind]`, `['goals']`, `['goal', id]`, `['letters', box]`, `['letter', id]`, `['capsules']`, `['capsule', id]`, `['checkins', range]`, `['places']`, `['stats']`, `['year-review', year]`, `['notifications']`, `['notification-settings']`, `['sessions']`, `['version']`, `['policies']`, `['celebrations']`, `['first-week']`, `['invite']`, `['pairing']`, `['reminders']` |
| Persist кэш | `@tanstack/query-async-storage-persister` (native AsyncStorage, вэб IndexedDB `idb-keyval`), `maxAge` 7 хоног; persist хийх key: `me`, `couple`, `dashboard`, `messages`, `memories`, `plans`, `notifications` (AC-156). Нууц үг, токен persist-д орохгүй |
| Локал төлөв (Zustand) | `sessionStore` (access token санах ойд, userId), `prefsStore` (theme, locale, dateFormat, animation, haptics, sound — серверийн `Preferences`-тэй синк), `lockStore` (PIN hash, timeout, failedCount, lockedUntil, backgroundedAt), `draftStore` (дурсамж, захидал, мессежийн ноорог — persist, AC-191), `installPromptStore` (dismissedAt — AC-153), `timezonePromptStore` (асуусан бүс — AC-64) |
| Токен | Native: refresh `expo-secure-store` (`aura.refresh`), access санах ойд. Web: refresh HttpOnly cookie (DD-AURA-006), `fetch(..., {credentials: 'include'})`. `client.ts` 401 `TOKEN_EXPIRED` үед нэг удаа `/auth/refresh` (зэрэг хүсэлтүүд нэг promise хүлээнэ) → дахин; `AUTH_SESSION_REVOKED` → `sessionStore.clear()` → S-03 (AC-168, AC-56) |
| Outbox | DD-AURA-017; дараалалд орох үйлдэл: мессеж, зүрх, сэтгэгдэл, check-in, жагсаалтын зүйл, дурсамж (upload queue-тэй), санаа, «Чамайг бодож байна». Offline үед идэвхгүй товч: нэвтрэх, бүртгэл, урилга батлах, экспорт, хайлт, хос тасалах (spec §8) |
| Гэрээний төрөл | `cd mobile && npm run gen:api` = `openapi-typescript ../contracts/openapi.yaml -o src/api/schema.d.ts`; `client.ts` = `openapi-fetch` (`createClient<paths>`). Realtime: `src/realtime/events.ts` — union төрөл; `realtime-contract.test.ts` нь `contracts/asyncapi.yaml`-ийн `type` enum-тай тулгана |
| Backend талын үүсгэл | `cd backend && ./mvnw generate-sources` — `openapi-generator-maven-plugin` (`inputSpec=${project.basedir}/../contracts/openapi.yaml`, `apiPackage=mn.aura.couple.api`, `modelPackage=mn.aura.couple.api.model`) |

### 4.5 Ажиллуулах орчин

**Compose (DEV, `docker-compose.yml`)** — `docker compose up -d --build`:

| Үйлчилгээ | Image / build | Порт | Healthcheck | Тэмдэглэл |
|---|---|---|---|---|
| `postgres` | `postgres:16-alpine` | дотоод 5432 | `pg_isready` | Одоогийнх; `pg_trgm`, `citext`-ийг Flyway `V1` үүсгэнэ |
| `seaweedfs` | `chrislusf/seaweedfs:3.97` `server -s3 -s3.config=/etc/seaweedfs/s3.json -dir=/data` | `${S3_HOST_PORT:-8333}:8333` | `wget -qO- http://127.0.0.1:9333/cluster/status` | `deploy/dev/seaweedfs-s3.json` — identity `aura` (S3_ACCESS_KEY/S3_SECRET_KEY), bucket `aura-media` backend эхлэхэд үүснэ |
| `mailpit` | `axllent/mailpit:v1.27` | `1025` (SMTP), `${MAILPIT_UI_PORT:-8025}:8025` | `wget -qO- http://127.0.0.1:8025/readyz` | — |
| `backend` | root `Dockerfile` (context `.`) | `${HOST_PORT:-8080}:8080` | `wget -qO- http://127.0.0.1:8080/actuator/health \| grep -q UP` | depends_on 3 үйлчилгээ healthy; `SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-dev}` (E2E-д `dev,e2e`) |
| `mobile-web` | `mobile/Dockerfile` (`expo export` + `workbox injectManifest` → nginx) | `${MOBILE_HOST_PORT:-8090}:80` | `/healthz` | nginx `try_files $uri /index.html`; `sw.js`-д `Cache-Control: no-cache` |
| `expo-dev` (profile `devbuild`, T-89) | `node:22` + Android SDK (`reactnativecommunity/react-native-android`) | `8081` (Metro), `${DOWNLOAD_PORT:-8099}:80` (S-99) | — | `node_modules` anonymous volume |

**Root `Dockerfile` (backend, T-32):** build `maven:3.9-eclipse-temurin-21` (context = репо — `contracts/`, `mobile/src/content/`-ийг хэрэглэнэ) → runtime `eclipse-temurin:21-jre-jammy` + `apt-get install ffmpeg fontconfig`, `backend/src/main/resources/fonts/*.ttf`. Хоёр image linux/amd64 ба linux/arm64 (AC-161).

**Backend орчны хувьсагч** (`.env.example`-д placeholder, PAR — гадны эзэнтэй):

| Хувьсагч | Утга / анхдагч | Танигч |
|---|---|---|
| `SPRING_DATASOURCE_URL`, `_USERNAME`, `_PASSWORD` | `jdbc:postgresql://postgres:5432/aura` | — |
| `AURA_JWT_SECRET` | ≥ 32 байт, DEV-д `.env` | PAR-AURA-001 |
| `AURA_S3_ENDPOINT`, `AURA_S3_REGION`, `AURA_S3_BUCKET`, `AURA_S3_ACCESS_KEY`, `AURA_S3_SECRET_KEY`, `AURA_S3_PATH_STYLE=true`, `AURA_S3_PUBLIC_ENDPOINT` (presigned URL-ийн хост — утас хүрэх хаяг) | DEV `http://seaweedfs:8333`, public `http://<LAN_IP>:8333` | PAR-AURA-002 |
| `SPRING_MAIL_HOST`, `_PORT`, `_USERNAME`, `_PASSWORD`, `AURA_MAIL_FROM` | DEV `mailpit:1025` | PAR-AURA-003 (GAP-09) |
| `AURA_VAPID_PUBLIC_KEY`, `AURA_VAPID_PRIVATE_KEY`, `AURA_VAPID_SUBJECT` | хоосон → Web Push алгасна | PAR-AURA-004 |
| `AURA_GOOGLE_CLIENT_ID`, `AURA_GOOGLE_CLIENT_SECRET`, `AURA_OAUTH_REDIRECT_BASE` | хоосон → Google товч нуугдана | PAR-AURA-005 (GAP-18) |
| `AURA_EXPO_PUSH_ACCESS_TOKEN` | хоосон → алгасна | PAR-AURA-006 (GAP-01) |
| `AURA_ADMIN_EMAILS` | таслалаар | PAR-AURA-007 (GAP-16) |
| `AURA_CORS_ALLOWED_ORIGINS` | DEV `http://localhost:8090,http://<LAN_IP>:8090` | — |
| `AURA_COOKIE_SECURE` | DEV `false`, prod `true` | — |
| `AURA_STORAGE_QUOTA_BYTES` | `10737418240` | PAR-AURA-008 |
| `AURA_SENTRY_DSN` | хоосон | PAR-AURA-009 |
| `AURA_WEATHER_BASE_URL`, `AURA_GEOCODING_BASE_URL`, `AURA_MAP_TILE_URL` | Open-Meteo, OSM; E2E-д mock | PAR-AURA-010 (GAP-07) |
| `AURA_APP_LATEST_VERSION`, `AURA_APP_MIN_VERSION`, `AURA_DOWNLOAD_URL` | `version.json`-ийн эх | — |
| `AURA_POLICY_VERSION` | `2026-11-07` | — |

Mobile build хувьсагч: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_APP_VERSION`, `EXPO_PUBLIC_BUILD`, `EXPO_PUBLIC_COMMIT_SHA` — нууц 0 (AC-195).

**Prod (T-90):** `deploy/docker-compose.prod.yml` — `caddy:2` (80/443, Let's Encrypt, `/api/*` ба `/ws` → backend, бусад → mobile-web), `backend`, `postgres`, `seaweedfs`, `mobile-web`; mailpit-гүй. Ажиллагааны багт шилжих: OPS-AURA-001 Oracle iptables 80/443 нээх, OPS-AURA-002 DuckDNS cron, OPS-AURA-003 VAPID түлхүүр deploy үед үүсгэх, OPS-AURA-004 шөнийн `pg_dump` + долоо хоногийн сэргээх тест, OPS-AURA-005 сэрэмжлүүлгийн дүрэм (5xx > 1%/5 мин, p95 > 1 с, диск > 80%, backup амжилтгүй), OPS-AURA-006 лог 30 хоног (`json-file` `max-size`/`max-file`). Тайлбар `docs/OPERATIONS.md`, `deploy/oracle/README.md`-д танигчаараа.

**Health:** `GET /actuator/health` (liveness/readiness), `GET /actuator/prometheus` — гэрээнд ороогүй (Actuator-ийн стандарт), CORS-гүй, prod-д Caddy гаднаас хаана.

**Шалгах команд:** `cd backend && ./mvnw verify` · `cd mobile && npx tsc --noEmit && npx expo lint && npx jest && npx expo export --platform web` · `cd e2e && npx playwright test` · гэрээ: `npx @redocly/cli lint contracts/openapi.yaml`, `npx @asyncapi/cli validate contracts/asyncapi.yaml`.

### 4.6 Нэгжийн хүснэгт (PLAN T-01…T-94)

Энэ хэсэг: нэгж бүрийг кодонд юугаар хайж олох, аль тест батлах вэ? «grep нэр» нь `tasks.md`-ийн зангуу (DEC-AURA-006); өөрчилсөн нэр **тодоор**. Тестийн зам: backend `backend/src/test/java/mn/aura/couple/<багц>/…`, mobile `mobile/src/**/__tests__/…`, E2E `e2e/tests/…`. Тестийн нэр AC ID-тай (`@DisplayName("AC-17 …")`, `test('AC-17 …')`).

| Нэгж | grep нэр | Батлах тест |
|---|---|---|
| T-01 | `seaweedfs:`, `mailpit:` (`docker-compose.yml`), `deploy/dev/seaweedfs-s3.json`, `.env.example` | `ComposeHealthIT` (AC-209), `e2e/tests/infra.spec.ts` |
| T-02 | `ApiErrorHandler`, `TimeProvider`, `TestSupportController`, `AbstractIntegrationTest`, `V1__baseline.sql`, **`SpaceAccessGuard`**, **`CorsConfig`** | `TestSupportAbsentIT`, `ApiErrorHandlerTest`, `CorsIT` |
| T-03 | `logback-spring.xml`, `LogRedaction`, `ErrorReporter` | `LogRedactionIT` (AC-196), `ErrorReporterIT` (AC-201), `ActuatorIT` (AC-202) |
| T-04 | `MediaStorageService`, `MediaInspector`, `ImageProcessor`, `StorageQuota` | `MediaInspectorTest` (AC-129), `ImageProcessorIT` (AC-21, AC-172), `StorageQuotaIT` (AC-200), `SignedUrlIT` (AC-195) |
| T-05 | `src/theme/tokens.ts`, `ThemeProvider` | `contrast.test.ts` (AC-DS-01), `no-hex.test.ts` (AC-DS-02, AC-144), `e2e/tests/theme.spec.ts` (AC-DS-03) |
| T-06 | `src/theme/typography.ts` | `font-cmap.test.ts` (AC-DS-04), `e2e/tests/large-text.spec.ts` (AC-DS-05) |
| T-07 | `src/i18n/`, `useT`, `formatDate`, `formatNumber`, `calendarDate.ts` | `i18n-parity.test.ts` (AC-135), `no-raw-strings.test.ts`, `formatDate.test.ts` (AC-139, AC-199), `calendarDate.test.ts` (AC-132) |
| T-08 | `useMotionPreference`, `haptics.ts` (`ANIM_HAPTICS`), `SizedLottie`, `ParticleBurst`, `Confetti`, `CelebrationOverlay`, **`AnimatedMoment`** | `motion-off.test.tsx` (AC-MO-03), `haptics.test.ts` (AC-MO-04, AC-215, AC-217), `e2e/tests/lottie-size.spec.ts` (AC-MO-05) |
| T-09 | `scripts/fetch-assets.mjs`, `Mascot`, `docs/ASSETS.md` | `assets-registry.test.ts` (AC-AS-01, AC-217) |
| T-10 | `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `useWideLayout`, `ScreenState`, `ServerUnreachable` | `e2e/tests/layout.spec.ts` (AC-192), `e2e/tests/screen-states.spec.ts` (AC-213) |
| T-11 | `src/api/client.ts`, `src/api/schema.d.ts`, `src/offline/outbox.ts`, `src/offline/persist.ts` | `client-refresh.test.ts` (AC-168), `outbox.test.ts` (AC-28), `api-schema-fresh.test.ts`, `e2e/tests/offline.spec.ts` (AC-156) |
| T-12 | `content.schema.json`, `stoplist.mn.txt`, `stoplist.en.txt`, `questions.json` | `content.test.ts` (AC-145…147) |
| T-13 | `date-ideas.json` | `content.test.ts` (AC-145…147) |
| T-14 | `notifications.json`, `greetings.json`, `empty-states.json`, `first-week.json`, `onboarding.json`, `errors.json` | `content.test.ts`, `error-codes-coverage.test.ts` (ApiError `code` enum бүрд мессеж) |
| T-15 | `policy-guards.test.ts`, `isExpoGo` | `policy-guards.test.ts` (AC-208, AC-193, AC-194, AC-212, AC-216, AC-AS-03), `ArchitectureTest` (DD-AURA-001) |
| T-16 | `e2e/playwright.config.ts`, `twoPartners`, `mailpit.ts`, `seed.ts`, `clock.ts`, `mocks/openMeteo.ts`, `mocks/oauthIdp.ts` | `e2e/tests/infra.spec.ts`, `ac-coverage.spec.ts` (AC-211) |
| T-17 | `RegistrationService`, `PasswordPolicy`, `EmailVerificationService`, `MailSender` | `RegistrationIT` (AC-02, AC-04, AC-63, AC-164), `EmailVerificationIT` (AC-01, AC-165) |
| T-18 | `JwtService`, `RefreshTokenService`, `LoginRateLimiter`, `DeviceSession` | `RefreshTokenIT` (AC-07, AC-168), `LoginRateLimitIT` (AC-05), `PasswordHashTest` (AC-195) |
| T-19 | `PasswordResetService`, `EmailChangeService` | `PasswordResetIT` (AC-03, AC-166), `EmailChangeIT` (AC-136, AC-189) |
| T-20 | `GoogleOAuthController`, `AppleOAuth`, `OAuthAccountLinker` | `GoogleOAuthIT` (AC-06, AC-167), `e2e/tests/oauth.spec.ts` |
| T-21 | `src/app/(auth)/*.tsx`, `SplashGate`, `TimezonePrompt`, `src/auth/tokenStore.ts` | `e2e/tests/auth.spec.ts` (AC-01, AC-04, AC-63, AC-164), `timezonePrompt.test.ts` (AC-64) |
| T-22 | `InviteService`, `CoupleService`, `InviteCodeGenerator` | `InviteIT` (AC-08, AC-09, AC-165, AC-171), `PairingIT` (AC-10, AC-66, AC-170), `InviteCodeGeneratorTest` (AC-169) |
| T-23 | `StartDateService`, `SoloContentShareService` | `StartDateIT` (AC-65), `SoloShareIT` (AC-67) |
| T-24 | `WebSocketConfig`, `CoupleChannelInterceptor`, `PresenceService`, `src/realtime/stompClient.ts` | `RealtimeIsolationIT` (AC-31), `PresenceIT` (AC-70) |
| T-25 | `NotificationService`, `PushSubscriptionService`, `WebPushSender`, `ExpoPushSender`, `NotificationDispatcher` | `NotificationDispatcherIT` (AC-10, AC-68), `WebPushIT` (AC-154), `e2e/tests/notifications.spec.ts` (AC-120) |
| T-26 | `ProfileService`, `src/app/settings/profile.tsx`, `AvatarCropper` | `ProfileIT`, `e2e/tests/profile.spec.ts` (AC-62) |
| T-27 | `src/app/(setup)/*.tsx`, `InviteQr`, `QrScanner` | `e2e/tests/pairing.spec.ts` (AC-11, AC-65, AC-67, AC-68, AC-169, AC-170) |
| T-28 | `WeatherService`, `OpenMeteoClient` | `WeatherCacheIT` (AC-210), `weatherCard.test.tsx` (AC-71, AC-100) |
| T-29 | `DailyQuestionService`, `QuestionPicker`, `src/app/(tabs)/home/question.tsx` | `DailyQuestionIT` (AC-15), `QuestionPickerTest` (AC-75), `e2e/tests/question.spec.ts` |
| T-30 | `HeartSignalService`, `HeartButton`, `src/app/(tabs)/home/thinking.tsx` | `HeartSignalIT` (AC-19, AC-78), `e2e/tests/heart.spec.ts` (AC-17, AC-18, AC-76, AC-77) |
| T-31 | `DashboardService`, `CoupleCalendar`, `src/domain/dates.ts`, `src/domain/geo.ts`, `CounterOdometer` | `dates.test.ts` + `CoupleCalendarTest` (`date-cases.json`; AC-13, AC-69), `geo.test.ts` (AC-74), `partnerTime.test.ts` (AC-14), `e2e/tests/home.spec.ts` |
| T-32 | `Dockerfile` (root), `fonts/` | `DockerImageIT` (`ffmpeg -version`, фонт), AC-161 buildx |
| T-33 | `UploadSessionService`, `src/upload/uploadQueue.ts`, `src/app/storage-full.tsx` | `UploadResumeIT` (AC-20), `QuotaIT` (AC-200), `uploadQueue.test.ts` |
| T-34 | `VideoTranscodeJob` | `VideoTranscodeIT` (AC-24, AC-172) |
| T-35 | `MemoryService` | `MemoryIT` (AC-22, AC-67, AC-82, AC-83, AC-131, AC-173) |
| T-36 | `MemoryTrashService`, `TrashPurgeJob` | `MemoryTrashIT` (AC-23, AC-174) |
| T-37 | `MemoryGroupService`, `MemorySearchService` | `MemoryGroupIT` (AC-81), `MemorySearchIT` (AC-25, AC-175) |
| T-38 | `src/app/(tabs)/memories/index.tsx`, `[id].tsx`, `src/app/media/[id].tsx`, `PerspectiveCard` | `e2e/tests/memories.spec.ts` (AC-80, AC-82, AC-173) |
| T-39 | `src/app/memory-editor.tsx`, `ExifSuggestion`, `stripGps` | `stripGps.test.ts` (AC-21), `e2e/tests/memory-create.spec.ts` (AC-20, AC-79, AC-172, AC-197) |
| T-40 | `search.tsx`, `groups/`, `favorites.tsx`, `trash.tsx` | `e2e/tests/memory-organize.spec.ts` (AC-81, AC-83, AC-174, AC-175) |
| T-41 | `MemoryRecapJob`, `src/app/recap/[id].tsx` | `MemoryRecapIT` (AC-84) |
| T-42 | `MemoryBookPdfService`, `MemoryAlbumZipService`, `src/app/(tabs)/memories/export.tsx` | `MemoryBookPdfIT` (AC-26), `AlbumZipIT` (AC-85) |
| T-43 | `ChatMessageService` | `ChatMessageIT` (AC-29, AC-30, AC-87, AC-88, AC-176, AC-177), `e2e/tests/chat.spec.ts` (AC-27) |
| T-44 | `ChatSearchService`, `PinService` | `ChatSearchIT`, `e2e/tests/chat-search.spec.ts` (AC-89, AC-90) |
| T-45 | `DisappearingMessageJob`, `ScreenProtection`, `src/app/(tabs)/chat/disappearing.tsx` | `DisappearingMessageIT` (AC-30, AC-92), `e2e/tests/chat-disappearing.spec.ts` |
| T-46 | `VoiceRecorder`, `VoiceRecorderOverlay`, `AudioTranscodeJob` | `AudioTranscodeIT`, `e2e/tests/voice.spec.ts` (AC-32, AC-158) |
| T-47 | `src/app/(tabs)/chat/index.tsx`, `MessageBubble`, `ChatComposer` | `e2e/tests/chat.spec.ts` (AC-27, AC-28, AC-29, AC-88, AC-176, AC-177, AC-178) |
| T-48 | `message-menu.tsx`, `pins.tsx`, `search.tsx`, `media.tsx`, `LocationMessage` | `e2e/tests/chat-actions.spec.ts` (AC-87, AC-89, AC-90, AC-91) |
| T-49 | `SharedPromiseService`, `src/app/(tabs)/chat/promise.tsx` | `SharedPromiseIT`, `e2e/tests/promise.spec.ts` (AC-93) |
| T-50 | `DateIdeaService`, `IdeaLibraryService`, `RandomIdeaPicker` | `RandomIdeaPickerTest` (AC-98), `IdeaLibraryIT` (AC-99), `DateIdeaIT` (AC-179) |
| T-51 | `DatePlanService`, `ReminderRegistry` | `DatePlanIT` (AC-33, AC-95, AC-96, AC-131), `ReminderRegistryTest` (AC-35), `planTime.test.ts` (AC-34) |
| T-52 | `DateRecurrence`, `BudgetSummaryService` | `DateRecurrenceTest` (AC-37), `budget.test.ts` + `BudgetSummaryTest` (AC-97) |
| T-53 | `SecretDeckService` | `SecretDeckIT` (AC-36) |
| T-54 | `src/app/(tabs)/plans/index.tsx`, `calendar.tsx`, `[id].tsx`, `addToCalendar` | `e2e/tests/plans.spec.ts` (AC-33, AC-94, AC-95, AC-96), `forecastWindow.test.ts` (AC-100), `e2e/tests/web-fallbacks.spec.ts` (AC-158) |
| T-55 | `ideas.tsx`, `idea-editor.tsx`, `random.tsx`, `deck.tsx`, `library.tsx`, `budget.tsx` | `e2e/tests/ideas.spec.ts` (AC-36, AC-91, AC-99, AC-179), `randomFilter.test.ts` (AC-98) |
| T-56 | `AnniversaryService`, `AutoMilestoneCalculator`, `GiftIdeaService`, `CelebrationSeenService` | `AutoMilestoneCalculatorTest` (AC-38, AC-102, AC-103), `GiftIdeaIT` (AC-40), `reminders.test.ts` (AC-104), `CelebrationIT` (AC-39) |
| T-57 | `src/app/(tabs)/together/occasions/*.tsx`, `src/app/celebration.tsx` | `e2e/tests/occasions.spec.ts` (AC-39, AC-105, AC-181, AC-MO-02) |
| T-58 | `SharedListService` | `SharedListIT` (AC-41, AC-131), `e2e/tests/lists.spec.ts` |
| T-59 | `GoalService` | `goalProgress.test.ts` + `GoalIT` (AC-108), `e2e/tests/goals.spec.ts` (AC-42) |
| T-60 | `lists.tsx`, `goals/`, `ConflictResolutionSheet` | `e2e/tests/lists.spec.ts` (AC-41, AC-91, AC-106, AC-107, AC-109, AC-110, AC-131) |
| T-61 | `LetterService`, `LetterDeliveryJob`, `TimeCapsuleService` | `LetterIT` (AC-43, AC-112), `LetterDeliveryIT` (AC-44), `TimeCapsuleIT` (AC-45) |
| T-62 | `src/app/(tabs)/together/letters/*.tsx`, `capsules/*.tsx` | `e2e/tests/letters.spec.ts` (AC-111, AC-113, AC-182) |
| T-63 | `CheckInService`, `src/app/(tabs)/together/checkin.tsx`, `MoodChart` | `CheckInIT` (AC-46, AC-114), `moodChart.test.tsx` (AC-115), `e2e/tests/checkin.spec.ts` (AC-183) |
| T-64 | `MapView` (`MapView.web.tsx`, `MapView.native.tsx`), `src/app/(tabs)/together/map.tsx` | `e2e/tests/map.spec.ts` (AC-86, AC-116) |
| T-65 | `StatsService`, `FootstepsCalculator`, `YearInReviewService` | `FootstepsCalculatorTest` (AC-47), `StatsIT` (AC-117), `YearInReviewIT` + `e2e/tests/year.spec.ts` (AC-118) |
| T-66 | `DashboardCards` (`NextDateCard`, `OccasionsCard`, `RecentMemoriesCard`, `OnThisDayCard`) | `onThisDay.test.ts` (AC-73), `e2e/tests/home-cards.spec.ts` (AC-72, AC-73) |
| T-67 | `NotificationPreferenceService`, `QuietModeService` | `NotificationPreferenceIT` (AC-48, AC-49, AC-119), `QuietModeIT` (AC-123), `dndDefaults.test.ts` (AC-184) |
| T-68 | `ReminderScheduler`, `LocalNotificationScheduler`, `GreetingJob`, `InactivityReminderJob` | `ReminderSchedulerIT` (AC-155, AC-180), `GreetingJobIT` (AC-121), `InactivityReminderIT` (AC-122), `localNotifications.test.ts` (AC-35, AC-104) |
| T-69 | `src/app/settings/notifications.tsx`, `notificationRoutes.ts` | `notificationRoutes.test.ts` (AC-50), `e2e/tests/notification-settings.spec.ts` (AC-123, AC-184) |
| T-70 | `AppLockProvider`, `src/app/lock.tsx` | `appLock.test.ts` (AC-52) |
| T-71 | `DeviceSessionService`, `src/app/settings/security.tsx` | `DeviceSessionIT` (AC-56, AC-125, AC-187) |
| T-72 | `DataExportJob`, `src/app/settings/data.tsx` | `DataExportIT` (AC-53, AC-126, AC-30) |
| T-73 | `CoupleBreakupService`, `CouplePurgeJob`, `src/app/settings/breakup.tsx` | `CoupleBreakupIT` (AC-54, AC-127, AC-171), `e2e/tests/breakup.spec.ts` (AC-185) |
| T-74 | `AccountDeletionService`, `src/app/settings/delete-account.tsx` | `AccountDeletionIT` (AC-128) |
| T-75 | `AdminAuthorization`, `AdminMetricsService`, `SurveyService`, `SurveyCard` | `AdminIT` (AC-186, AC-206), `SurveyIT` + `surveyCard.test.tsx` (AC-207) |
| T-76 | `docs/PRIVACY.md`, `docs/TERMS.md`, `PolicyVersionService`, `src/app/settings/policies.tsx` | `PolicyIT` (AC-63), `e2e/tests/policies.spec.ts` (AC-130), `policy-guards.test.ts` (AC-193) |
| T-77 | `CoupleIsolationIT`, `IsolationFixture` | `CoupleIsolationIT` (AC-55, AC-31, AC-40, AC-46) |
| T-78 | `src/app/(onboarding)/intro.tsx`, `FirstWeekTasks`, `EmptyStateAction` | `firstWeek.test.ts` (AC-134), `e2e/tests/onboarding.spec.ts` (AC-57, AC-133, AC-188) |
| T-79 | `src/app/settings/index.tsx`, `appearance.tsx`, `licenses.tsx`, `about.tsx` | `e2e/tests/settings.spec.ts` (AC-135, AC-190, AC-AS-02, AC-DS-03), `buildInfo.test.ts` |
| T-80 | `CoupleSettingsService`, `src/app/settings/couple.tsx` | `CoupleSettingsIT`, `e2e/tests/couple-settings.spec.ts` (AC-137, AC-138) |
| T-81 | `VersionController`, `src/app/update-required.tsx`, `UpdateAvailableCard` | `versionCompare.test.ts`, `e2e/tests/version.spec.ts` (AC-141) |
| T-82 | `mobile/public/manifest.json`, `src/app/+html.tsx` | `e2e/tests/pwa-manifest.spec.ts` (AC-140, AC-152) |
| T-83 | `mobile/sw/sw.ts`, `src/pwa/registerSW.ts`, `UpdateBanner` | `e2e/tests/pwa-offline.spec.ts` (AC-140, AC-156, AC-191) |
| T-84 | `src/app/install.tsx`, `useInstallPrompt`, `src/app/push-permission.tsx`, `subscribePush` | `e2e/tests/pwa-install.spec.ts` (AC-153), `e2e/tests/web-push.spec.ts` (AC-154) |
| T-85 | `PasskeyService`, `src/app/settings/passkey.tsx` | `PasskeyIT`, `e2e/tests/passkey.spec.ts` (AC-157) |
| T-86 | `src/pwa/webFallbacks.ts` (`downloadIcs`, `shareOrDownload`, `pickWithCapture`, `getPosition`) | `e2e/tests/web-fallbacks.spec.ts` (AC-158, AC-217) |
| T-87 | `perf-budget.test.ts`, `lazy()` маршрут | `e2e/tests/perf.spec.ts` (AC-152, AC-160, AC-205) |
| T-88 | `mobile/app.config.ts`, `eas.json`, `docs/store/`, `docs/RELEASE.md` | `app-config.test.ts` (AC-61) |
| T-89 | `deploy/dev/Dockerfile.expo`, `deploy/dev/download/index.html`, `DEPLOYED.md` | `e2e/tests/download-page.spec.ts` (AC-58) |
| T-90 | `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`, `.env.prod.example`, `deploy/deploy.sh`, `deploy/duckdns-update.sh`, `deploy/oracle/README.md`, `docs/OPERATIONS.md` | `deploy/tests/prod-config.test.sh` (AC-151, AC-161, AC-162), `secrets-scan.test.ts` |
| T-91 | `deploy/backup/backup.sh`, `deploy/backup/restore-test.sh`, `docs/BACKUP.md` | `deploy/tests/backup-restore.test.sh` (AC-151, AC-204) |
| T-92 | `.github/workflows/ci.yml` | `actionlint`/YAML parse (AC-203) |
| T-93 | `load/aura.k6.js`, `load/thresholds.json` | `load/README.md`-ийн команд (AC-150) |
| T-94 | `e2e/tests/smoke.spec.ts`, `a11y.spec.ts`, `one-hand.spec.ts`, `animations.spec.ts`, `ac-coverage.spec.ts` | Өөрөө (AC-143, AC-197, AC-198, AC-211, AC-214, AC-219, AC-MO-01, AC-DS-05) |

## 5. AC-ийн хучилт

Энэ хэсэг: спекийн AC бүр загварын аль хэсгээр хангагдаж, юугаар шалгагдах вэ? Хамралт: 232/232. «Хэрхэн» баганын арга нь спекийнх (UT · IT · E2E · ГАР · CR); тест §4.6-ийн нэрээр.

| AC | Хаана хэрэгжинэ | Хэрхэн шалгагдана |
|---|---|---|
| AC-DS-01 | `tokens.ts` 5 палитр × 2 theme | UT `contrast.test.ts` |
| AC-DS-02 | Hex зөвхөн `tokens.ts`-д (INV-12) | UT `no-hex.test.ts` |
| AC-DS-03 | `ThemeProvider` cross-fade 300 ms, S-88 | E2E `theme.spec.ts` |
| AC-DS-04 | `typography.ts`, `@expo-google-fonts` файлууд | UT `font-cmap.test.ts` |
| AC-DS-05 | Уян layout, `maxFontSizeMultiplier` хязгааргүй | E2E `large-text.spec.ts`, `smoke.spec.ts` |
| AC-MO-01 | `useMotionPreference` → `reduced` fade (DD-AURA-026) | E2E `animations.spec.ts` (`reducedMotion: 'reduce'`) |
| AC-MO-02 | `CelebrationOverlay` товшиход хаах + `POST /me/celebrations/{eventKey}/seen` (GAP-23) | E2E `occasions.spec.ts` |
| AC-MO-03 | `AnimatedMoment` `off` үед Lottie/бөөм render хийхгүй | UT `motion-off.test.tsx` |
| AC-MO-04 | `haptics.ts` + `Preferences.haptics` (анхдагч true) | UT `haptics.test.ts`; ГАР мэдрэмж |
| AC-MO-05 | `SizedLottie` (dotLottie, тогтоосон width/height) | E2E `lottie-size.spec.ts` |
| AC-AS-01 | `docs/ASSETS.md` ↔ `mobile/assets/**`, `fonts/` | UT `assets-registry.test.ts` |
| AC-AS-02 | S-89 `settings/licenses.tsx` (`licenses.json`) | E2E `settings.spec.ts` |
| AC-AS-03 | Fluent/Noto/өөрийн маскот л | CR (`policy-guards.test.ts` брэндийн нэрийн жагсаалт) |
| AC-192 | `(tabs)/_layout.tsx`, `useWideLayout`, `AppTabs.web.tsx` (DD-AURA-035) | E2E `layout.spec.ts` |
| AC-193 | i18n, `docs/store/`, `docs/PRIVACY.md` (INV-09, GAP-25) | UT `policy-guards.test.ts` |
| AC-194 | Тоо өрсөлдөөнгүй (`signalsToday`), streak-гүй (INV-15) | CR + `policy-guards.test.ts` |
| AC-214 | `AnimatedMoment` `data-anim-state` (TQ-05) | E2E `animations.spec.ts` |
| AC-215 | `ANIM_HAPTICS` хүснэгт | UT `haptics.test.ts` |
| AC-01 | `POST /auth/register` → `POST /auth/verify-email`; `email_token` attempts 5 → `CODE_LOCKED` 15 мин | IT `EmailVerificationIT`; E2E `auth.spec.ts` (Mailpit) |
| AC-02 | DD-AURA-031: 202 ижил бие, async имэйл | IT `RegistrationIT` (статус, бие, хугацааны Welch-t) |
| AC-03 | `POST /auth/password-reset/confirm` → session revoke | IT `PasswordResetIT` |
| AC-04 | `RegisterRequest.birthDate` 18+ → `AGE_RESTRICTED`; S-04 мессеж | E2E `auth.spec.ts`; IT `RegistrationIT` |
| AC-05 | `LoginRateLimiter` 10/15 мин → 429 `RATE_LIMITED` + `Retry-After` | IT `LoginRateLimitIT` |
| AC-06 | DD-AURA-032, `/auth/oauth/{provider}/*`, stub IdP (GAP-18) | E2E `oauth.spec.ts`; ГАР prod Google |
| AC-07 | DD-AURA-007 reuse → бүх `device_session` revoke | IT `RefreshTokenIT` |
| AC-62 | `PATCH /me`, `PUT /me/avatar` (≤ 10 MB), WS `profile.updated` | E2E `profile.spec.ts` |
| AC-63 | `acceptedPolicyVersion`, `policy_acceptance`, `Me.policyUpdateRequired` → S-90 хаалга | IT `PolicyIT`; E2E `auth.spec.ts` |
| AC-64 | `TimezonePrompt` + `timezonePromptStore` | UT `timezonePrompt.test.ts` |
| AC-164 | `PasswordPolicy` (≥ 8, `common-passwords.txt`) | IT `RegistrationIT`; E2E `auth.spec.ts` |
| AC-165 | `POST /auth/verify-email/link`; `POST /invites`, `/pairings` → `AUTH_EMAIL_NOT_VERIFIED` | IT `EmailVerificationIT`, `InviteIT` |
| AC-166 | `email_token` RESET 30 мин, нэг удаа | IT `PasswordResetIT` |
| AC-167 | `OAuthAccountLinker` `linkRequired` → `POST /auth/oauth/link` | IT `GoogleOAuthIT` |
| AC-168 | JWT 15 мин, refresh 30 хоног; `client.ts` чимээгүй refresh | IT `RefreshTokenIT`; UT `client-refresh.test.ts` |
| AC-08 | `GET /invites/lookup`, `POST /pairings` → 410 `INVITE_INVALID` | IT `InviteIT` |
| AC-09 | `attempt_counter invite:{userId}` 10/цаг → 423 `INVITE_LOCKED` | IT `InviteIT` |
| AC-10 | `POST /pairings/{id}/cancel` + `NotificationDispatcher` хоёуланд | IT `PairingIT`, `NotificationDispatcherIT` |
| AC-11 | `POST /pairings/{id}/confirm` → WS `couple.linked` → S-12 ANIM-14 | E2E `pairing.spec.ts`; ГАР |
| AC-12 | Урилгын холбоос `https://<host>/join?code=` → S-09 / Safari заавар (GAP-13) | ГАР |
| AC-65 | `space_member.proposed_start_date`, `PUT /couple/start-date`, `Couple.startDateStatus` | E2E `pairing.spec.ts`; IT `StartDateIT` |
| AC-66 | INV-02 partial unique index; `ALREADY_PAIRED` | IT `PairingIT` |
| AC-67 | DD-AURA-003, `POST /couple/solo-share`, `scope=private` | IT `SoloShareIT`; E2E `pairing.spec.ts` |
| AC-68 | `POST /pairings` → inviter-т `notification` + Web Push | E2E `pairing.spec.ts`; IT `NotificationDispatcherIT` |
| AC-169 | `InviteCodeGenerator` (алфавит DD §3 `invite`), S-08 QR/холбоос, `DELETE /invites/{id}` | UT `InviteCodeGeneratorTest`; E2E `pairing.spec.ts` |
| AC-170 | `pairing.status AWAITING_INVITER → LINKED` | IT `PairingIT`; E2E `pairing.spec.ts` |
| AC-171 | `PAIRING_COOLDOWN` (`BREAKING` хугацаанд) | IT `InviteIT`, `CoupleBreakupIT` |
| AC-13 | DD-AURA-019 тоолуур, `Dashboard.counter` | UT `dates.test.ts`, `CoupleCalendarTest` |
| AC-14 | `PersonCard.offsetFromMeMinutes`, `localTime` | UT `partnerTime.test.ts`; E2E `home.spec.ts` |
| AC-15 | DD-AURA-005 `DailyQuestion.partnerAnswer` зөвхөн `myAnswer` байвал; WS `question.revealed` | IT `DailyQuestionIT`; E2E `question.spec.ts` |
| AC-16 | Persist кэш (§4.4), lazy маршрут (T-87) | ГАР (GAP-21) |
| AC-69 | `counter.breakdown` | UT `dates.test.ts` |
| AC-70 | `online_visible` тэгш (INV-06), `PresenceService` | IT `PresenceIT` |
| AC-71 | `PersonCard.weather` null бол хэсэг нуух | UT `weatherCard.test.tsx`; E2E `home.spec.ts` (mock) |
| AC-72 | `GET /dashboard` бүх хэсэг + `ScreenState` хоосон | E2E `home-cards.spec.ts` (seed `DASHBOARD_FULL`) |
| AC-73 | `GET /memories/on-this-day`, `Dashboard.onThisDay` | UT `onThisDay.test.ts`; E2E `home-cards.spec.ts` |
| AC-74 | `src/domain/geo.ts` haversine, `longDistance.nextMeetupAt` | UT `geo.test.ts` |
| AC-75 | DD-AURA-018/021 `QuestionPicker`, `daily_question` | UT `QuestionPickerTest` |
| AC-17 | `POST /signals` → WS `signal.received` → ANIM-02 | E2E `heart.spec.ts` |
| AC-18 | `GET /signals/unseen` нэгтгэл → нэг карт | E2E `heart.spec.ts` |
| AC-19 | `signal:{userId}` 10/мин → 429; `HeartButton` cooldown | IT `HeartSignalIT`; E2E `heart.spec.ts` |
| AC-76 | `kind=HUG` (≥ 0.6 с long press) | E2E `heart.spec.ts`; ГАР haptic |
| AC-77 | `SignalRequest.text maxLength 80` | UT input тест; E2E `heart.spec.ts` |
| AC-78 | `heart_signal.couple_day` (SD-02), `signalsToday` | IT `HeartSignalIT` |
| AC-20 | DD-AURA-012 chunk upload + `uploadQueue` | E2E `memory-create.spec.ts` (`context.setOffline`); ГАР |
| AC-21 | `stripGps` (client) + `ImageProcessor` (сервер) | IT `ImageProcessorIT` |
| AC-22 | `PATCH/DELETE /memories/{id}` → 403 `NOT_OWNER` | IT `MemoryIT` |
| AC-23 | `deleted_at`/`purge_after`, `TrashPurgeJob` + S3 устгал | IT `MemoryTrashIT` (`/test/clock`) |
| AC-24 | `VideoTranscodeJob`, `media.status PROCESSING→READY` | IT `VideoTranscodeIT`; E2E `memory-create.spec.ts` |
| AC-25 | DD-AURA-015 trigram, `GET /memories?q` | IT `MemorySearchIT` (seed `MEMORIES_10K`, ≤ 500 ms) |
| AC-26 | DD-AURA-024 OpenHTMLtoPDF + фонт | IT `MemoryBookPdfIT` (PDFTextStripper) |
| AC-79 | `ExifSuggestion` (`dateSource=EXIF`) | E2E `memory-create.spec.ts` |
| AC-80 | `FlashList` + sticky толгой, `GET /memories/months` | E2E `memories.spec.ts`; ГАР fps |
| AC-81 | `memory_group_item`, `DELETE /memory-groups/{id}` | IT `MemoryGroupIT`; E2E `memory-organize.spec.ts` |
| AC-82 | `memory_perspective` UNIQUE(memory, author) | IT `MemoryIT`; E2E `memories.spec.ts` |
| AC-83 | `memory_favorite` хүн тутам | IT `MemoryIT` |
| AC-84 | `MemoryRecapJob` (≥ 5), `Dashboard.recap` | IT `MemoryRecapIT` |
| AC-85 | `MemoryAlbumZipService` нэрлэлт | IT `AlbumZipIT` |
| AC-86 | S-30 Map/Recap нь `GET /memories/places`, `GET /year-in-review/{year}`-ийг S-70/S-72-тай хуваалцана | E2E `map.spec.ts` |
| AC-172 | `UploadCreate` хязгаар, `memory_media` 1–20, client resize | IT `ImageProcessorIT`, `VideoTranscodeIT`; E2E `memory-create.spec.ts` |
| AC-173 | `memory_comment`, `reaction`, WS `memory.comment` | E2E `memories.spec.ts`; IT `MemoryIT` |
| AC-174 | `GET /memories/{id}/delete-preview`, S-37 | E2E `memory-organize.spec.ts` |
| AC-175 | `GET /memories` шүүлтүүд | IT `MemorySearchIT`; E2E `memory-organize.spec.ts` |
| AC-27 | REST `POST /messages` → WS `chat.message.created` | E2E `chat.spec.ts` (100 мессеж p95) |
| AC-28 | DD-AURA-017 outbox + `clientMessageId` | UT `outbox.test.ts`; E2E `chat.spec.ts` |
| AC-29 | `POST /messages/read` → WS `chat.receipt` | E2E `chat.spec.ts` |
| AC-30 | INV-05: `deleted_at`/`expires_at` → агуулга NULL; хайлт, экспорт, push-ээс хасах | IT `ChatMessageIT`, `DisappearingMessageIT`, `DataExportIT` |
| AC-31 | DD-AURA-008 `CoupleChannelInterceptor` | IT `RealtimeIsolationIT`, `CoupleIsolationIT` |
| AC-32 | `AudioTranscodeJob` + waveform, ANIM-23 | E2E `voice.spec.ts`; ГАР iPhone |
| AC-87 | `UploadCreate purpose=FILE ≤ 50 MB`, `MediaInspector` хориотой төрөл, `kind=LOCATION` | IT `ChatMessageIT`; E2E `chat-actions.spec.ts` |
| AC-88 | `replyToId`, `PATCH /messages/{id}` (`editedAt`), 403 | E2E `chat.spec.ts`; IT `ChatMessageIT` |
| AC-89 | `GET /messages/search` (highlights), `GET /messages/jump` | E2E `chat-search.spec.ts` |
| AC-90 | `PUT/DELETE /messages/{id}/pin` (хоёулаа) | E2E `chat-search.spec.ts` |
| AC-91 | S-41 → `draftStore` → S-32/S-53/S-63 (DEC-AURA-005) | E2E `chat-actions.spec.ts`, `ideas.spec.ts`, `lists.spec.ts` |
| AC-92 | `DisappearingMessageJob` (2 с), `expires_at = read_at + seconds`; GAP-12 бичвэр | IT `DisappearingMessageIT`; E2E `chat-disappearing.spec.ts`; ГАР Android |
| AC-93 | `SharedPromiseService` | E2E `promise.spec.ts` |
| AC-176 | `Message.status` SENT→DELIVERED→READ, `deleted` | E2E `chat.spec.ts`; IT `ChatMessageIT` |
| AC-177 | `typing_visible` тэгш, `/app/typing` | IT `ChatMessageIT`; E2E `chat.spec.ts` |
| AC-178 | `ChatComposer` «Хайртай» → `POST /signals` | E2E `chat.spec.ts` |
| AC-33 | `POST /plans/{id}/respond COUNTER`, `/choose-option` | E2E `plans.spec.ts`; IT `DatePlanIT` |
| AC-34 | `starts_at` UTC + `timezone` | UT `planTime.test.ts` |
| AC-35 | `ReminderRegistry` (устгах + дахин товлох) | UT `ReminderRegistryTest`, `localNotifications.test.ts` |
| AC-36 | DD-AURA-005 `SecretDeckService`, `DeckMatch` | IT `SecretDeckIT` (JSON түлхүүр); E2E `ideas.spec.ts` |
| AC-37 | `DateRecurrence` (SD-03), occurrence exception | UT `DateRecurrenceTest` |
| AC-94 | S-50/S-51/S-52 таб, `GET /plans?from&to` | E2E `plans.spec.ts` |
| AC-95 | S-54 «Дурсамж болгох» → S-32, `POST /plans/{id}/memory` | E2E `plans.spec.ts`; IT `DatePlanIT` |
| AC-96 | `checklist_item` + WS `checklist.updated` | E2E `plans.spec.ts` |
| AC-97 | `BudgetSummaryService`, `src/domain/budget.ts` | UT `budget.test.ts`, `BudgetSummaryTest` |
| AC-98 | `RandomIdeaPicker`, `GET /ideas/random` (204 → хоосон төлөв) | UT `RandomIdeaPickerTest`, `randomFilter.test.ts` |
| AC-99 | `GET /idea-library`, `POST /idea-library/{id}/adopt` (DD-AURA-020) | E2E `ideas.spec.ts`; IT `IdeaLibraryIT` |
| AC-100 | `DatePlan.weather` ≤ 14 хоног | UT `forecastWindow.test.ts`, `weatherCard.test.tsx` |
| AC-101 | `addToCalendar` (`expo-calendar`) / `GET /plans/{id}/ics` | ГАР |
| AC-179 | `DateIdeaInput` (title required) | E2E `ideas.spec.ts`; IT `DateIdeaIT` |
| AC-180 | DD-AURA-023 `scheduled_reminder` + `LocalNotificationScheduler` | UT `localNotifications.test.ts`; IT `ReminderSchedulerIT` |
| AC-38 | `AutoMilestoneCalculator` (SD-03) | UT `AutoMilestoneCalculatorTest` |
| AC-39 | `GET /me/celebrations` + `celebration_seen` (GAP-23), S-25 | E2E `occasions.spec.ts` (seed `MILESTONE_1000`); IT `CelebrationIT` |
| AC-40 | `gift_idea.owner_id` проекц (INV-04) | IT `GiftIdeaIT`, `CoupleIsolationIT` |
| AC-102 | `GET /anniversaries` автомат ой (SD-01) | UT `AutoMilestoneCalculatorTest` |
| AC-103 | `Occasion.daysUntil/daysSince` хэрэглэгчийн бүсээр | UT `AutoMilestoneCalculatorTest` |
| AC-104 | `reminderDays` → `scheduled_reminder` / локал | UT `reminders.test.ts`, `localNotifications.test.ts` |
| AC-105 | `PUT /occasions/{key}/note`, `anniversary_memory` | E2E `occasions.spec.ts` |
| AC-181 | `anniversary.kind/recurring` | E2E `occasions.spec.ts` |
| AC-41 | DD-AURA-016 `version` → 409 + `ConflictResolutionSheet` | IT `SharedListIT`; E2E `lists.spec.ts` |
| AC-42 | `POST /goals/{id}/contributions` + WS `goal.updated` | E2E `goals.spec.ts` |
| AC-106 | `PATCH /list-items/{id} done` → confetti + дурсамжийн санал | E2E `lists.spec.ts` |
| AC-107 | `doneBy/doneAt`, `POST /lists/{kind}/clear-done` | E2E `lists.spec.ts` |
| AC-108 | `Goal.progressPercent`, `stepsDone` | UT `goalProgress.test.ts`; IT `GoalIT` |
| AC-109 | `list_item_vote`, `bothWant`, `PUT /lists/{kind}/order` | E2E `lists.spec.ts` |
| AC-110 | Wishlist → S-54 ноорог (`draftStore`) | E2E `lists.spec.ts` |
| AC-43 | DD-AURA-005 `LetterTeaser` (агуулгагүй), 404 хүлээн авагчид | IT `LetterIT` (API, WS, push, экспорт) |
| AC-44 | `LetterDeliveryJob` 15 с | IT `LetterDeliveryIT` |
| AC-45 | `capsule`/`capsule_part` (GAP-15), `body` OPENED үед л | IT `TimeCapsuleIT` |
| AC-111 | `LetterInput.template`, `mediaIds ≤ 5`, S-67 ANIM-06 | E2E `letters.spec.ts` |
| AC-112 | `PATCH/DELETE /letters/{id}` → 409 `LETTER_ALREADY_DELIVERED` | IT `LetterIT` |
| AC-113 | `GET /letters?box=inbox|sent` | E2E `letters.spec.ts` |
| AC-182 | `Dashboard.incomingLetters`, `letter.status` | E2E `letters.spec.ts` |
| AC-46 | `check_in.shared=false` хамтрагчид 0 | IT `CheckInIT`, `CoupleIsolationIT` |
| AC-114 | UNIQUE(user, local_date); `PATCH /checkins/{date}` өнгөрсөн → 403 | IT `CheckInIT` |
| AC-115 | `CheckInSeries.partner` (shared л), `MoodChart` | UT `moodChart.test.tsx`; E2E `checkin.spec.ts` |
| AC-183 | `Preferences.checkinAutoShare` (анхдагч false), ANIM-15 | E2E `checkin.spec.ts` |
| AC-47 | `FootstepsCalculator` | UT `FootstepsCalculatorTest` |
| AC-116 | `MapView` (Leaflet + markercluster, attribution) | E2E `map.spec.ts` |
| AC-117 | `StatsService` — DB тоолол | IT `StatsIT` |
| AC-118 | `YearInReviewService` 6–10 слайд, S-72 зураг хадгалах | IT `YearInReviewIT`; E2E `year.spec.ts` |
| AC-48 | DD-AURA-022 `push_outbox.deliver_after` + нэгтгэл | IT `NotificationPreferenceIT` |
| AC-49 | `hide_content` → payload-д ерөнхий гарчиг л | IT `NotificationPreferenceIT` (push sink) |
| AC-50 | `notificationRoutes.ts` (`deepLink` → route) | UT `notificationRoutes.test.ts`; ГАР |
| AC-51 | `WebPushSender` + SW `push`/`notificationclick` | ГАР (prod HTTPS) |
| AC-119 | `disabled_types` — push л алгасна | IT `NotificationPreferenceIT` |
| AC-120 | `GET /notifications` `unreadCount`, `read-all` | E2E `notifications.spec.ts` |
| AC-121 | `GreetingJob` хүлээн авагчийн бүсээр, GAP-26 анхдагч | IT `GreetingJobIT` |
| AC-122 | `InactivityReminderJob` 7 хоногт ≤ 1 | IT `InactivityReminderIT` |
| AC-123 | `PUT /me/quiet-mode`, WS `quiet.changed`, `PersonCard.quietUntil` | IT `QuietModeIT`; E2E `notification-settings.spec.ts` |
| AC-184 | `notification_setting` анхдагч, S-83 | UT `dndDefaults.test.ts`; E2E `notification-settings.spec.ts` |
| AC-52 | `AppLockProvider` (5 → 1 мин, 10 → нууц үг) | UT `appLock.test.ts` |
| AC-53 | `DataExportJob` проекц (INV-04) | IT `DataExportIT` |
| AC-54 | `CouplePurgeJob` DB + S3 prefix | IT `CoupleBreakupIT` |
| AC-55 | DD-AURA-028 `x-aura-scope=space` бүх operation | IT `CoupleIsolationIT` |
| AC-56 | `DELETE /me/sessions/{id}` + `session_version` | IT `DeviceSessionIT` |
| AC-124 | `AppLockProvider` хугацаа + бүдгэрүүлэх (GAP-20) | ГАР |
| AC-125 | `POST /me/sessions/revoke-all`, `POST /auth/not-me` | IT `DeviceSessionIT` |
| AC-126 | `data_export.expires_at` → 410 `EXPORT_EXPIRED`; имэйл + апп мэдэгдэл | IT `DataExportIT` |
| AC-127 | DD-AURA-034 `BREAKING` + 423; `POST /couple/restore` хоёулаа | IT `CoupleBreakupIT`; E2E `breakup.spec.ts` |
| AC-128 | `AccountDeletionService` (GAP-14), `ORPHANED` 30 хоног | IT `AccountDeletionIT` |
| AC-129 | `MediaInspector` (Apache Tika magic) + дахин кодлолт | IT `ImageProcessorIT`; UT `MediaInspectorTest` |
| AC-130 | `GET /policies/current`, S-90, `docs/PRIVACY.md`/`TERMS.md` | E2E `policies.spec.ts` |
| AC-185 | S-86 3 алхам, `POST /couple/breakup` | E2E `breakup.spec.ts` |
| AC-186 | `AdminAuthorization` (`AURA_ADMIN_EMAILS`), `users.status SUSPENDED` | IT `AdminIT` |
| AC-187 | GAP-24: revoke-all + `require_password` | IT `DeviceSessionIT` |
| AC-131 | DD-AURA-016 бүх засагддаг биет | IT `MemoryIT`, `DatePlanIT`, `SharedListIT`; E2E `lists.spec.ts` |
| AC-132 | `calendarDate.ts` (огноо string) | UT `calendarDate.test.ts` |
| AC-216 | Нуух/хаах endpoint, UI байхгүй | CR + `policy-guards.test.ts` |
| AC-57 | `EmptyStateAction` → S-32, S-40, S-54, S-60 | E2E `onboarding.spec.ts` |
| AC-133 | `Preferences.introSeen` + локал туг | E2E `onboarding.spec.ts` |
| AC-134 | `GET/PUT /me/first-week-tasks` | UT `firstWeek.test.ts`; E2E `onboarding.spec.ts` |
| AC-188 | Seed-гүй шинэ хос, S-12 CTA | E2E `onboarding.spec.ts` |
| AC-135 | `i18next` `changeLanguage`, parity | UT `i18n-parity.test.ts`; E2E `settings.spec.ts` |
| AC-136 | `EmailChangeService` | IT `EmailChangeIT` |
| AC-137 | `space_member.partner_nickname` (дуудагчид л) | E2E `couple-settings.spec.ts` |
| AC-138 | `theme_proposal` + WS `couple.updated` | E2E `couple-settings.spec.ts` |
| AC-139 | `formatDate` 3 формат | UT `formatDate.test.ts` |
| AC-189 | `POST /me/password` + `PasswordPolicy` | IT `EmailChangeIT` |
| AC-190 | `mascotColor`, S-91 `EXPO_PUBLIC_COMMIT_SHA` | E2E `settings.spec.ts`, `couple-settings.spec.ts` |
| AC-58 | S-99 `deploy/dev/download/index.html` | E2E `download-page.spec.ts` |
| AC-59 | APK (T-89) | ГАР |
| AC-60 | Expo Go (INV-13) | ГАР |
| AC-61 | `app.config.ts`, `eas.json` | UT `app-config.test.ts` |
| AC-140 | `manifest.json`, `sw.js` (DD-AURA-025) | E2E `pwa-manifest.spec.ts`, `pwa-offline.spec.ts` |
| AC-141 | `GET /version`, `UpdateAvailableCard` | UT `versionCompare.test.ts`; E2E `version.spec.ts` |
| AC-152 | `+html.tsx` meta, Lighthouse | E2E `pwa-manifest.spec.ts`, `perf.spec.ts` |
| AC-153 | `useInstallPrompt`, `installPromptStore` (7 хоног) | E2E `pwa-install.spec.ts` |
| AC-154 | DD-AURA-027 push sink, 410 цэвэрлэгээ | IT `WebPushIT`; E2E `web-push.spec.ts` |
| AC-155 | `ReminderScheduler` Web Push | IT `ReminderSchedulerIT` |
| AC-156 | Persist кэш + SW shell + outbox, `navigator.storage.persist()` | E2E `pwa-offline.spec.ts` |
| AC-157 | `PasskeyService` (`webauthn4j`), S-102 | E2E `passkey.spec.ts` (virtual authenticator) |
| AC-158 | `webFallbacks.ts`, `MediaRecorder`, `GET /plans/{id}/ics`, Leaflet | E2E `web-fallbacks.spec.ts`, `voice.spec.ts`; ГАР Safari |
| AC-159 | Prod HTTPS PWA push | ГАР |
| AC-160 | Lazy маршрут, Lottie динамик import | E2E `perf.spec.ts` |
| AC-191 | `UpdateBanner` → `draftStore` → `skipWaiting` | E2E `pwa-offline.spec.ts` |
| AC-217 | `haptics.ts` web fallback, `Preferences.sound` (false) | E2E `web-fallbacks.spec.ts`; UT `haptics.test.ts` |
| AC-142 | `docs/LAB-2/lld.html` ① (S-01…S-102, 390×844) | ГАР — LLD_APPROVE |
| AC-143 | §4.3 S-ID → route | E2E `smoke.spec.ts` |
| AC-144 | Token, typography, радиус (`no-hex`) | UT `no-hex.test.ts` |
| AC-145 | `mobile/src/content/*.json` + `content.schema.json` (DD-AURA-020) | UT `content.test.ts` |
| AC-146 | Levenshtein ≥ 0.85 шалгалт | UT `content.test.ts` |
| AC-147 | `stoplist.*.txt` | UT `content.test.ts` |
| AC-148 | `docs/CONTENT-SAMPLE.md` (DEV_TEST) | ГАР |
| AC-213 | `ScreenState` + §4.3 «Төлөв» | E2E `screen-states.spec.ts` |
| AC-149 | `docs/MANUAL-TEST.md` (DEV_TEST, plan R-1) | UT `manual-test-coverage.test.ts` (DEV_TEST) |
| AC-150 | `load/aura.k6.js` | IT k6 (DEV) |
| AC-151 | `deploy/docker-compose.prod.yml`, `deploy/backup/*` | IT `prod-config.test.sh`, `backup-restore.test.sh` |
| AC-161 | arm64 image (root `Dockerfile`, `mobile/Dockerfile`) | IT `prod-config.test.sh` (buildx) |
| AC-162 | `Caddyfile`, `.env.prod.example` | UT `prod-config.test.sh` (`caddy validate`), `secrets-scan.test.ts` |
| AC-163 | `deploy/oracle/README.md`, `docs/OPERATIONS.md` (OPS-AURA-001…006) | ГАР |
| AC-195 | DD-AURA-006/013/029/030, CORS, CI audit | IT `PasswordHashTest`, `SignedUrlIT`, `CorsIT`; CR |
| AC-196 | DD-AURA-037 `LogRedaction`; tracker 0 | IT `LogRedactionIT`; CR `policy-guards.test.ts` |
| AC-197 | `accessibilityLabel`, 44×44, alt (S-32) | E2E `a11y.spec.ts`; ГАР VoiceOver/TalkBack |
| AC-198 | Үндсэн 5 үйлдэл ≤ 3 товшилт (GAP-21) | E2E `one-hand.spec.ts` |
| AC-199 | `formatDate`, `formatNumber` | UT `formatDate.test.ts` |
| AC-200 | `StorageQuota` 80% / 10 GB → 507, S-98, S-85 | IT `QuotaIT`; E2E `memory-create.spec.ts` |
| AC-201 | `ErrorReporter` (DSN хоосон → унтраастай) | IT `ErrorReporterIT` |
| AC-202 | Actuator, JSON лог, OPS-AURA-005/006 | IT `ActuatorIT`; CR `docs/OPERATIONS.md` |
| AC-203 | `.github/workflows/ci.yml` | CR |
| AC-204 | `deploy/backup/*`, `docs/BACKUP.md` (OPS-AURA-004) | IT `backup-restore.test.sh`; CR |
| AC-205 | Таб stack-ийн lazy, blurhash placeholder | E2E `perf.spec.ts` |
| AC-206 | `GET /admin/metrics` нэгтгэл | IT `AdminIT` |
| AC-207 | `GET/POST /me/survey` (GAP-17) | UT `surveyCard.test.tsx`; IT `SurveyIT`; E2E `home-cards.spec.ts` |
| AC-208 | `policy-guards.test.ts` ↔ `bundledNativeModules.json`, `isExpoGo` | UT `policy-guards.test.ts`; CR |
| AC-209 | §4.5 compose 5 үйлчилгээ | IT `ComposeHealthIT` |
| AC-210 | `WeatherService` Caffeine 30 мин, attribution | IT `WeatherCacheIT` |
| AC-211 | Тестийн нэрэнд AC ID | CR + `ac-coverage.spec.ts` |
| AC-212 | Төлбөрийн хамаарал 0 | CR + `policy-guards.test.ts` |
| AC-218 | `docs/OPERATIONS.md`, `deploy/deploy.sh` | ГАР |
| AC-219 | `playwright.config.ts` 3 engine; APK API 24 | E2E `smoke.spec.ts`; ГАР Android 7 |

## 6. Хамрахгүй · нээлттэй

Энэ хэсэг: юуг хойшлуулж, ямар эрсдэл нээлттэй үлдсэн бэ?

- GAP-01, GAP-02: native FCM/APNs push ба Apple нэвтрэлт — код тугтай, идэвхгүй; Web Push л шалгагдана.
- GAP-06: автомат CSAM таних — хамрахгүй; админы түдгэлзүүлэх API (AC-186) л.
- GAP-07, GAP-09, GAP-11: prod tile/цаг агаарын түлхүүр, SMTP, Oracle бүртгэл — PAR-AURA-003, PAR-AURA-010 тохиргоогоор; бодит байршуулалт MERGE-ийн дараа.
- AC-149, AC-148: `docs/MANUAL-TEST.md`, `docs/CONTENT-SAMPLE.md` — DEV_TEST шатны гаралт (plan §2, R-1).
- Эрсдэл: `openapi-generator` 7.x-ийн OpenAPI 3.1 дэмжлэг бүрэн биш. Үүсгэл унавал DEVELOPMENT гэрээг өөрчлөхгүй; DD-AURA-002-ийн `ContractConformanceIT`-г хаалга болгож controller-ийг гараар бичнэ.
- Эрсдэл: SeaweedFS-ийн presigned URL утсанд хүрэхийн тулд `AURA_S3_PUBLIC_ENDPOINT` LAN IP-тай байх ёстой (GAP-10); prod-д Caddy `/media/*` → seaweedfs proxy.
- Эрсдэл: `expo-screen-capture` (Android FLAG_SECURE, iOS мэдэгдэл) Expo Go-д байгаа эсэхийг T-15 `bundledNativeModules.json`-оор батална; байхгүй бол `isExpoGo` хамгаалалттай (RSK-AURA-002).
- Эрсдэл: iOS PWA-д WebSocket арын төлөвт тасардаг — нээгдэхэд дахин холбогдож query invalidate (DD-AURA-008); арын үед push л.
