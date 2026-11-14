/* global self, caches, fetch, URL, URLSearchParams */
/**
 * Aura service worker (FR-19.5, FR-19.9, AC-140, AC-156, AC-191).
 *
 * Энэ файл бол загвар: `node scripts/build-sw.cjs` нь `expo export --platform web`-ийн дараа
 * `dist/`-ийг уншиж precache жагсаалт ба хувилбарыг (`self.__AURA_PRECACHE__`, `self.__AURA_VERSION__`)
 * толгойд нь нэмээд `dist/sw.js` болгон бичнэ. Хувилбар өөрчлөгдөхөд хөтөч шинэ SW-ийг суулгана —
 * тэр нь `waiting` төлөвт хүлээж, хэрэглэгч «Шинэчлэх» товшсон үед л (`SKIP_WAITING`) идэвхжинэ.
 *
 * Кэшийн журам:
 *  - precache: апп-ын shell (index.html, эхний JS/CSS), фонт, manifest, дүрс;
 *  - runtime (cache-first): `/_expo/static/**` (hash-тай lazy chunk, Lottie JSON орно), `/assets/**`,
 *    `/icons/**`, `/splash/**`, `.json`/`.lottie` — үзсэн дэлгэцийн код offline-д нээгдэнэ;
 *  - navigation: сүлжээ → алга бол precache-ийн index.html (offline shell, «Интернэт алга» зурвастай);
 *  - API (`/api/**`, өөр origin — backend, S3), POST г.м. хэзээ ч кэшлэхгүй: өгөгдлийн кэш нь
 *    TanStack Query persist (`src/offline/persist.ts`).
 *
 * Web Push (FR-13.1, FR-19.3, AC-154): `push` — серверийн payload-ыг (`WebPushSender`: title, body,
 * deepLink, type, notificationId) яг хэвээр харуулна. «Агуулга нуух» асаалттай бол сервер аль хэдийн
 * ерөнхий бичвэр илгээдэг — SW өөрөөсөө агуулга, зураг нэмэхгүй. `notificationclick` — нээлттэй цонх
 * байвал түүнд `NOTIFICATION_CLICK` мессеж (апп `notificationRoutes.ts`-ээр чиглүүлнэ), үгүй бол
 * `/notification-open?type&deepLink` (мөн тэр функцээр redirect) — маршрутын хүснэгт нэг л газар.
 */

const VERSION = self.__AURA_VERSION__ || 'dev';
/** @type {{ url: string, revision: string }[]} */
const PRECACHE = self.__AURA_PRECACHE__ || [{ url: '/index.html', revision: 'dev' }];
const PRECACHE_NAME = 'aura-precache-' + VERSION;
const RUNTIME_NAME = 'aura-runtime-v1';
const RUNTIME_MAX_ENTRIES = 300;
const SHELL_URL = '/index.html';

const NEVER = /^\/(api|ws|healthz|test)(\/|$)/;
const RUNTIME = /^\/(_expo\/static|assets|icons|splash)\/|\.(json|lottie|ttf|otf|woff2?|png|jpe?g|webp|svg|ico|wav|mp3)$/;

/**
 * Хүсэлтийн кэшийн журам. `null` — SW оролцохгүй (хөтөч шууд сүлжээнд).
 * @param {{ method: string, mode?: string, url: string }} request
 * @param {string} origin SW-ийн origin
 * @returns {'navigate' | 'cache-first' | null}
 */
function strategyFor(request, origin) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== origin) return null;
  if (NEVER.test(url.pathname)) return null;
  if (request.mode === 'navigate') return 'navigate';
  if (RUNTIME.test(url.pathname)) return 'cache-first';
  return null;
}

async function precache() {
  const cache = await caches.open(PRECACHE_NAME);
  await Promise.all(
    PRECACHE.map(async ({ url }) => {
      // `no-cache` — HTTP кэшээс хуучин index.html авахгүй (304-өөр баталгаажуулна)
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('precache ' + url + ' HTTP ' + res.status);
      await cache.put(url, res);
    }),
  );
}

async function trimRuntime(cache) {
  const keys = await cache.keys();
  const extra = keys.length - RUNTIME_MAX_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok && res.type !== 'opaque') {
    const cache = await caches.open(RUNTIME_NAME);
    await cache.put(request, res.clone());
    await trimRuntime(cache);
  }
  return res;
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch (e) {
    const shell = await caches.match(SHELL_URL, { cacheName: PRECACHE_NAME });
    if (shell) return shell;
    throw e;
  }
}

self.addEventListener('install', (event) => {
  // skipWaiting хийхгүй: шинэ хувилбар хэрэглэгч «Шинэчлэх» дарах хүртэл хүлээнэ (AC-191)
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('aura-precache-') && n !== PRECACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request, self.location.origin);
  if (strategy === 'navigate') event.respondWith(navigate(event.request));
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(event.request));
});

const DEFAULT_TITLE = 'Aura';
const ICON = '/icons/icon-192.png';

/** Push payload → `showNotification`-ийн аргумент. Буруу JSON → ерөнхий «Aura» мэдэгдэл. */
function notificationFromPush(text) {
  let p = {};
  try {
    p = text ? JSON.parse(text) : {};
  } catch (e) {
    p = {};
  }
  const str = (v) => (typeof v === 'string' && v ? v : null);
  return {
    title: str(p.title) || DEFAULT_TITLE,
    options: {
      body: str(p.body) || '',
      icon: ICON,
      badge: ICON,
      tag: str(p.notificationId) || undefined,
      data: { type: str(p.type), deepLink: str(p.deepLink) },
    },
  };
}

/** Цонхгүй үед нээх зам — апп `routeForNotification`-оор жинхэнэ дэлгэц рүү redirect хийнэ. */
function openUrl(data) {
  const q = new URLSearchParams();
  if (data && data.type) q.set('type', data.type);
  if (data && data.deepLink) q.set('deepLink', data.deepLink);
  const qs = q.toString();
  return '/notification-open' + (qs ? '?' + qs : '');
}

self.addEventListener('push', (event) => {
  const { title, options } = notificationFromPush(event.data ? event.data.text() : '');
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        client.postMessage({ type: 'NOTIFICATION_CLICK', data: { type: data.type || null, deepLink: data.deepLink || null } });
        return client.focus();
      }
      return self.clients.openWindow(openUrl(data));
    })(),
  );
});

self.auraSW = { strategyFor, notificationFromPush, openUrl, VERSION, PRECACHE_NAME, RUNTIME_NAME };
