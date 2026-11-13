# Aura — ажиллагааны гарын авлага (PROD)

Хамрах: Oracle Cloud Always Free Ampere A1 (linux/arm64) дээрх нэг VM. Анхны суулгалт:
[`deploy/oracle/README.md`](../deploy/oracle/README.md). Backup ба сэргээлт: [`docs/BACKUP.md`](BACKUP.md).
Танигч: OPS-AURA-001…006 (LLD §4.5), AC-163, AC-202, AC-218.

Бүх команд VM дээр `/opt/aura`-аас; товчлол:

```bash
cd /opt/aura
alias dc='docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod'
```

## 1. Бүтэц

| Үйлчилгээ | Image | Үүрэг |
|---|---|---|
| `caddy` | `caddy:2` | 80/443, Let's Encrypt автомат HTTPS. `/api/*`, `/ws` → backend; `/<bucket>/*` → seaweedfs (presigned URL); бусад → SPA (`try_files {path} /index.html`). `/actuator/*`, `/api/v1/test/*` гаднаас 404 |
| `backend` | root `Dockerfile` (VM дээр arm64 build) | Spring Boot, `SPRING_PROFILES_ACTIVE=prod`, JSON лог |
| `postgres` | `postgres:16` | `pgdata` volume, порт гадагш нээгдээгүй |
| `seaweedfs` | `chrislusf/seaweedfs:3.97` | S3 медиа, `seaweed` volume. Identity нь `.env.prod`-оос эхлэхдээ үүснэ |
| `mobile-web` | `mobile/Dockerfile` | Нэг удаагийн: Expo web export-ийг `web` volume руу хуулаад гарна (`Exited (0)` — хэвийн) |
| `rclone` | `rclone/rclone:1.71` | profile `tools`, зөвхөн backup скрипт дуудна |

Файлууд: `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`, `.env.prod` (сервер дээр л, 600),
`deploy/deploy.sh`, `deploy/duckdns-update.sh`, `deploy/monitor/*.sh`, `deploy/backup/*.sh`.

## 2. Асаах, зогсоох

```bash
dc up -d                 # бүгдийг асаах (build аль хэдийн хийгдсэн бол)
dc ps                    # төлөв — backend, postgres, seaweedfs, caddy: healthy
dc restart backend       # нэг үйлчилгээ
dc stop                  # бүгдийг зогсоох (volume хэвээр)
```

VM дахин ачаалахад Docker `restart: unless-stopped`-оор бүгдийг асаана (`web` volume хадгалагдсан
тул `mobile-web` дахин ажиллах шаардлагагүй).

**Хэзээ ч бүү:** `dc down -v` — `pgdata`, `seaweed` volume устна.

## 3. Шинэчлэх (AC-218 — зогсолт ≤ 1 мин)

```bash
deploy/deploy.sh
```

Алхам: `.env.prod`-д placeholder үлдсэн эсэх → `git pull --ff-only` → `config -q` → `build --pull`
(хуучин контейнер ажилласаар) → `up -d` (өөрчлөгдсөн контейнер л солигдоно) → backend healthy
хүлээх (≤ 180 с) → `https://<домэйн>/` 200 → хуучин image цэвэрлэх. Скрипт солих хугацааг
хэвлэнэ; 60 с-ээс урт бол «АНХААР» мөр гарна. Хэвийн үед backend-ийн солилт 30–45 с (graceful
shutdown + Spring эхлэлт); Caddy, PostgreSQL, SeaweedFS өөрчлөгдөөгүй бол хөндөгдөхгүй. Flyway
migration эхлэлтэд ажиллана — урт migration-тай хувилбарыг ачаалал багатай цагт гарга.

**Буцаах (rollback):**

```bash
git log --oneline -5
git checkout <өмнөх-sha>
SKIP_PULL=1 deploy/deploy.sh
git checkout main          # дараагийн deploy-оос өмнө
```

Flyway migration буцдаггүй: шинэ migration схемийг эвдэх өөрчлөлт хийсэн бол `docs/BACKUP.md` §4-өөр
deploy-оос өмнөх dump-аас сэргээнэ. Тиймээс эрсдэлтэй deploy-оос өмнө `deploy/backup/backup.sh`.

**arm64 build x86 машин дээр (RSK-AURA-006).** VM дээр build native. Өөр машинд урьдчилж шалгах:

```bash
docker buildx build --platform linux/arm64 -t aura-backend:arm64 .
docker buildx build --platform linux/arm64 -t aura-mobile-web:arm64 mobile
```

QEMU-гээр удаан (backend 15–30 мин). Image-ийн arm64 дэмжлэг: `deploy/tests/prod-config.test.sh`.

## 4. Лог (OPS-AURA-006)

