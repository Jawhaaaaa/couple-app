# Aura — backup ба сэргээлт

NFR-15, AC-151, AC-204, OPS-AURA-004. Зорилт: **RPO ≤ 24 цаг, RTO ≤ 4 цаг** (`docs/OPERATIONS.md` §6).
Скриптүүд: `deploy/backup/`. Cron: `deploy/backup/crontab.example`. VM дээр `/opt/aura`-аас.

| Юу | Хэзээ (Улаанбаатар) | Хаана | Хадгалах |
|---|---|---|---|
| PostgreSQL `pg_dump` (custom format) + мөрийн тооны manifest | Өдөр бүр 03:15 | `BACKUP_DIR/db/aura-<UTC>.dump`, `.counts`; `BACKUP_REMOTE/db` | 30 хоног (`BACKUP_RETENTION_DAYS`) |
| Медиа (SeaweedFS bucket) | Өдөр бүр 03:45 | `<dest>/media/current` (толь) | Одоогийн бүх объект |
| Устсан/солигдсон медиа | sync бүрд | `<dest>/media/deleted/<огноо>/` | 30 хоног |
| Сэргээх тест | Ням гараг 04:30 | Тусдаа DB `aura_restore_test` (тест дуусаад устна) | Төлөв `BACKUP_DIR/status/` |
| `.env.prod` | Өөрчлөх бүрд, гараар | Нууц үгийн менежер (VM-ээс гадна) | — |

`<dest>` = `BACKUP_REMOTE` (жишээ `oracle:aura-backup`), хоосон бол `BACKUP_DIR` (анхдагч
`/var/backups/aura`). Нэг VM-ийн дискэнд л байгаа backup нь VM алга болоход хамт алга болно —
prod-д `BACKUP_REMOTE`-ыг заавал тохируул (§3).

## 1. Шөнийн backup — `deploy/backup/backup.sh`

1. `REPEATABLE READ` транзакц нээж `pg_export_snapshot()` — тэр snapshot дотор хүснэгт бүрийн
   мөрийн тоог `<dump>.counts`-д (`schema.table|count`).
2. `pg_dump --snapshot=<тэр snapshot> -Fc` — тоолсон төлөвтэй яг ижил dump. Тиймээс сэргээх тест
   шөнийн бичилтээс болж худал унахгүй.
3. `pg_restore --list`-ээр dump уншигдаж байгааг шалгаад нэрийг нь эцэслэнэ (`.part` → `.dump`).
4. 30 хоногоос хуучин dump, manifest-ийг устгана.
5. `BACKUP_REMOTE` байвал `rclone copy` (сүүлийн 48 ц-ийн файл) + алсын 30 хоногоос хуучныг устгах.
6. `status/backup.ok` (амжилттай) эсвэл `status/backup.failed`-д мөр нэмнэ →
   `deploy/monitor/alerts.sh`-ийн `backup` дүрэм (> 26 ц эсвэл амжилтгүй бол FIRING).

Гараар (жишээ нь эрсдэлтэй deploy-оос өмнө):

```bash
deploy/backup/backup.sh
ls -lh /var/backups/aura/db | tail -4
```

## 2. Долоо хоног бүрийн сэргээх тест — `deploy/backup/restore-test.sh`

Сүүлийн dump-ийг (эсвэл аргументаар өгсөн) ижил PostgreSQL сервер дээрх **тусдаа DB**
`aura_restore_test`-д `pg_restore --exit-on-error`-оор сэргээж, хүснэгт бүрийн мөрийн тоог dump-ийн
manifest-тай харьцуулна. Ажиллаж буй `aura` DB хөндөгдөхгүй; тест DB төгсгөлд `DROP ... WITH (FORCE)`.

- Тэнцүү → `status/restore-test.ok` (`tables=N rows=M`), exit 0.
- Зөрүү эсвэл `pg_restore` алдаа → зөрүүтэй хүснэгтийн жагсаалт, `status/restore-test.failed`, exit 1.
- 8 хоногоос удаан амжилттай тест байхгүй бол `restore_test` сэрэмжлүүлэг.

```bash
deploy/backup/restore-test.sh                                   # сүүлийн dump
deploy/backup/restore-test.sh /var/backups/aura/db/aura-20261113T191500Z.dump
KEEP_RESTORE_DB=1 deploy/backup/restore-test.sh                 # тест DB-г үлдээж гараар харах
```

