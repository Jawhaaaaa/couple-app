<!-- LAB-2 · security-waivers · DEVELOPMENT · 2026-11-18 -->
# Аюулгүй байдлын чөлөөлөлт — PR-ийн тайлбарт заавал оруулна

> **MR_CREATE шатанд:** доорх хүснэгтийг PR-ийн тайлбарт «Аюулгүй байдлын чөлөөлөлт» гарчигтай
> харагдахуйц хуулна (эзний шийдвэр, 2026-11-18, нөхцөл 4).

| Advisory | Багц | Түвшин | Шалтгаан | Эзэн | Дуусах |
|---|---|---|---|---|---|
| [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (CVE-2026-112366) | `picomatch` 4.0.7, 2.3.2 (mobile/ — Metro, Jest, Expo-ийн шууд бус хамаарал) | high (ReDoS) | Засвартай хувилбар алга (<=4.0.7 бүгд эмзэг). Metro/Jest/Expo-ийн гүн dev/build хамаарал. Base commit 355c35c дээр ч унадаг. | Jawhaaaaa | 2026-12-18 |

## Хэрхэн ажилладаг
- Бүртгэл: `compliance.yaml → waivers`.
- CI-ийн `dependency audit` job нь `npm audit --audit-level=high`-ийн оронд
  `node scripts/audit-gate.mjs <mobile|e2e>`-ийг дуудна. Босго ижил: high/critical advisory бүр унагана.
  Зөвхөн бүртгэлтэй GHSA id-г чөлөөлнө; бусад бүх high/critical унагасаар байна.
- Чөлөөлөлт автоматаар хүчингүй болох нөхцөл (audit дахин унана):
  1. `expires` өдөр (UTC, тухайн өдрийг оруулаад) өнгөрөх — 2026-12-19-өөс эхлэн.
  2. GitHub Advisory API-д `first_patched_version` гарах — засвартай хувилбар гарсан.
  3. GitHub Advisory API хариу өгөхгүй (fail closed).
- Шалгалт: `node --test scripts/audit-gate.test.mjs` (11 тест — хугацаа, засвар, өөр high/critical,
  moderate, API алдаа) CI-ийн audit job-д gate-ээс өмнө ажиллана. CI-ийн лог чөлөөлөлт бүрийг
  `::warning::ЧӨЛӨӨЛӨЛТ …`-ээр (эзэн, дуусах огноо, үлдсэн хоног) харуулна.

## Чөлөөлөлтийг хаах
`picomatch`-ийн засвартай хувилбар гармагц audit унана. Тэр үед `npx expo install --fix` /
`npm update picomatch`-оор хамаарлыг шинэчилж, `compliance.yaml`-аас бичлэгийг устгана.
