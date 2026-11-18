import type { AnimationObject } from 'lottie-react-native';
import { useEffect, useState } from 'react';

/** Lottie JSON-ийг хэрэгтэй үед л татах функц — `() => import('…/x.json')` (FR-19.10, AC-160). */
export type LottieLoader = () => Promise<{ default: AnimationObject } | AnimationObject>;
export type LottieInput = AnimationObject | { uri: string } | LottieLoader;
export type LottieResolved = AnimationObject | { uri: string };

const cache = new Map<LottieLoader, LottieResolved>();
const pending = new Map<LottieLoader, Promise<LottieResolved>>();

function unwrap(mod: { default: AnimationObject } | AnimationObject): AnimationObject {
  return 'default' in mod && mod.default ? mod.default : (mod as AnimationObject);
}

/** Loader-ийг нэг л удаа дуудаж үр дүнг санах ойд хадгална (давхар татахгүй). */
export function loadLottie(loader: LottieLoader): Promise<LottieResolved> {
  const hit = cache.get(loader);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(loader);
  if (!p) {
    p = loader().then(
      (mod) => {
        const value = unwrap(mod);
        cache.set(loader, value);
        pending.delete(loader);
        return value;
      },
      (error: unknown) => {
        pending.delete(loader);
        throw error;
      },
    );
    pending.set(loader, p);
  }
  return p;
}

/**
 * Lottie эх сурвалж: объект/URI бол шууд, loader бол анх харагдах үед татна — Lottie JSON эхний
 * ачааллын bundle-д орохгүй. Татагдаж дуустал (эсвэл алдаа гарвал) `null` — дуудагч статик дүрс үзүүлнэ.
 * `enabled = false` (хөдөлгөөн унтраастай) үед огт татахгүй.
 */
export function useLottieSource(input: LottieInput, enabled = true): LottieResolved | null {
  const isLoader = typeof input === 'function';
  const [loaded, setLoaded] = useState<{ input: LottieInput; value: LottieResolved } | null>(null);
  useEffect(() => {
    if (!isLoader || !enabled) return;
    let alive = true;
    loadLottie(input)
      .then((value) => {
        if (alive) setLoaded({ input, value });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, input, isLoader]);
  if (!isLoader) return input;
  return cache.get(input) ?? (loaded?.input === input ? loaded.value : null);
}
