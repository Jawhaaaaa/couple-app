import { loadServiceWorker, ORIGIN } from '../../../test/swHarness';

const PRECACHE = [
  { url: '/index.html', revision: 'a1' },
  { url: '/_expo/static/js/web/entry-1.js', revision: 'b2' },
];

const get = (p: string, mode = 'cors') => ({ url: `${ORIGIN}${p}`, method: 'GET', mode });

describe('T-83 service worker (sw/sw.js)', () => {
  it('кэшийн журам: API, өөр origin, POST — SW оролцохгүй; navigation ба static', () => {
    const { sw } = loadServiceWorker();
    expect(sw.strategyFor(get('/api/v1/dashboard'), ORIGIN)).toBeNull();
    expect(sw.strategyFor({ url: 'https://api.aura.test/api/v1/me', method: 'GET' }, ORIGIN)).toBeNull();
    expect(sw.strategyFor({ url: 'https://s3.test/photo.jpg', method: 'GET' }, ORIGIN)).toBeNull();
    expect(sw.strategyFor({ ...get('/_expo/static/js/web/a.js'), method: 'POST' }, ORIGIN)).toBeNull();
    expect(sw.strategyFor(get('/memories', 'navigate'), ORIGIN)).toBe('navigate');
    expect(sw.strategyFor(get('/_expo/static/js/web/chat-9.js'), ORIGIN)).toBe('cache-first');
    expect(sw.strategyFor(get('/assets/node_modules/nunito/Nunito.ttf'), ORIGIN)).toBe('cache-first');
    expect(sw.strategyFor(get('/assets/lottie/heart.json'), ORIGIN)).toBe('cache-first');
    expect(sw.strategyFor(get('/icons/icon-192.png'), ORIGIN)).toBe('cache-first');
  });

  it('AC-140 install — shell-ийг precache хийнэ, skipWaiting хийхгүй (хэрэглэгч шийднэ)', async () => {
    const { self, caches, fetchMock, dispatch, sw } = loadServiceWorker({ __AURA_PRECACHE__: PRECACHE, __AURA_VERSION__: 'v2' });
    await dispatch('install');
    expect(fetchMock).toHaveBeenCalledWith('/index.html', { cache: 'no-cache' });
    expect([...caches.store.get(sw.PRECACHE_NAME)!.keys()]).toEqual([`${ORIGIN}/index.html`, `${ORIGIN}/_expo/static/js/web/entry-1.js`]);
    expect(sw.PRECACHE_NAME).toBe('aura-precache-v2');
    expect(self.skipWaiting).not.toHaveBeenCalled();
  });

  it('AC-140 / AC-156 offline navigation — precache-ийн index.html (offline shell)', async () => {
    const { fetchMock, dispatch } = loadServiceWorker({ __AURA_PRECACHE__: PRECACHE });
    fetchMock.mockImplementation(async (req: unknown) => new Response(typeof req === 'string' ? `body:${req}` : 'net'));
    await dispatch('install');
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { response } = await dispatch('fetch', { request: get('/chat', 'navigate') });
    expect(await response!.text()).toBe('body:/index.html');
  });

  it('API хүсэлтэд respondWith дуудагдахгүй — өгөгдлийн кэш TanStack persist-д', async () => {
    const { dispatch } = loadServiceWorker();
    expect((await dispatch('fetch', { request: get('/api/v1/messages') })).responded).toBe(false);
    expect((await dispatch('fetch', { request: { ...get('/api/v1/messages'), method: 'POST' } })).responded).toBe(false);
  });

  it('static — эхлээд сүлжээнээс аваад runtime кэшэд, дараа нь кэшээс (offline-д үзсэн дэлгэц)', async () => {
    const { fetchMock, dispatch, caches, sw } = loadServiceWorker();
    fetchMock.mockImplementation(async () => new Response('chunk'));
    const request = get('/_expo/static/js/web/chat-9.js');
    expect(await (await dispatch('fetch', { request })).response!.text()).toBe('chunk');
    expect(caches.store.get(sw.RUNTIME_NAME)!.size).toBe(1);
    fetchMock.mockImplementation(async () => {
      throw new TypeError('offline');
    });
    expect(await (await dispatch('fetch', { request })).response!.text()).toBe('chunk');
  });

  it('AC-191 SKIP_WAITING мессежээр л идэвхжинэ; activate хуучин precache-ийг устгана', async () => {
    const { self, clients, dispatch, caches, sw } = loadServiceWorker({ __AURA_VERSION__: 'new' });
    await caches.api.open('aura-precache-old');
    await caches.api.open(sw.RUNTIME_NAME);
    await dispatch('message', { data: { type: 'OTHER' } });
    expect(self.skipWaiting).not.toHaveBeenCalled();
    await dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(self.skipWaiting).toHaveBeenCalled();
    await dispatch('activate');
    expect([...caches.store.keys()]).toEqual([sw.RUNTIME_NAME]);
    expect(clients.claim).toHaveBeenCalled();
  });
});

