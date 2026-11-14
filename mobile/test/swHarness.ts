import fs from 'fs';
import path from 'path';
import vm from 'vm';

/**
 * `sw/sw.js`-ийг Node-ийн `vm` дотор хуурамч ServiceWorkerGlobalScope-оор ажиллуулна (T-83, T-84):
 * `caches` (Map), `fetch` (jest.fn), `clients`, `registration` — listener-уудыг шууд дуудаж шалгана.
 */
export const ORIGIN = 'https://aura.test';
type Listener = (event: unknown) => void;
type Req = { url: string; method?: string; mode?: string };

export function keyOf(req: string | Req): string {
  const url = typeof req === 'string' ? req : req.url;
  return new URL(url, ORIGIN).href;
}

export function createCaches() {
  const store = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const c = store.get(name)!;
    return {
      put: async (req: string | Req, res: Response) => void c.set(keyOf(req), res),
      match: async (req: string | Req) => c.get(keyOf(req))?.clone(),
      keys: async () => [...c.keys()].map((url) => ({ url })),
      delete: async (req: string | Req) => c.delete(keyOf(req)),
    };
  };
  return {
    store,
    api: {
      open,
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
      match: async (req: string | Req, opts: { cacheName?: string } = {}) => {
        for (const [name, c] of store) {
          if (opts.cacheName && opts.cacheName !== name) continue;
          const hit = c.get(keyOf(req));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
  };
}

export interface FakeWindow {
  url: string;
  focus: jest.Mock;
  navigate: jest.Mock;
  postMessage: jest.Mock;
}

export function loadServiceWorker(globals: Record<string, unknown> = {}) {
  const listeners: Record<string, Listener[]> = {};
  const caches = createCaches();
  const fetchMock = jest.fn(async (_req: unknown, _init?: unknown) => new Response('net', { status: 200 }));
  const windows: FakeWindow[] = [];
  const clients = {
    claim: jest.fn(async () => {}),
    matchAll: jest.fn(async () => windows),
    openWindow: jest.fn(async (_url: string) => null),
  };
  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => (listeners[type] ??= []).push(fn),
    skipWaiting: jest.fn(async () => {}),
    clients,
    registration: { showNotification: jest.fn(async () => {}) },
    ...globals,
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../sw/sw.js'), 'utf8');
  vm.runInNewContext(source, { self, caches: caches.api, fetch: fetchMock, URL, URLSearchParams, Response, console, Promise, setTimeout });

  /** ExtendableEvent/FetchEvent-ийг дуудаж `waitUntil`/`respondWith`-ийн promise-ийг хүлээнэ. */
  async function dispatch(type: string, init: Record<string, unknown> = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const event = {
      ...init,
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
      respondWith: (p: Promise<Response>) => {
        response = p;
      },
    };
    for (const fn of listeners[type] ?? []) fn(event);
    await Promise.all(pending);
    return { event, response: response ? await response : undefined, responded: !!response };
  }

  const sw = self.auraSW as {
    strategyFor: (r: Req, origin: string) => string | null;
    PRECACHE_NAME: string;
    RUNTIME_NAME: string;
  };
  return { self, clients, caches, fetchMock, dispatch, windows, sw };
}
