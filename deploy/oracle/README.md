# Oracle Cloud Always Free дээр Aura байршуулах (T-90, AC-163)

Дараалал: **Oracle бүртгэл → VM → security list + iptables → Docker → DuckDNS → `.env.prod` →
`deploy.sh` → backup cron → шалгах**. `$` тэмдэггүй блок бүрийг хуулж ажиллуулна. VM дээрх
командууд `ubuntu` хэрэглэгчээр, репо `/opt/aura`-д.

Үр дүн: `https://<subdomain>.duckdns.org` — Caddy (Let's Encrypt), backend, PostgreSQL 16,
SeaweedFS, PWA. Ажиллагаа, сэрэмжлүүлэг, Always Free-ийн эрсдэл: [`docs/OPERATIONS.md`](../../docs/OPERATIONS.md).
Backup: [`docs/BACKUP.md`](../../docs/BACKUP.md).

## 1. Oracle Cloud бүртгэл

1. <https://signup.cloud.oracle.com> → бүртгүүлэх. Карт шаардана (баталгаажуулах түр гүйлгээ,
   Always Free нөөцөд төлбөр гарахгүй).
2. **Home Region**-оо бодолцож сонго — дараа солих боломжгүй, Always Free A1 зөвхөн тэнд.
   Ойрын, A1 багтаамж ихтэй бүс: `ap-tokyo-1`, `ap-seoul-1`, `ap-singapore-1`.
3. (Зөвлөмж) Бүртгэлийг **Pay As You Go** болгох: Billing → Upgrade and Manage Payment. Always
   Free нөөц үнэгүй хэвээр, сул instance буцаах бодлого (idle reclamation) хамаарахгүй болно.
   Төсвийн сэрэмжлүүлэг заавал: Billing → Budgets → Create Budget, $1, 100%-д имэйл.
   Шалтгаан ба эрсдэл — `docs/OPERATIONS.md` §7.

## 2. VM үүсгэх

Console → **Compute → Instances → Create instance**:

| Талбар | Утга |
|---|---|
| Image | Canonical **Ubuntu 24.04** (aarch64) |
| Shape | Ampere → **VM.Standard.A1.Flex**, 4 OCPU, 24 GB (Always Free-ийн бүх хязгаар) |
| Networking | Шинэ VCN + public subnet, **Assign a public IPv4 address** |
| SSH keys | Өөрийн нийтийн түлхүүр (`~/.ssh/id_ed25519.pub`) |
| Boot volume | 100 GB (Always Free нийт 200 GB) |

«Out of capacity» гарвал өөр Availability Domain сонгох эсвэл хэдэн цагийн дараа дахин оролд.

Нийтийн IP-г (Instance details → Public IP address) тэмдэглээд холбогдоно:

```bash
ssh ubuntu@<PUBLIC_IP>
```

## 3. Порт нээх — security list + iptables (OPS-AURA-001)

Хоёр давхарга хоёуланг нь нээнэ; аль нэг нь хаалттай бол Let's Encrypt гэрчилгээ авч чадахгүй.

**3a. Security list (Oracle-ийн сүлжээ).** Console → Networking → Virtual Cloud Networks → VCN →
Subnet → Security List → **Add Ingress Rules** (Source CIDR `0.0.0.0/0`):

| IP Protocol | Destination Port | Тайлбар |
|---|---|---|
| TCP | 80 | HTTP (ACME challenge, HTTPS руу redirect) |
| TCP | 443 | HTTPS |
| UDP | 443 | HTTP/3 (сонголтот) |

**3b. iptables (VM дотор).** Oracle-ийн Ubuntu image нь 22-оос бусад бүх портыг `REJECT`-ээр
хаадаг. REJECT мөрийн өмнө оруулж, хадгална:

```bash
pos=$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')
sudo iptables -I INPUT "$pos" -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT "$pos" -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT "$pos" -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers | head -12
```

`ufw`-г асаахгүй — Oracle-ийн дүрэм ба Docker-ийн дүрэмтэй зөрчилдөнө.

## 4. Docker ба хэрэгслүүд

```bash
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y git curl python3 ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
sudo timedatectl set-timezone UTC
exit
```

Дахин холбогдоод (docker бүлэг идэвхжинэ) шалга:

```bash
ssh ubuntu@<PUBLIC_IP>
docker version --format '{{.Server.Arch}}'   # arm64
docker compose version
```

Репо:

```bash
sudo mkdir -p /opt/aura && sudo chown ubuntu:ubuntu /opt/aura
git clone https://github.com/Jawhaaaaa/couple-app.git /opt/aura
cd /opt/aura && git checkout main
```

