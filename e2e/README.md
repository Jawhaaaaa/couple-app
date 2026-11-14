# Aura E2E (Playwright)

Expo web export дээр утасны профайлаар (Pixel 7 · iPhone 14 · Firefox) ажиллана.
Хоёр хамтрагч = хоёр browser context (`fixtures/twoPartners.ts`). Тестийн нэр AC ID-тай.

```bash
cd mobile && npm run export:web                       # апп + sw.js (scripts/serve-dist.mjs үйлчилнэ, :8091)
SPRING_PROFILES_ACTIVE=dev,e2e docker compose up -d --build   # backend, postgres, seaweedfs, mailpit
cd e2e && npm ci && npx playwright test
```

| Хувьсагч | Анхдагч | Тайлбар |
|---|---|---|
| `E2E_BASE_URL` | — (dist-ийг :8091-д өөрөө үйлчилнэ) | Compose-ийн `mobile-web` (`http://localhost:8090`) г.м. |
| `E2E_API_URL` | `http://localhost:8080` | Backend `dev,e2e` profile (тестийн endpoint, `MutableClock`) |
| `E2E_MAILPIT_URL` | `http://localhost:8025` | Имэйлийн код уншина |
| `AC_COVERAGE_STRICT` | — | `1` бол автомат AC бүр тесттэй байхыг шаардана (T-94) |

- `support/clock.ts` — серверийн (`PUT /test/clock`) ба хөтчийн цагийг нэг утгад тавина.
- `support/seed.ts` — `POST /test/seed`, `POST /test/jobs/{name}/run`.
- `mocks/openMeteo.ts`, `mocks/oauthIdp.ts` — Open-Meteo ба Google OAuth-ийн тестийн IdP (GAP-18).
