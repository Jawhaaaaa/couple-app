// 1 000 хос seed (T-93, AC-150). Backend `SPRING_PROFILES_ACTIVE=dev,e2e` (`/api/v1/test/mail/last`).
// Хос i: `${SEED_PREFIX}-${i}-a@load.aura.test` ба `-b@`, нууц үг SEED_PASSWORD. Дахин ажиллуулахад
// аль хэдийн холбогдсон хосыг алгасна (idempotent) — `aura.k6.js` ижил имэйлээр нэвтэрнэ.
//
//   k6 run -e BASE_URL=http://localhost:8080 -e COUPLES=1000 load/seed.k6.js
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { API, COUPLES, authHeaders, emailOf, link, login, policyVersion, registerVerified } from './lib/aura.js';

const created = new Counter('seed_couples_created');
const existing = new Counter('seed_couples_existing');
const failed = new Counter('seed_couples_failed');

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: Number(__ENV.SEED_VUS || 16),
      iterations: COUPLES,
      maxDuration: '60m',
    },
  },
  thresholds: {
    seed_couples_failed: ['count==0'],
  },
  summaryTrendStats: ['avg', 'p(95)', 'max'],
};

export function setup() {
  return { policy: policyVersion() };
}

function ensureUser(email, name, policy) {
  // Шинэ хэрэглэгчид эхний нэвтрэлт 401 — хүлээгдэх хариу (http_req_failed-д тоолохгүй)
  return login(email, { name: 'seed' }, http.expectedStatuses(200, 401)) || registerVerified(email, name, policy);
}

export default function (data) {
  const i = exec.scenario.iterationInTest; // 0 … COUPLES-1, VU хооронд давхцахгүй
  const a = ensureUser(emailOf(i, 'a'), `Ачаалал ${i}A`, data.policy);
  const b = ensureUser(emailOf(i, 'b'), `Ачаалал ${i}B`, data.policy);
  if (!a || !b) {
    failed.add(1);
    return;
  }
  const couple = http.get(`${API}/couple`, authHeaders(a, { tags: { name: 'seed' } }));
  if (couple.status === 200 && couple.json('kind') === 'COUPLE') {
    existing.add(1);
    return;
  }
  if (link(a, b)) created.add(1);
  else failed.add(1);
}

