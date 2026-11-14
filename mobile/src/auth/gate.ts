import type { components } from '@/api/schema';

export type Me = components['schemas']['Me'];

/** Эхлэлийн хаалганы чиглэл (spec §6.1). */
export type GateTarget =
  | { pathname: '/intro' }
  | { pathname: '/login' }
  | { pathname: '/verify-email'; params: { email: string } }
  | { pathname: '/policy-update' }
  | { pathname: '/waiting' }
  | { pathname: '/home' };

/**
 * `index.tsx`-ийн шийдвэр (spec §6.1): анх суулгаад танилцуулга үзээгүй, нэвтрээгүй → S-02 (AC-133); сессгүй → S-03; имэйл баталгаажаагүй → S-05;
 * бодлогын шинэ хувилбар → S-90 хаалга (AC-63); хосгүй (`SOLO`) → S-13 «Хамтрагчаа
 * хүлээж байна»; хостой (`COUPLE`) → нүүр (S-20). S-07 профайл нь бүртгэлийн дараа
 * (S-05-аас) шууд нээгддэг тул хаалга түүнийг шаарддаггүй — «Дараа нь» зөвшөөрөгдөнө.
 */
export function resolveGate({
  signedIn,
  me,
  introSeen = true,
}: {
  signedIn: boolean;
  me: Me | null | undefined;
  /** S-02-ийг энэ төхөөрөмж дээр үзсэн эсэх (`onboardingStore`). Нэвтэрсэн хэрэглэгчид танилцуулга гаргахгүй. */
  introSeen?: boolean;
}): GateTarget {
  if (!signedIn && !introSeen) return { pathname: '/intro' };
  if (!signedIn || !me) return { pathname: '/login' };
  if (!me.emailVerified) return { pathname: '/verify-email', params: { email: me.email } };
  if (me.policyUpdateRequired) return { pathname: '/policy-update' };
  if (me.space.kind === 'SOLO') return { pathname: '/waiting' };
  return { pathname: '/home' };
}
