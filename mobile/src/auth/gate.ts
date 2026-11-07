import type { components } from '@/api/schema';

export type Me = components['schemas']['Me'];

/** Эхлэлийн хаалганы чиглэл (spec §6.1). */
export type GateTarget =
  | { pathname: '/login' }
  | { pathname: '/verify-email'; params: { email: string } }
  | { pathname: '/policy-update' }
  | { pathname: '/home' };

/**
 * `index.tsx`-ийн шийдвэр: сессгүй → S-03; имэйл баталгаажаагүй → S-05; бодлогын
 * шинэ хувилбар → S-90 хаалга (AC-63); бусад нь → нүүр. Хос холбох дэлгэцүүд
 * (S-08…S-13) дараагийн нэгжид нэмэгдэнэ.
 */
export function resolveGate({ signedIn, me }: { signedIn: boolean; me: Me | null | undefined }): GateTarget {
  if (!signedIn || !me) return { pathname: '/login' };
  if (!me.emailVerified) return { pathname: '/verify-email', params: { email: me.email } };
  if (me.policyUpdateRequired) return { pathname: '/policy-update' };
  return { pathname: '/home' };
}