## 5. DuckDNS (OPS-AURA-002)

1. <https://www.duckdns.org> → GitHub/Google-ээр нэвтрэх → дэд домэйн нэмэх (жишээ `aura-example`),
   **current ip**-д VM-ийн нийтийн IP. Хуудасны дээд хэсгийн **token**-ийг хуул.
2. `.env.prod`-д `DUCKDNS_SUBDOMAIN`, `DUCKDNS_TOKEN` бичсэний дараа (6-р алхам) шалга ба cron
   тавина (8-р алхам):

```bash
/opt/aura/deploy/duckdns-update.sh     # → "... duckdns aura-example OK"
getent hosts aura-example.duckdns.org  # VM-ийн нийтийн IP
```

## 6. `.env.prod`

```bash
cd /opt/aura
cp .env.prod.example .env.prod && chmod 600 .env.prod
# Санамсаргүй нууц утга үүсгэх:
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "AURA_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "AURA_S3_ACCESS_KEY=$(openssl rand -hex 12)"
echo "AURA_S3_SECRET_KEY=$(openssl rand -hex 24)"
# VAPID (OPS-AURA-003) — нэг удаа үүсгэнэ, дараа солихгүй:
docker run --rm node:22-alpine npx -y web-push generate-vapid-keys
nano .env.prod
```

Заавал солих: `DUCKDNS_*`, `AURA_DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`, `AURA_JWT_SECRET`,
`AURA_S3_ACCESS_KEY`, `AURA_S3_SECRET_KEY`, `SPRING_MAIL_*`, `AURA_MAIL_FROM`, `AURA_VAPID_*`,
`AURA_ADMIN_EMAILS`. Google нэвтрэлт хэрэгтэй бол `AURA_GOOGLE_*` (redirect URI:
`https://<AURA_DOMAIN>/api/v1/auth/oauth/google/callback`). `deploy.sh` нь `change-me` үлдсэн бол
зогсоно.

Шалга:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod config -q && echo OK
```

## 7. Анхны deploy

```bash
cd /opt/aura
SKIP_PULL=1 deploy/deploy.sh
```

Анхны build (Maven, npm — arm64 дээр native) 10–15 мин. Caddy гэрчилгээг эхний HTTPS хүсэлтээр
авна; `docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod logs caddy | grep -i certificate`.

## 8. Cron — DuckDNS, backup, сэрэмжлүүлэг, лог

```bash
sudo mkdir -p /var/log/aura /var/backups/aura /var/lib/aura-alerts
sudo chown ubuntu:ubuntu /var/log/aura /var/backups/aura /var/lib/aura-alerts
crontab /opt/aura/deploy/backup/crontab.example
crontab -l
```

`deploy/backup/crontab.example`: DuckDNS 5 мин тутам, `pg_dump` шөнө бүр 03:15 UTC, медиа sync
03:45, сэргээх тест ням гариг 04:30, сэрэмжлүүлэг 5 мин тутам, лог архив 00:05. Oracle Object
Storage руу гадаад хуулбар — `docs/BACKUP.md` §3.

Нэг удаа гараар ажиллуулж шалга:

```bash
cd /opt/aura
deploy/backup/backup.sh && deploy/backup/restore-test.sh
deploy/monitor/alerts.sh
```

## 9. Шалгах

```bash
D=$(grep ^AURA_DOMAIN= /opt/aura/.env.prod | cut -d= -f2)
curl -sI "https://$D/" | head -1                          # HTTP/2 200 — PWA
curl -s "https://$D/memories/1" | grep -c '<div id="root"' # 1 — SPA fallback (try_files)
curl -s -o /dev/null -w '%{http_code}\n' "https://$D/actuator/health"   # 404 — гаднаас хаалттай
curl -s -o /dev/null -w '%{http_code}\n' "https://$D/api/v1/me"         # 401 — backend хүрч байна
curl -s -o /dev/null -w '%{http_code}\n' "https://$D/aura-media/x"      # 403 — bucket private
curl -sI "http://$D/" | grep -i '^location'               # https:// руу redirect
docker compose -f /opt/aura/deploy/docker-compose.prod.yml --env-file /opt/aura/.env.prod ps
```

Утсан дээр: Safari/Chrome-оор `https://<AURA_DOMAIN>` → бүртгэл (SMTP-ийн код ирнэ) → «Нүүр
дэлгэцэнд нэмэх» → мэдэгдэл зөвшөөрөх (Web Push, VAPID). Гараар шалгах дэлгэрэнгүй:
`docs/MANUAL-TEST.md` (AC-51, AC-159).
