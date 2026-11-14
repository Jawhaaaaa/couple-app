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
