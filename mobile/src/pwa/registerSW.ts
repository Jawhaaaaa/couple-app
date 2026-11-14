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
}

function resolve(env: SwEnv) {
  return {
    platform: env.platform ?? Platform.OS,
    dev: env.dev ?? (typeof __DEV__ !== 'undefined' && __DEV__),
    nav: env.nav ?? (typeof navigator !== 'undefined' ? navigator : undefined),
    doc: env.doc ?? (typeof document !== 'undefined' ? document : undefined),
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

/** `waiting` SW-ийг дэлгүүрт тавина — зөвхөн өмнө нь SW удирдаж байсан үед (анх суулгахад биш). */
function watch(reg: ServiceWorkerRegistration, container: ServiceWorkerContainer) {
  const offer = (worker: ServiceWorker | null) => {
    if (worker && container.controller) usePwaStore.getState().setWaiting(worker);
  };
  offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') offer(reg.waiting ?? installing);
    });
  });
}

/** SW-ийг бүртгэнэ; цэвэрлэх функц буцаана. Native, dev, дэмжихгүй хөтөчид юу ч хийхгүй. */
export function registerServiceWorker(env: SwEnv = {}): () => void {
  const { dev, nav, doc } = resolve(env);
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
