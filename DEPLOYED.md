# DEPLOYED — DEV орчны хаягууд (AC-58)

> ЗАГВАР. DEV_DEPLOY-ийн дараа `<…>`-ийг бодит утгаар бөглөнө. Нууц утга (нууц үг, token) энд бичихгүй.
> Prod-ийн хаяг ба ажиллагаа: `docs/OPERATIONS.md`.

| Юу | Хаяг | Тэмдэглэл |
|---|---|---|
| Татах хуудас (S-99) | `http://<LAN_IP>:8099` | APK QR, Expo Go QR, PWA хаяг, заавар |
| APK | `http://<LAN_IP>:8099/aura-<хувилбар>.apk` | Android 7.0+; `version.json`-д бүтэн URL |
| Expo Go (Metro) | `exp://<LAN_IP>:8081` | iPhone: App Store-ийн Expo Go (SDK 58). Порт эзлэгдсэн бол `.env`-ийн `METRO_PORT` |
| PWA (вэб апп) | `http://<LAN_IP>:8090` | Safari «Нүүр дэлгэцэнд нэмэх» / Chrome «Апп суулгах» |
| API | `http://<LAN_IP>:8080` | `/actuator/health` → `UP` |
| Mailpit (имэйлийн код) | `http://<LAN_IP>:8025` | |

| Мэдээлэл | Утга |
|---|---|
| Хувилбар | `<1.0.0>` (build `<dev>`, commit `<sha>`) |
| Огноо | `<YYYY-MM-DD HH:MM>` |
| DEV машин | `<нэр / OS>`, LAN_IP `<192.168.x.x>` |

## Асаах

```bash
cp .env.example .env            # POSTGRES_PASSWORD, AURA_JWT_SECRET, LAN_IP=<энэ машины LAN IP>
# Утсаар туршихад backend/медиа/CORS LAN хаягаар:
#   EXPO_PUBLIC_API_URL=http://<LAN_IP>:8080   AURA_S3_PUBLIC_ENDPOINT=http://<LAN_IP>:8333
#   AURA_CORS_ALLOWED_ORIGINS=http://localhost:8090,http://<LAN_IP>:8090   AURA_WEB_BASE_URL=http://<LAN_IP>:8090
docker compose up -d --build                                     # backend, postgres, seaweedfs, mailpit, PWA
docker compose --profile devbuild up -d --build expo-dev download   # Metro (Expo Go) + S-99
docker compose --profile devbuild run --rm expo-dev apk          # APK build → S-99 шинэчлэгдэнэ (анх 20–40 мин)
```

- LAN IP: Windows `ipconfig` (Wi-Fi адаптерийн IPv4), macOS `ipconfig getifaddr en0`, Linux `hostname -I`.
- Windows-д firewall 8080, 8081, 8090, 8099, 8333 портыг «Private» сүлжээнд зөвшөөрнө.
- `node_modules` нь контейнерийн volume (`expo-node-modules`), APK-ийн `android/` нь контейнер доторх `/build/mobile`-д — хостын
  binary-тай холилдохгүй. Хостын `mobile/` дотор хоосон `node_modules/` mount хавтас
  үүсч болно (gitignore-д орсон). Цэвэрлэх: `docker compose --profile devbuild down -v`.
- DEV APK нь Expo-гийн debug keystore-оор гарын үсэгтэй, LAN-ийн `http` backend-т хүрэхийн тулд
  cleartext зөвшөөрсөн — зөвхөн туршилтад. Store-ийн build: EAS (`docs/RELEASE.md`, T-88).
- Утас DEV машинтай нэг Wi-Fi-д (GAP-10). `http` дээр Web Push, Google нэвтрэлт, passkey ажиллахгүй (GAP-04).

## Шалгах

```bash
curl -s http://<LAN_IP>:8099/version.json               # хувилбар, apkUrl, expoUrl, pwaUrl
curl -sI http://<LAN_IP>:8099/aura-<хувилбар>.apk | head -1   # 200
cd e2e && E2E_DOWNLOAD_URL=http://<LAN_IP>:8099 npx playwright test tests/download-page.spec.ts
```

Утсан дээрх гараар шалгалт: AC-59 (APK), AC-60 (Expo Go) — `docs/MANUAL-TEST.md`.