```bash
dc logs -f --tail 200 backend          # JSON мөр (logstash encoder, traceId)
dc logs --since 1h caddy | grep '"status":5'
dc logs --since 30m backend | python3 -c 'import sys,json
for l in sys.stdin:
    try: e=json.loads(l)
    except ValueError: continue
    if e.get("level") in ("ERROR","WARN"): print(e["@timestamp"], e["level"], e.get("traceId",""), e["message"])'
```

- Хадгалалт: Docker `json-file`, үйлчилгээ бүр 10 × 20 MB (`x-logging`). Үүнээс гадна
  `deploy/monitor/log-archive.sh` өдөр бүр өмнөх өдрийн логийг `/var/log/aura/archive/` руу gzip-ээр
  хадгалж **30 хоногоос** хуучныг устгана.
- Лог дотор мессеж, захидал, хариултын текст, нууц үг, токен бичигдэхгүй (AC-196, INV-11); Caddy
  presigned URL-ийн `X-Amz-Signature`-г далдална.
- Хэрэглэгчийн хүсэлтийг backend-ийн `traceId`-аар мөрдөнө.

## 5. Сэрэмжлүүлэг (OPS-AURA-005, AC-202)

`deploy/monitor/alerts.sh` 5 мин тутам (cron) шалгаж, төлөв өөрчлөгдөхөд syslog (`aura-alert`) ба
`ALERT_WEBHOOK_URL` (жишээ нь ntfy.sh-ийн нууц сэдэв — утсанд push) руу илгээнэ. FIRING хэвээр бол
цаг тутам давтана.

| Дүрэм | Нөхцөл | Эх | Анхны алхам |
|---|---|---|---|
| `http_5xx` | Сүүлийн 5 мин-д 5xx > 1% (≥ 20 хүсэлт) | Caddy access log | `dc logs --since 10m backend` — ERROR; 502 бол backend унасан/дахин асаж байна (§8) |
| `http_p95` | Сүүлийн 5 мин-д `/api/*` p95 > 1 с (`/ws`, chunk upload хасагдана) | Caddy access log `duration` | `docker stats`; PostgreSQL удаан query (§8); GC лог |
| `disk` | `/`, `/var/lib/docker`, `BACKUP_DIR` аль нэг > 80% | `df` | `docker system df`; `docker image prune -a`; хуучин dump/архив; boot volume томсгох (§8) |
| `backup` | Сүүлийн амжилттай `pg_dump` > 26 ц эсвэл сүүлийн оролдлого амжилтгүй | `BACKUP_DIR/status/` | `tail /var/log/aura/backup.log`; гараар `deploy/backup/backup.sh` |
| `restore_test` | Амжилттай сэргээх тест > 8 хоног | `BACKUP_DIR/status/` | `tail /var/log/aura/restore-test.log` — мөрийн тоо зөрсөн бол dump-д итгэхгүй, яаралтай шалга |
| `backend` | Контейнер healthy биш | `docker inspect` | `dc logs --tail 200 backend`, `dc up -d backend` |

Гараар: `deploy/monitor/alerts.sh` — FIRING/RESOLVED мөр хэвлэнэ. Metric: `dc exec backend wget
-qO- localhost:8080/actuator/prometheus` (гаднаас хаалттай), Caddy — `dc exec caddy wget -qO-
localhost:2019/metrics`.

## 6. Сэргээх зорилт — RPO ≤ 24 ц, RTO ≤ 4 ц (NFR-14, NFR-15)

- **RPO ≤ 24 цаг:** `pg_dump` шөнө бүр 03:15 (Улаанбаатар, 19:15 UTC) + медиа sync 03:45, гадаад хуулбар Oracle
  Object Storage-д. Хамгийн муу тохиолдолд сүүлийн dump-аас хойших ≤ 24 цагийн өгөгдөл алдагдана.
- **RTO ≤ 4 цаг** — VM бүхэлдээ алга болсон тохиолдлын дараалал (хэмжсэн төсөв):

| Алхам | Хугацаа | Заавар |
|---|---|---|
| 1. Шинэ VM, порт, Docker | 30 мин | `deploy/oracle/README.md` §2–4 |
| 2. DuckDNS-ийг шинэ IP руу | 5 мин | README §5 (`duckdns-update.sh`) |
| 3. `.env.prod` сэргээх | 10 мин | Нууц менежерээс (1Password г.м.) — `.env.prod`-ийн хуулбарыг VM-ээс гадна заавал хадгал |
| 4. Build + асаах | 20 мин | `SKIP_PULL=1 deploy/deploy.sh` |
| 5. DB сэргээх | 15–30 мин | `docs/BACKUP.md` §4 |
| 6. Медиа сэргээх | 30–90 мин | `docs/BACKUP.md` §5 (хэмжээнээс хамаарна) |
| 7. Шалгах | 15 мин | README §9, нэвтрэх → хос → дурсамж нээх |