**DEV дээр шалгах (AC-151):** `bash deploy/tests/backup-restore.test.sh` — тусгаарласан DEV compose
project (`aura-bt`) дээр postgres асааж, Flyway migration (V1…) + seed хийж, backup-ын үеэр зэрэг
бичилт хийнэ; сэргээсэн DB-ийн мөрийн тоо dump-ийн мөчийнхтэй тэнцүү, manifest-ийг эвдэхэд тест
унах, 30 хоногийн устгалтыг шалгана. `MEDIA=1` — prod compose-ийн SeaweedFS + rclone-оор медиа sync.

## 3. Гадаад хуулбар — Oracle Object Storage (Always Free 20 GB)

1. Console → Storage → Buckets → **Create Bucket** `aura-backup` (Standard, private). Lifecycle
   rule-ийг ашиглахгүй — хадгалах хугацааг скрипт удирдана.
2. Namespace: Console → Tenancy details → **Object storage namespace**.
3. Profile (баруун дээд) → **Customer Secret Keys → Generate Secret Key** — Access Key, Secret-ийг
   хуулна (Secret дахин харагдахгүй).
4. `.env.prod`:

   ```bash
   BACKUP_REMOTE=oracle:aura-backup
   OCI_S3_ENDPOINT=https://<namespace>.compat.objectstorage.<region>.oraclecloud.com
   OCI_REGION=<region>            # жишээ ap-tokyo-1
   OCI_ACCESS_KEY=<access key>
   OCI_SECRET_KEY=<secret>
   ```

5. Шалгах:

   ```bash
   alias dc='docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod'
   dc --profile tools run --rm rclone lsd oracle:aura-backup
   deploy/backup/backup.sh && deploy/backup/media-sync.sh
   dc --profile tools run --rm rclone size oracle:aura-backup
   ```

20 GB-аас хэтэрвэл (Always Free) төлбөр гарна — `rclone size`-оор сар бүр хар. Медиа квот
хос бүрд 10 GB тул олон хостой бол медиаг өөр хавтас/диск (`BACKUP_REMOTE` хоосон + тусдаа block
volume `BACKUP_DIR`) руу шилжүүлэх нь хямд.

## 4. Өгөгдлийн сан сэргээх (бодит сэргээлт)

> Ажиллаж буй DB-г дарна. Эхлээд одоогийн төлөвийг `deploy/backup/backup.sh`-ээр хадгал (боломжтой бол).

```bash
cd /opt/aura
alias dc='docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod'
DUMP=$(ls -1t /var/backups/aura/db/aura-*.dump | head -1)     # эсвэл тодорхой файл
# Гадаадаас татах бол:
#   dc --profile tools run --rm rclone copy oracle:aura-backup/db /backups/db --include "aura-2026111*"

deploy/backup/restore-test.sh "$DUMP"                          # dump бүтэн эсэхийг эхлээд шалга
dc stop backend                                                # бичилтийг зогсоох
dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$DUMP"
dc up -d backend                                               # Flyway шинэ migration байвал хэрэглэнэ
```

Шалгах: `dc logs --tail 50 backend` (Flyway алдаагүй), нэвтэрч хосын нүүр, дурсамж нээх.
Хугацаа: 1 GB dump ≈ 5–10 мин.

## 5. Медиа сэргээх

```bash
# Хавтаснаас (BACKUP_REMOTE хоосон үед):
dc --profile tools run --rm rclone copy /backups/media/current seaweed:aura-media --transfers 8
# Oracle Object Storage-оос:
dc --profile tools run --rm rclone copy oracle:aura-backup/media/current seaweed:aura-media --transfers 8
# Нэг устгагдсан файлыг (жишээ нь өчигдөр устсан):
dc --profile tools run --rm rclone copy oracle:aura-backup/media/deleted/2026-11-12/<key> seaweed:aura-media/<dir>/
```

Bucket-ийг backend эхлэхдээ үүсгэнэ; хоосон шинэ VM дээр эхлээд `dc up -d backend`, дараа нь медиа.
`copy` (sync биш) — сэргээх үед шинэ медиаг устгахгүй.

## 6. Нууцлал ба устгалт

- Dump-д хэрэглэгчийн бүх өгөгдөл (мессеж, захидал) бий: `BACKUP_DIR` нь `ubuntu` хэрэглэгчийн,
  гадаад bucket private. Oracle Object Storage серверийн талд шифрлэгдэнэ.
- Хэрэглэгч/хос устгасан өгөгдөл (INV-16) ажиллаж буй DB-ээс шууд устна; backup-д **30 хоног**
  үлдэж, хугацаа дуусахад dump ба `media/deleted/<огноо>` хамт устна. 30 хоногоос хуучин dump-аас
  сэргээхгүй — устгагдсан өгөгдөл буцаж ирэх эрсдэлтэй.
- `.env.prod`-ийг backup-ын bucket-д бүү хадгал (нууц түлхүүр ба өгөгдөл нэг газар).
