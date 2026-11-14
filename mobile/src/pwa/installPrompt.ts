/**
 * S-100 суулгах зааврын шийдвэр (FR-19.2, AC-153) — user-agent, standalone, `beforeinstallprompt`-оос
 * цэвэр функцээр. iOS дээр Safari л «Нүүр дэлгэцэнд нэмэх»-тэй; бусад iOS хөтөч (CriOS, FxiOS,
 * EdgiOS, апп доторх хөтөч) суулгаж чадахгүй — Safari-аар нээхийг санал болгоно.
 */
export type InstallContext = 'standalone' | 'ios-safari' | 'ios-other' | 'android' | 'desktop';

/** Хаасны дараа дахин гарахгүй хугацаа (FR-19.2). */
export const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DeviceInfo {
  ua: string;
  /** `display-mode: standalone` эсвэл iOS-ийн `navigator.standalone`. */
  standalone: boolean;
  /** iPadOS 13+ нь desktop Safari-ийн UA-тай — мэдрэгч дэлгэцээр ялгана. */
  maxTouchPoints?: number;
}

const IOS_OTHER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|GSA\/|FBAN|FBAV|Instagram|Line\/|KAKAOTALK|Snapchat|Twitter|WhatsApp|MicroMessenger/;

export function isIos({ ua, maxTouchPoints = 0 }: Pick<DeviceInfo, 'ua' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

export function installContext(device: DeviceInfo): InstallContext {
  if (device.standalone) return 'standalone';
  if (isIos(device)) return IOS_OTHER.test(device.ua) || !/Safari\//.test(device.ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(device.ua)) return 'android';
  return 'desktop';
}

/**
 * S-100-г автоматаар харуулах эсэх: суусан бол үгүй (AC-153 б); хаагаад 7 хоног болоогүй бол үгүй
 * (AC-153 в — 6 дахь өдөр үгүй, 8 дахь өдөр тийм); iOS-д үргэлж (заавар); Android/desktop-д
 * хөтөч суулгахыг санал болгосон (`beforeinstallprompt`) үед л.
 */
export function shouldOfferInstall(input: { context: InstallContext; canPrompt: boolean; dismissedAt: number | null; now: number }): boolean {
  const { context, canPrompt, dismissedAt, now } = input;
  if (context === 'standalone') return false;
  if (dismissedAt != null && now - dismissedAt < INSTALL_SNOOZE_MS) return false;
  if (context === 'ios-safari' || context === 'ios-other') return true;
  return canPrompt;
}

/** Хөтчийн одоогийн төхөөрөмжийн мэдээлэл (вэбэд л; native-д `null`). */
export function readDevice(): DeviceInfo | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null;
  const standalone =
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { ua: navigator.userAgent ?? '', standalone, maxTouchPoints: navigator.maxTouchPoints ?? 0 };
}
