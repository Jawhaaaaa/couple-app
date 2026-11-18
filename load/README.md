# Aura ачааллын тест (k6) — AC-150

NFR-13 (10 000 хос) ба NFR-01-ийн **1/10** ачааллыг DEV орчинд шалгана:

| Үзүүлэлт | Утга | Хаана |
|---|---|---|
| Хос | 1 000 (2 000 хэрэглэгч) | `seed.k6.js`, `COUPLES` |
| Зэрэг WebSocket | 200 STOMP холболт (`/ws`, `/user/queue/events`, heartbeat 10 с) | `aura.k6.js` → `ws` scenario, `WS_USERS` |
| REST | дундаж **5 req/s** (4 мин), оргил **20 req/s** (2 мин), буцаад 5 req/s | `api` scenario, `AVG_RPS`, `PEAK_RPS`, `STEADY`, `PEAK` |
| Босго | `/api` **p95 < 300 ms**, алдаа **< 0.1%**, STOMP холболт > 99%, WS handshake p95 < 1 с | `thresholds.json` |

Босгоны аль нэг нь давбал k6 **exit 99** — шалгалт унана.

REST-ийн холимог (апп нээх үеийн бодит дуудлага): `GET /dashboard` 25%, `GET /messages` 20%,
`POST /messages` 15%, `GET /memories` 10%, `GET /signals/unseen` 10%, `GET /notifications` 10%,
`POST /signals` (HEART) 5%, `GET /me` 5%. Хүсэлтийн хагас нь WebSocket-тэй хосоос — мессеж,
дохио хамтрагчийн `/user/queue/events` руу бодитоор түгнэ (`ws_stomp_events` metric).

## Файл

| Файл | Үүрэг |
|---|---|
| `seed.k6.js` | 1 000 хос үүсгэнэ: бүртгэл → `/api/v1/test/mail/last` код → баталгаажуулалт → урилга → холболт. Idempotent — дахин ажиллуулахад бэлэн хосыг алгасна |
| `aura.k6.js` | Ачааллын тест. `setup()` 2 000 хэрэглэгчийг нэвтрүүлнэ (25-аар зэрэг) |
| `thresholds.json` | Босго (AC-150) |
| `lib/aura.js` | Хаяг, детерминист имэйл (`load-<i>-a@load.aura.test`), STOMP frame |

## Ажиллуулах

Backend нь **`dev,e2e`** profile-тэй байх ёстой (seed-д `/api/v1/test/mail/last`, prod-д байхгүй — INV-10):

```bash
cp .env.example .env                                   # POSTGRES_PASSWORD, AURA_JWT_SECRET солих
SPRING_PROFILES_ACTIVE=dev,e2e docker compose up -d --build --wait postgres seaweedfs mailpit backend
```

**k6 суулгасан бол** (репогийн үндэсээс):

```bash
k6 run -e BASE_URL=http://localhost:8080 -e COUPLES=1000 load/seed.k6.js      # ≈ 3–6 мин, нэг удаа
k6 run -e BASE_URL=http://localhost:8080 --summary-export load/results.json load/aura.k6.js   # ≈ 9 мин
```

**Docker-оор** (`grafana/k6`, linux/amd64 ба arm64):

```bash
docker run --rm -i -v "$PWD/load:/load" -w /load --add-host=host.docker.internal:host-gateway \
  grafana/k6 run -e BASE_URL=http://host.docker.internal:8080 -e COUPLES=1000 seed.k6.js
docker run --rm -i -v "$PWD/load:/load" -w /load --add-host=host.docker.internal:host-gateway \
  grafana/k6 run -e BASE_URL=http://host.docker.internal:8080 --summary-export /load/results.json aura.k6.js
```

Windows Git Bash дээр `MSYS_NO_PATHCONV=1` ба `$(pwd -W)` хэрэглэ.

Синтакс, тохиргоо шалгах (сүлжээ, backend шаардахгүй): `k6 inspect load/aura.k6.js`.

### Хувьсагч

| Нэр | Анхдагч | Тайлбар |
|---|---|---|
| `BASE_URL` | `http://localhost:8080` | Backend (`/api/v1`, `/ws`) |
| `WS_URL` | `BASE_URL`-аас `ws://…/ws` | |
| `ORIGIN` | `http://localhost:8090` | WebSocket `Origin` — `AURA_CORS_ALLOWED_ORIGINS`-д байх ёстой |
| `COUPLES` | `1000` | Seed ба тестийн хосын тоо (хоёр скриптэд ижил) |
| `WS_USERS` | `200` | Зэрэг STOMP холболт |
| `AVG_RPS` / `PEAK_RPS` | `5` / `20` | REST хүсэлт/с |
| `STEADY` / `PEAK` | `4m` / `2m` | Үе шатны урт. Нийт ≤ 13 мин (access JWT 15 мин, DD-AURA-006) |
| `SEED_PREFIX` / `SEED_PASSWORD` | `load` / `Load-Test-Nuur-2026` | Тестийн хэрэглэгч (DEV-ийн seed, нууц биш) |
| `SEED_VUS` | `16` | Seed-ийн зэрэгцээ VU |

Жижиг smoke (скрипт ажиллаж байгааг 2 мин-д шалгах):

```bash
k6 run -e COUPLES=20 load/seed.k6.js
k6 run -e COUPLES=20 -e WS_USERS=10 -e STEADY=30s -e PEAK=30s load/aura.k6.js
```

## Үр дүнг унших

- `http_req_duration{scenario:api}` — p95 ≤ 300 ms (`✓`/`✗`). Удаан endpoint-ийг
  `http_req_duration{name:GET /dashboard}` г.м. `name` tag-аар харна (`--summary-export`-ийн JSON).
- `http_req_failed{scenario:api}` < 0.1%; `checks{scenario:api}` — аль endpoint 2xx биш байсныг нэрээр.
- `ws_stomp_connected` — CONNECTED frame авсан холболтын хувь; `ws_stomp_events` — хүлээн авсан
  үйл явдал; `ws_stomp_errors` — STOMP `ERROR` эсвэл сокетын алдаа.
- Setup-ийн нэвтрэлт (Argon2id, DD-AURA-030) босгонд орохгүй — зөвхөн `api` scenario.

### Сүүлийн хэмжилт (2026-11-13, DEV — Windows Docker Desktop, `dev,e2e`)

| Үзүүлэлт | Үр дүн | Босго |
|---|---|---|
| Seed | 1 000 хос, 11 822 хүсэлт, алдаа 0 | `seed_couples_failed == 0` |
| `/api` p95 (4 650 хүсэлт) | **22.8 ms** (p99 30 ms, max 198 ms) | < 300 ms ✓ |
| `/api` алдаа | **0.00%** | < 0.1% ✓ |
| STOMP холболт | 200/200, 1 086 үйл явдал хүлээн авав | > 99% ✓ |
| WS handshake p95 | 13.5 ms | < 1 с ✓ |

DEV машин нь prod-оос (Ampere A1, 4 OCPU) өөр тул үр дүн нь харьцангуй: prod-д ижил скриптийг
ажиллуулахгүй (seed нь `e2e` profile шаардана). 99.5% uptime ба бодит p95-ийг prod-д
`deploy/monitor/alerts.sh` (p95 > 1 с сэрэмжлүүлэг) хянана.
