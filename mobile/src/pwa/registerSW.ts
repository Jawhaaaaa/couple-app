import { Platform } from 'react-native';

import { usePwaStore } from './pwaStore';

/**
 * Service worker бүртгэл (FR-19.5, FR-19.9, AC-140, AC-156, AC-191) — зөвхөн вэбэд, production
 * build-д (`expo start`-ийн dev bundle-ийг кэшлэхгүй). `dist/sw.js`-ийг `scripts/build-sw.cjs`
 * угсарна; байхгүй бол бүртгэл чимээгүй алгасагдана.
 */
export const SW_URL = '/sw.js';
/** Шинэ хувилбар шалгах давтамж (апп урд талд байх үед + урд гарах бүрт). */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;
/** `controllerchange` ирэхгүй бол (хуучин хөтөч) энэ хугацааны дараа өөрөө reload хийнэ. */
export const RELOAD_FALLBACK_MS = 4000;
/** Ноорог (zustand persist → localStorage/IndexedDB) бичигдэж дуусах цонх reload-оос өмнө. */
export const FLUSH_MS = 300;

export interface SwEnv {
  platform?: string;
  dev?: boolean;
  nav?: Navigator;
  doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  perf?: Pick<Performance, 'getEntriesByType'>;
}

function resolve(env: SwEnv) {
  return {
    platform: env.platform ?? Platform.OS,
    dev: env.dev ?? (typeof __DEV__ !== 'undefined' && __DEV__),
    nav: env.nav ?? (typeof navigator !== 'undefined' ? navigator : undefined),
    doc: env.doc ?? (typeof document !== 'undefined' ? document : undefined),
    perf: env.perf ?? (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function' ? performance : undefined),
  };
}

/** Вэб ба `serviceWorker` дэмждэг хөтөч эсэх. */
export function supportsServiceWorker(env: SwEnv = {}): boolean {
  const { platform, nav } = resolve(env);
  return platform === 'web' && !!nav && 'serviceWorker' in nav;
}

/**
 * Хөтөч кэшийг (IndexedDB — ноорог, outbox, query кэш) дарамтын үед цэвэрлэхгүй байлгах хүсэлт
 * (FR-19.5, AC-156). Татгалзвал хөтчийн журмаар — апп ажилласаар.
 */
export async function requestPersistentStorage(nav: Navigator | undefined = resolve({}).nav): Promise<boolean> {
  const storage = nav?.storage;
  if (!storage?.persist) return false;
  try {
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

/**
 * `waiting` SW-ийг дэлгүүрт тавина — зөвхөн шинэчлэлт үед (анх суулгахад биш) ба worker үнэхээр хүлээж байгаа бол.
 * WebKit `statechange`-ийг хоцроож өгдөг: анхны суулгалтын worker аль хэдийн идэвхжиж (`clients.claim` →
 * controller) дууссаны дараа «installed» ирэхэд `worker.state` нь мөн хуучин утгаа буцаадаг тул «Шинэ хувилбар
 * бэлэн» худлаа гардаг байв. Тиймээс (1) `updatefound`-ийн агшинд хуудас аль хэдийн SW-ийн удирдлагад байсан
 * эсэхийг (анхны суулгалтад controller алга) барьж, (2) бүртгэлийн `waiting` талбарыг үнэн гэж үзнэ — spec-ээр
 * «installed» үйл явдлаас өмнө тавигдаж, идэвхжмэгц цэвэрлэгддэг.
 */
function watch(reg: ServiceWorkerRegistration, container: ServiceWorkerContainer) {
  const offer = (worker: ServiceWorker | null) => {
    if (worker && container.controller && worker.state === 'installed' && worker !== reg.active) usePwaStore.getState().setWaiting(worker);
  };
  offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    const isUpdate = !!container.controller;
    installing?.addEventListener('statechange', () => {
      if (isUpdate && installing.state === 'installed') offer(reg.waiting);
    });
  });
}

/** Нэг мессежээр илгээх URL-ийн дээд тоо (runtime кэшийн хязгаараас бага). */
export const WARM_MAX_URLS = 200;

/**
 * Анхны айлчлалд хуудас SW-ийн удирдлагад орохоос (`clients.claim`) өмнө татсан static файлууд
 * (layout, нүүрний lazy chunk, фонт) runtime кэшэд ордоггүй — тэгвэл offline reload-д shell
 * дутуу ачаалагдаж хоосон дэлгэц гарна (AC-140, AC-156). SW идэвхжмэгц ачаалсан resource-уудын
 * жагсаалтыг илгээж (`CACHE_URLS`) кэшэд нөхүүлнэ; SW өөрөө журмаар шүүж, кэштэйг алгасна.
 * Идэвхжих ба `clients.claim` хоорондын агшинд татсаныг барихын тулд анхны `controllerchange`-д дахин.
 */
export function warmRuntimeCache(container: ServiceWorkerContainer, perf: Pick<Performance, 'getEntriesByType'> | undefined) {
  if (!perf || !container.ready) return;
  const send = () =>
    void container.ready
      .then((reg) => {
        const urls = perf
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => typeof u === 'string' && u.length > 0);
        if (urls.length > 0) reg.active?.postMessage({ type: 'CACHE_URLS', urls: [...new Set(urls)].slice(0, WARM_MAX_URLS) });
      })
      .catch(() => undefined);
  send();
  if (!container.controller) {
    let claimed = false;
    const onClaim = () => {
      if (claimed) return;
      claimed = true;
      container.removeEventListener('controllerchange', onClaim);
      send();
    };
    container.addEventListener('controllerchange', onClaim);
  }
}