describe('T-84 service worker — Web Push', () => {
  const pushEvent = (payload: unknown) => ({ data: { text: () => (typeof payload === 'string' ? payload : JSON.stringify(payload)) } });

  it('AC-154 push — серверийн payload-ыг яг хэвээр (tag = notificationId, deepLink data-д)', async () => {
    const { self, dispatch } = loadServiceWorker();
    await dispatch('push', pushEvent({ title: 'Ану', body: 'Чамд зүрх илгээлээ', type: 'HEART_RECEIVED', deepLink: '/home', notificationId: 'n1' }));
    const show = (self.registration as { showNotification: jest.Mock }).showNotification;
    expect(show).toHaveBeenCalledWith('Ану', expect.objectContaining({ body: 'Чамд зүрх илгээлээ', tag: 'n1', data: { type: 'HEART_RECEIVED', deepLink: '/home' } }));
  });

  it('агуулга нуух — сервер ерөнхий бичвэр илгээвэл SW өөрөөсөө агуулга/зураг нэмэхгүй', async () => {
    const { self, dispatch } = loadServiceWorker();
    await dispatch('push', pushEvent({ title: 'Aura', body: 'Шинэ мэдэгдэл', type: 'MESSAGE_NEW', deepLink: null, notificationId: 'n2' }));
    const [title, options] = (self.registration as { showNotification: jest.Mock }).showNotification.mock.calls[0];
    expect(title).toBe('Aura');
    expect(options.body).toBe('Шинэ мэдэгдэл');
    expect(options).not.toHaveProperty('image');
  });

  it('буруу payload → ерөнхий «Aura» мэдэгдэл (push бүр мэдэгдэл харуулна — userVisibleOnly)', async () => {
    const { self, dispatch } = loadServiceWorker();
    await dispatch('push', pushEvent('{not json'));
    expect((self.registration as { showNotification: jest.Mock }).showNotification).toHaveBeenCalledWith('Aura', expect.objectContaining({ body: '' }));
  });

  it('AC-50 notificationclick — нээлттэй цонхонд NOTIFICATION_CLICK мессеж + focus', async () => {
    const { dispatch, windows, clients } = loadServiceWorker();
    const win = { url: `${ORIGIN}/memories`, focus: jest.fn(async () => undefined), navigate: jest.fn(), postMessage: jest.fn() };
    windows.push(win);
    const close = jest.fn();
    await dispatch('notificationclick', { notification: { close, data: { type: 'LETTER_DELIVERED', deepLink: '/letters/l1' } } });
    expect(close).toHaveBeenCalled();
    expect(win.postMessage).toHaveBeenCalledWith({ type: 'NOTIFICATION_CLICK', data: { type: 'LETTER_DELIVERED', deepLink: '/letters/l1' } });
    expect(win.focus).toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it('AC-50 цонхгүй үед /notification-open?type&deepLink-ийг нээнэ', async () => {
    const { dispatch, clients } = loadServiceWorker();
    await dispatch('notificationclick', { notification: { close: jest.fn(), data: { type: 'LETTER_DELIVERED', deepLink: '/letters/l1' } } });
    expect(clients.openWindow).toHaveBeenCalledWith('/notification-open?type=LETTER_DELIVERED&deepLink=%2Fletters%2Fl1');
  });
});
