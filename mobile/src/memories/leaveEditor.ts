import { router as expoRouter } from 'expo-router';
import { Platform } from 'react-native';

/** Навигацид хэрэгтэй `router`-ийн хэсэг (тестэд солино). */
export interface LeaveRouter {
  back(): void;
  push(href: string): void;
  replace(href: string): void;
  dismissTo(href: string): void;
  canGoBack(): boolean;
}

export interface LeaveDeps {
  router: LeaveRouter;
  web: boolean;
  /** `popstate` сонсох цонх (вэб). */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Буцалт бодитоор дуусахыг хүлээх дээд хугацаа (мс). */
  popTimeoutMs?: number;
}

/**
 * Хөтчийн `popstate` ирэх хүртэл хүлээх дээд хугацаа. expo-router-ийн history adapter нь
 * `history.go(-1)`-ийн `popstate`-ийг 100 мс л хүлээдэг; Firefox-д ~200 мс-ийн дараа ирсэн нь
 * ажиглагдсан (DEV_TEST 216) тул түүнээс хол илүү.
 */
const POP_TIMEOUT_MS = 2_000;

let leaving: Promise<void> | null = null;

/** Хадгалсны дараах шилжилт эхэлсэн эсэх — editor-ын хаах/хаях товч энэ үед юу ч хийхгүй. */
export function isLeavingEditor(): boolean {
  return leaving !== null;
}

function defaultDeps(): LeaveDeps {
  return { router: expoRouter, web: Platform.OS === 'web', win: typeof window === 'undefined' ? undefined : window };
}

function nextPopState(win: NonNullable<LeaveDeps['win']>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      win.removeEventListener('popstate', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    win.addEventListener('popstate', done);
  });
}

/**
 * S-32-оос хадгалсны дараа гарах (AC-198, AC-95). `memoryIdToOpen` бол шинэ дурсамж (S-31) руу,
 * үгүй бол modal-ыг хаана (засвар, болзооноос — нээсэн газраа буцна).
 *
 * Вэб: modal-ыг хаах нь root stack-ийн pop тул expo-router `history.go(-1)` хийгээд шинэ замыг
 * `replaceState`-ээр бичдэг. Adapter нь `popstate`-ийг 100 мс-ээс удаан хүлээхгүй; Firefox-д
 * хожуу ирсэн `popstate` хэрэглэгчийн «Буцах» мэт уншигдаж, S-31-ийн оронд editor-ын өмнөх
 * entry (Нүүр) рүү буцаадаг байв (`dismissTo` ч мөн адил — pop + өөр зам). Тиймээс:
 * 1) `back()` — буцах entry-ийн зам өөрчлөгдөхгүй тул хожуу `popstate` ижил төлөвийг л сэргээнэ;
 * 2) тэр `popstate` бодитоор ирсний дараа л S-31 руу `push()` — history-д `go` огт үүсэхгүй.
 * Native-д хөтчийн түүх байхгүй — `dismissTo` нэг үйлдлээр.
 *
 * Дахин дуудалт (давхар товшилт, хожуу хаах товч) эхний шилжилтийг л буцаана.
 */
export function leaveEditorAfterSave(memoryIdToOpen: string | null, deps: LeaveDeps = defaultDeps()): Promise<void> {
  if (leaving) return leaving;
  const run = async () => {
    const { router, web, win } = deps;
    if (!memoryIdToOpen) {
      if (router.canGoBack()) router.back();
      else router.replace('/memories');
      return;
    }
    const target = `/memories/${memoryIdToOpen}`;
    if (!web || !win) {
      router.dismissTo(target);
      return;
    }
    if (!router.canGoBack()) {
      router.replace(target);
      return;
    }
    const popped = nextPopState(win, deps.popTimeoutMs ?? POP_TIMEOUT_MS);
    router.back();
    await popped;
    router.push(target);
  };
  leaving = run().finally(() => {
    leaving = null;
  });
  return leaving;
}