/** SW-ийг бүртгэнэ; цэвэрлэх функц буцаана. Native, dev, дэмжихгүй хөтөчид юу ч хийхгүй. */
export function registerServiceWorker(env: SwEnv = {}): () => void {
  const { dev, nav, doc, perf } = resolve(env);
  if (!supportsServiceWorker(env) || dev || !nav) return () => {};
  void requestPersistentStorage(nav);
  const container = nav.serviceWorker;
  let reg: ServiceWorkerRegistration | null = null;
  const check = () => void reg?.update().catch(() => undefined);
  const onVisible = () => {
    if (doc?.visibilityState === 'visible') check();
  };
  container
    .register(SW_URL, { scope: '/' })
    .then((r) => {
      reg = r;
      watch(r, container);
      warmRuntimeCache(container, perf);
    })
    .catch(() => undefined);
  const timer = setInterval(check, UPDATE_CHECK_MS);
  doc?.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    doc?.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * «Шинэ хувилбар бэлэн — шинэчлэх» (FR-19.9, AC-191): ноорог хадгалагдах цонх хүлээгээд шинэ SW-д
 * `SKIP_WAITING` илгээнэ; удирдлага шилжмэгц (эсвэл fallback хугацааны дараа) хуудсыг дахин ачаална.
 * Ноорог (S-32, захидал) нь zustand persist-ээр бичих бүрт хадгалагддаг тул reload-д алдагдахгүй.
 */
export async function applyUpdate(
  env: { nav?: Navigator; reload?: () => void; flushMs?: number; fallbackMs?: number } = {},
): Promise<boolean> {
  const worker = usePwaStore.getState().waiting;
  const nav = env.nav ?? resolve({}).nav;
  const reload = env.reload ?? (() => window.location.reload());
  if (!worker || !nav?.serviceWorker) return false;
  await new Promise((r) => setTimeout(r, env.flushMs ?? FLUSH_MS));
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    reload();
  };
  nav.serviceWorker.addEventListener('controllerchange', go);
  worker.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(go, env.fallbackMs ?? RELOAD_FALLBACK_MS);
  return true;
}
