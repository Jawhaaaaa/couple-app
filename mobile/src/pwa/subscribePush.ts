import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, unwrap } from '@/api/client';
import { VAPID_PUBLIC_KEY } from '@/config';

import { base64UrlToBytes } from './base64url';
import { type DeviceInfo, isIos, readDevice } from './installPrompt';

/**
 * Push зөвшөөрөл ба бүртгэл (FR-13.1, FR-19.3, AC-154). Системийн зөвшөөрлийн цонх ЗӨВХӨН S-101-ийн
 * «Зөвшөөрөх» товшилтоор (`enablePush`) — апп өөрөө хэзээ ч асуухгүй.
 *  - вэб: `Notification.requestPermission()` → `pushManager.subscribe` (VAPID) → `POST /push-subscriptions` (WEB);
 *  - native: `expo-notifications`-ийн зөвшөөрөл → Expo push token (боломжтой бол) → `POST /push-subscriptions` (EXPO).
 */
export type PushSupport = 'supported' | 'needs-install' | 'unsupported';
export type PushPermission = 'granted' | 'denied' | 'default';
export type EnableResult = 'granted' | 'denied' | 'needs-install' | 'unsupported' | 'not-configured';

export interface WebPushEnv {
  device: DeviceInfo | null;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}

export function readWebPushEnv(): WebPushEnv {
  const w = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
  return {
    device: readDevice(),
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in w,
    hasNotification: 'Notification' in w,
  };
}

/** iOS (16.4+) дээр Web Push зөвхөн нүүр дэлгэцэнд нэмсэн PWA-д ажиллана (SD-04) — суулгах хэрэгтэй. */
export function webPushSupport(env: WebPushEnv): PushSupport {
  if (env.device && isIos(env.device) && !env.device.standalone) return 'needs-install';
  return env.hasServiceWorker && env.hasPushManager && env.hasNotification ? 'supported' : 'unsupported';
}

export function pushSupport(platform: string = Platform.OS, env: () => WebPushEnv = readWebPushEnv): PushSupport {
  return platform === 'web' ? webPushSupport(env()) : 'supported';
}

/** Одоогийн зөвшөөрөл (асуухгүй). */
export async function pushPermission(platform: string = Platform.OS): Promise<PushPermission> {
  if (platform === 'web') {
    if (typeof Notification === 'undefined') return 'default';
    return Notification.permission;
  }
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'default';
  } catch {
    return 'default';
  }
}

/** VAPID нийтийн түлхүүр: build-ийн env, эсвэл сервер (204 — тохируулаагүй → `null`). */
export async function fetchVapidKey(): Promise<string | null> {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  const res = await unwrap(api.GET('/push/vapid-public-key'));
  return res?.publicKey ?? null;
}

/** `PushSubscription.toJSON()` → гэрээний `PushSubscriptionInput` (WEB). */
export function toSubscriptionInput(json: PushSubscriptionJSON) {
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('push subscription бүрэн биш');
  return { kind: 'WEB' as const, endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, localReminders: false };
}

/**
 * Вэбийн push бүртгэл — товшилтын handler-аас шууд дуудна. `vapidKey`-г урьдчилан (S-101 нээгдэхэд)
 * татсан байх ёстой: сүлжээ хүлээсний дараа Safari товшилтыг «хэрэглэгчийн үйлдэл» гэж тооцохгүй.
 */
export async function subscribePush(vapidKey: string | null, env: WebPushEnv = readWebPushEnv()): Promise<EnableResult> {
  const support = webPushSupport(env);
  if (support !== 'supported') return support;
  if (!vapidKey) return 'not-configured';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey) }));
  await unwrap(api.POST('/push-subscriptions', { body: toSubscriptionInput(subscription.toJSON()) }));
  return 'granted';
}

/**
 * Native: зөвшөөрөл асууж, Expo push token авч чадвал серверт бүртгэнэ. Native-д сануулга локалаар
 * товлогддог (`localReminders: true` — серверийн сануулгын push давхардахгүй). Expo Go-д token
 * (projectId) байхгүй байж болно — тэр үед зөвшөөрөл л үлдэнэ.
 */
export async function enableNativePush(): Promise<EnableResult> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return 'denied';
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (projectId) {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      await unwrap(api.POST('/push-subscriptions', { body: { kind: 'EXPO', expoToken: data, localReminders: true } }));
    }
  } catch {
    // token/бүртгэл бүтэлгүйтсэн ч зөвшөөрөл хүчинтэй — апп доторх мэдэгдэл (S-24) ажилласаар
  }
  return 'granted';
}

export function enablePush(vapidKey: string | null, platform: string = Platform.OS): Promise<EnableResult> {
  return platform === 'web' ? subscribePush(vapidKey) : enableNativePush();
}
