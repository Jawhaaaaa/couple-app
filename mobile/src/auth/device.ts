import { Platform } from 'react-native';

import type { components } from '@/api/schema';

export type DeviceInfo = components['schemas']['DeviceInfo'];

/*
 * `expo-device` (вэбэд ua-parser-js) ба `expo-localization` нь модуль ачаалагдах үед UA задлах, Intl
 * дуудах ажил хийдэг — апп эхлэх замд (bootstrap, нүүр) импортлогдох тул эхний ачааллын main thread-ийг
 * (TBT, AC-152/AC-160) ~0.2 с (CPU 4×) нэмдэг байв. Хэрэгтэй үед нь (нэвтрэх, цагийн бүс) л ачаална.
 */
type DeviceModule = typeof import('expo-device');
type LocalizationModule = typeof import('expo-localization');

/** Нэвтэрсэн төхөөрөмжийн мэдээлэл (S-84-ийн жагсаалтад харагдана). */
export function deviceInfo(): DeviceInfo {
  const platform: DeviceInfo['platform'] = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB';
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- хойшлуулсан ачаалал (дээрх тайлбар)
  const Device = require('expo-device') as DeviceModule;
  const name = Device.deviceName ?? Device.modelName ?? Device.osName ?? platform;
  return { name: name.slice(0, 100), platform };
}

/** Төхөөрөмжийн IANA цагийн бүс (тодорхойгүй бол `Intl`, эцэст нь `null`). */
export function deviceTimezone(): string | null {
  // Вэбэд `expo-localization` ч `Intl`-ээс уншдаг — шууд Intl
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- хойшлуулсан ачаалал
    const { getCalendars } = require('expo-localization') as LocalizationModule;
    const fromCalendar = getCalendars()[0]?.timeZone;
    if (fromCalendar) return fromCalendar;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
}
