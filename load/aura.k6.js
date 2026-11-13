// Aura ачааллын тест (T-93, AC-150, NFR-13, NFR-01) — DEV орчин, зорилтот ачааллын 1/10:
//   1 000 хос (seed.k6.js), 200 зэрэг WebSocket (STOMP /ws), REST дундаж 5 req/s, оргил 20 req/s.
// Босго (thresholds.json): /api p95 < 300 ms, алдаа < 0.1%, STOMP холболт > 99%.
//
//   k6 run -e BASE_URL=http://localhost:8080 load/aura.k6.js
//
// Хувьсагч: COUPLES (1000), WS_USERS (200), AVG_RPS (5), PEAK_RPS (20), STEADY ('4m'), PEAK ('2m'),
// SEED_PREFIX, SEED_PASSWORD (seed.k6.js-тэй ижил), ORIGIN (WebSocket Origin — CORS жагсаалтад байх).
import http from 'k6/http';
import ws from 'k6/ws';
import exec from 'k6/execution';
import { check, fail, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import {
  API, BASE_URL, COUPLES, ORIGIN, WS_URL,
  assertReachable, authHeaders, emailOf, stompCommands, stompFrame, uuidv4,
} from './lib/aura.js';

const THRESHOLDS = JSON.parse(open('./thresholds.json'));

const WS_USERS = Number(__ENV.WS_USERS || 200);
const AVG_RPS = Number(__ENV.AVG_RPS || 5);
const PEAK_RPS = Number(__ENV.PEAK_RPS || 20);
const STEADY = __ENV.STEADY || '4m';
const PEAK = __ENV.PEAK || '2m';

const seconds = (d) => {
  const m = /^(\d+)(s|m)$/.exec(d);
  if (!m) throw new Error(`Хугацааны формат буруу: ${d} (жишээ 30s, 4m)`);
  return Number(m[1]) * (m[2] === 'm' ? 60 : 1);
};
// Дундаж → оргил руу 30 с, оргил, буцах 30 с, дахин дундаж 1 мин
const API_STAGES = [
  { target: AVG_RPS, duration: STEADY },
  { target: PEAK_RPS, duration: '30s' },
  { target: PEAK_RPS, duration: PEAK },
  { target: AVG_RPS, duration: '30s' },
  { target: AVG_RPS, duration: '1m' },
];
const TOTAL_S = API_STAGES.reduce((s, st) => s + seconds(st.duration), 0);
// Access JWT 15 мин (DD-AURA-006); setup-д нэвтэрсэн токен тест дуустал хүчинтэй байх ёстой
if (TOTAL_S > 13 * 60) throw new Error(`Нийт ${TOTAL_S} с > 13 мин — access token дуусна; STEADY/PEAK-ийг богиносго`);
if (WS_USERS > COUPLES * 2) throw new Error('WS_USERS > хэрэглэгчийн тоо');

const wsConnected = new Rate('ws_stomp_connected');
const wsEvents = new Counter('ws_stomp_events');
const wsErrors = new Counter('ws_stomp_errors');

export const options = {
  setupTimeout: '15m',
  scenarios: {
    ws: {
      executor: 'per-vu-iterations',
      exec: 'wsClient',
      vus: WS_USERS,
      iterations: 1,
      maxDuration: `${TOTAL_S + 120}s`,
    },
    api: {
      executor: 'ramping-arrival-rate',
      exec: 'apiRequest',
      startRate: AVG_RPS,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: API_STAGES,
      startTime: '15s', // WebSocket-ууд холбогдсоны дараа
    },
  },
  thresholds: THRESHOLDS,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// --- setup: 1 000 хосын 2 000 хэрэглэгч нэвтэрнэ (зэрэгцээ, 25-аар) -----------------------------
export function setup() {
  assertReachable();
  const emails = [];
  for (let i = 0; i < COUPLES; i++) emails.push(emailOf(i, 'a'), emailOf(i, 'b'));
  const tokens = [];
  for (let off = 0; off < emails.length; off += 25) {
    const batch = emails.slice(off, off + 25).map((email) => ({
      method: 'POST',
      url: `${API}/auth/login`,
      body: JSON.stringify({ email, password: __ENV.SEED_PASSWORD || 'Load-Test-Nuur-2026', device: { name: 'k6', platform: 'WEB' } }),
      params: { headers: { 'Content-Type': 'application/json' }, tags: { name: 'setup login' } },
    }));
    for (const r of http.batch(batch)) {
      if (r.status !== 200) fail(`Нэвтрэлт ${r.status} — эхлээд seed: k6 run -e COUPLES=${COUPLES} load/seed.k6.js`);
      tokens.push(r.json('accessToken'));
    }
  }
  // tokens[2i] — хос i-ийн A, tokens[2i+1] — B
  return { tokens };
}

// --- REST: дундаж 5, оргил 20 req/s. Нэг iteration = нэг хүсэлт --------------------------------
const WS_COUPLES = Math.ceil(WS_USERS / 2);

function pickUser(tokens) {
  // Хагас нь WebSocket-тэй хосоос — мессеж/дохио нь хамтрагчийн /user/queue/events руу бодитоор очно
  const couple = Math.random() < 0.5 ? Math.floor(Math.random() * WS_COUPLES) : Math.floor(Math.random() * COUPLES);
  return tokens[couple * 2 + (Math.random() < 0.5 ? 0 : 1)];
}

// Апп нээх үеийн бодит холимог (S-20 нүүр, чат, дурсамж, дохио, мэдэгдэл)
const MIX = [
  [25, 'GET /dashboard', (t) => http.get(`${API}/dashboard?tz=Asia%2FUlaanbaatar`, authHeaders(t, { tags: { name: 'GET /dashboard' } }))],
  [20, 'GET /messages', (t) => http.get(`${API}/messages?limit=30`, authHeaders(t, { tags: { name: 'GET /messages' } }))],
  [15, 'POST /messages', (t) => http.post(`${API}/messages`,
    JSON.stringify({ clientMessageId: uuidv4(), kind: 'TEXT', text: 'k6 ачааллын мессеж' }),
    authHeaders(t, { tags: { name: 'POST /messages' } }))],
  [10, 'GET /memories', (t) => http.get(`${API}/memories?limit=20`, authHeaders(t, { tags: { name: 'GET /memories' } }))],
  [10, 'GET /signals/unseen', (t) => http.get(`${API}/signals/unseen`, authHeaders(t, { tags: { name: 'GET /signals/unseen' } }))],
  [5, 'POST /signals', (t) => http.post(`${API}/signals`, JSON.stringify({ kind: 'HEART', clientId: uuidv4() }),
    authHeaders(t, { tags: { name: 'POST /signals' } }))],
  [10, 'GET /notifications', (t) => http.get(`${API}/notifications?limit=20`, authHeaders(t, { tags: { name: 'GET /notifications' } }))],
  [5, 'GET /me', (t) => http.get(`${API}/me`, authHeaders(t, { tags: { name: 'GET /me' } }))],
];
const MIX_TOTAL = MIX.reduce((s, [w]) => s + w, 0);

export function apiRequest(data) {
  const token = pickUser(data.tokens);
  let r = Math.random() * MIX_TOTAL;
  const [, name, call] = MIX.find(([w]) => (r -= w) < 0) || MIX[0];
  const res = call(token);
  check(res, { [`${name} 2xx`]: (x) => x.status >= 200 && x.status < 300 });
}

// --- WebSocket: 200 хэрэглэгч бүр тест дуустал STOMP холболт барина --------------------------------
const HOST = BASE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

export function wsClient(data) {
  const k = exec.scenario.iterationInTest; // 0 … WS_USERS-1 → хос k/2-ийн A/B
  const token = data.tokens[k];
  sleep((k % 20) * 0.5); // 200 handshake-ийг 10 с-д тараана
  const holdMs = (TOTAL_S + 15 - (k % 20) * 0.5) * 1000;
  let connected = false;

  const res = ws.connect(WS_URL, { headers: { Origin: ORIGIN }, tags: { name: 'WS /ws' } }, (socket) => {
    socket.on('open', () => {
      socket.send(stompFrame('CONNECT', {
        'accept-version': '1.2',
        host: HOST,
        'heart-beat': '10000,10000',
        Authorization: `Bearer ${token}`,
      }));
    });
    socket.on('message', (msg) => {
      for (const cmd of stompCommands(msg)) {
        if (cmd === 'CONNECTED') {
          connected = true;
          socket.send(stompFrame('SUBSCRIBE', { id: 'events', destination: '/user/queue/events' }));
        } else if (cmd === 'MESSAGE') {
          wsEvents.add(1);
        } else if (cmd === 'ERROR') {
          wsErrors.add(1);
        }
      }
    });
    socket.on('error', () => wsErrors.add(1));
    socket.setInterval(() => socket.send('\n'), 10000); // client heartbeat (10 с)
    socket.setTimeout(() => {
      socket.send(stompFrame('DISCONNECT', { receipt: 'bye' }));
      socket.close();
    }, holdMs);
  });

  check(res, { 'WS 101 Switching Protocols': (r) => r && r.status === 101 });
  wsConnected.add(connected);
}
