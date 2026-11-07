import * as Device from 'expo-device';
import { getCalendars } from 'expo-localization';
import { Platform } from 'react-native';

import type { components } from '@/api/schema';

export type DeviceInfo = components['schemas']['DeviceInfo'];

/** Нэвтэрсэн төхөөрөмжийн мэдээлэл (S-84-ийн жагсаалтад харагдана). */
export function deviceInfo(): DeviceInfo {
  const platform: DeviceInfo['platform'] = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB';
  const name = Device.deviceName ?? Device.modelName ?? Device.osName ?? platform;
  return { name: name.slice(0, 100), platform };
}

/** Төхөөрөмжийн IANA цагийн бүс (тодорхойгүй бол `Intl`, эцэст нь `null`). */
export function deviceTimezone(): string | null {
  const fromCalendar = getCalendars()[0]?.timeZone;
  if (fromCalendar) return fromCalendar;
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
}
