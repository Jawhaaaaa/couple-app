import type { PushPermission, PushSupport } from './subscribePush';

/**
 * Нэвтэрсний дараах PWA-ийн саналын дараалал (spec §6.1: «iOS Safari standalone биш → S-100 (7 хоног);
 * нэвтэрсний дараа нэг удаа → S-101»). Шийдвэр: вэбэд, нэвтэрсэн, нүүр (S-20) дээр буусан үед л —
 * onboarding/нэвтрэх урсгалыг таслахгүй; нэг сесст нэг санал; S-100 эхэлж (суулгаагүй iPhone-д
 * push ажиллахгүй), дараа нь S-101 (системийн цонх биш — тайлбар, «Зөвшөөрөх» товшилтоор л).
 */
export interface PromptInput {
  platform: string;
  signedIn: boolean;
  pathname: string;
  hydrated: boolean;
  shownThisSession: boolean;
  installOffer: boolean;
  pushOffered: boolean;
  pushSupport: PushSupport;
  permission: PushPermission;
}

export const PROMPT_PATH = '/home';

export function nextPwaPrompt(i: PromptInput): 'install' | 'push' | null {
  if (i.platform !== 'web' || !i.signedIn || !i.hydrated || i.shownThisSession || i.pathname !== PROMPT_PATH) return null;
  if (i.installOffer) return 'install';
  if (!i.pushOffered && i.pushSupport === 'supported' && i.permission === 'default') return 'push';
  return null;
}
