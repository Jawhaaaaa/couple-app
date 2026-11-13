/** Апп түгжээний бодлого (FR-14.1, AC-52, AC-124) — цэвэр функц, UT-ээр шалгагдана. */

export const PIN_MIN = 4;
export const PIN_MAX = 6;
/** 5 буруу → 1 мин хүлээх; нийт 10 буруу → PIN-ээр нээхгүй, нууц үгээр нэвтрэх. */
export const WAIT_AFTER = 5;
export const WAIT_MS = 60_000;
export const SIGN_OUT_AFTER = 10;
/** Арын төлөвт байх хугацааны сонголт (секунд): шууд, 1, 5, 15 мин. */
export const LOCK_TIMEOUTS = [0, 60, 300, 900] as const;
export type LockTimeout = (typeof LOCK_TIMEOUTS)[number];

export interface AttemptState {
  failures: number;
  lockedUntil: number | null;
}

export type AttemptVerdict = { kind: 'retry'; left: number } | { kind: 'wait'; until: number } | { kind: 'signOut' };

export function validPin(pin: string): boolean {
  return pin.length >= PIN_MIN && pin.length <= PIN_MAX && /^\d+$/.test(pin);
}

/** Одоо PIN оруулж болох уу (1 минутын хүлээлт дуусаагүй бол үгүй). */
export function waitRemainingMs(state: AttemptState, now: number): number {
  return state.lockedUntil && state.lockedUntil > now ? state.lockedUntil - now : 0;
}

export function registerFailure(state: AttemptState, now: number): { state: AttemptState; verdict: AttemptVerdict } {
  const failures = state.failures + 1;
  if (failures >= SIGN_OUT_AFTER) return { state: { failures, lockedUntil: null }, verdict: { kind: 'signOut' } };
  if (failures === WAIT_AFTER) {
    const until = now + WAIT_MS;
    return { state: { failures, lockedUntil: until }, verdict: { kind: 'wait', until } };
  }
  const left = failures < WAIT_AFTER ? WAIT_AFTER - failures : SIGN_OUT_AFTER - failures;
  return { state: { failures, lockedUntil: null }, verdict: { kind: 'retry', left } };
}

export const RESET_ATTEMPTS: AttemptState = { failures: 0, lockedUntil: null };

/**
 * Апп урд гарахад түгжих эсэх (AC-124): түгжээ асаалттай ба арын төлөвт `timeoutSec`-ээс удаан
 * (шууд = 0 бол ямар ч хугацаа). Хүйтэн эхлэлд (`backgroundAt` алга) үргэлж түгжинэ.
 */
export function shouldLock(opts: { enabled: boolean; timeoutSec: number; backgroundAt: number | null; now: number }): boolean {
  if (!opts.enabled) return false;
  if (opts.backgroundAt === null) return true;
  return opts.now - opts.backgroundAt >= opts.timeoutSec * 1000;
}