Нийт ≈ 2–3.5 цаг. `.env.prod` алга бол JWT secret солигдож бүх хэрэглэгч дахин нэвтэрнэ; VAPID
солигдвол push subscription бүр шинээр бүртгэгдэх хэрэгтэй — тиймээс `.env.prod`-ийн хуулбар нь
backup-ын нэг хэсэг.

## 7. Always Free-ийн эрсдэл: сул instance буцаах

Oracle нь Always Free compute instance-ийг 7 хоногийн турш **сул** байвал буцааж авч (stop) болно.
Сул гэж: CPU-ийн 95-р перцентиль < 20%, сүлжээ < 20%, санах ой < 20% (A1-д) — гурвуулаа. Хос
хэрэглэгчтэй жижиг апп энэ босгоос доогуур байх нь хэвийн.

**Сонголт — Pay As You Go руу шилжих (зөвлөмж).** Billing → Upgrade and Manage Payment. Always
Free хязгаар (4 OCPU, 24 GB, 200 GB диск, 10 TB гарах урсгал) дотор төлбөр гарахгүй, idle
reclamation хамаарахгүй. Эрсдэл: хязгаараас хэтэрсэн нөөц (2 дахь VM, том диск) төлбөртэй —
Budgets-д $1 сэрэмжлүүлэг тавина, нөөцийг Always Free тэмдэгтэйг шалгаж үүсгэнэ.

**Хийхгүй:** CPU/санах ойг хиймэл ачааллаар (stress, crypto miner, «keep-alive» скрипт) дүүргэх.
Oracle-ийн нөхцөлийг тойрох оролдлого бөгөөд бүртгэл хаагдах эрсдэлтэй, нөөц үрнэ.

**Буцаагдсан бол сэргээх:**

1. Console → Compute → Instances — төлөв `Stopped` бол **Start**. Boot volume, нийтийн IP (reserved
   биш бол өөрчлөгдөж болно) хадгалагдана.
2. IP өөрчлөгдсөн бол: `deploy/duckdns-update.sh` (cron 5 мин дотор өөрөө хийнэ).
3. `dc ps` — `restart: unless-stopped`-оор бүгд асна. README §9-ийн шалгалт.
4. Instance устсан бол — §6-ийн бүтэн сэргээлт (Object Storage дахь backup-аас).
5. Давтагдахгүйн тулд Pay As You Go руу шилжинэ.

Нийтийн IP-г тогтмол болгох: Networking → Reserved Public IPs (Always Free-д 1 багтана) → VNIC-д
онооно.

## 8. Түгээмэл саатал

| Шинж | Шалтгаан | Шийдэл |
|---|---|---|
| HTTPS гэрчилгээ авахгүй, `dc logs caddy`-д `challenge failed` | 80/443 хаалттай (security list эсвэл iptables), DuckDNS буруу IP | README §3, `getent hosts <домэйн>`, `curl -I http://<домэйн>` гаднаас |
| Let's Encrypt `rateLimited` | Олон удаа дахин оролдсон | 1 цаг хүлээ; `caddy_data` volume-ийг бүү устга |
| 502 Bad Gateway | backend эхэлж байна эсвэл унасан | `dc ps`, `dc logs --tail 200 backend`; DB холболт, `AURA_JWT_SECRET` < 32 байт |
| Зураг/видео ачаалахгүй (403) | Presigned URL-ийн хугацаа (15 мин) дууссан — client дахин авна; эсвэл `AURA_DOMAIN` өөрчлөгдсөн | Байнга бол `dc logs seaweedfs`, сервер цаг (`timedatectl`) |
| Имэйлийн код ирэхгүй | SMTP нэвтрэлт, өдрийн хязгаар, spam | `dc logs backend \| grep -i mail`; `SPRING_MAIL_*`; илгээгчийн домэйн SPF |
| Web Push ирэхгүй | VAPID хоосон/солигдсон, iOS < 16.4, PWA суулгаагүй (iOS) | `.env.prod`-ийн `AURA_VAPID_*`; iOS-д «Нүүр дэлгэцэнд нэмэх» шаардлагатай |
| WebSocket тасраад байна | Caddy reload, backend солилт | Client өөрөө дахин холбогдоно; байнга бол `dc logs caddy \| grep /ws` |
| Диск дүүрсэн | Image, лог, dump | `docker system df`, `docker image prune -a -f`, `BACKUP_RETENTION_DAYS`; Console-оор boot volume томсгоод `sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1` |
| Удаан (p95 > 1 с) | Индексгүй query, санах ой | `dc exec postgres psql -U aura -c "select query, calls, mean_exec_time from pg_stat_statements order by 3 desc limit 10"` (pg_stat_statements идэвхжүүлсэн бол), `docker stats` |
| VM «Out of capacity» (шинээр үүсгэхэд) | A1 багтаамж дууссан | Өөр AD, өөр цагт; Pay As You Go бүртгэлд багтаамж илүү олддог |
