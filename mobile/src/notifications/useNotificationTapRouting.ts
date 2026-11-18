import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { routeForNotification } from './notificationRoutes';

type Response = Notifications.NotificationResponse | null;

/** Service worker-ийн `notificationclick` → нээлттэй цонхонд илгээх мессеж (sw/sw.js). */
export interface NotificationClickMessage {
  type: 'NOTIFICATION_CLICK';
  data: { type?: string | null; deepLink?: string | null };
}

export function isNotificationClick(value: unknown): value is NotificationClickMessage {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'NOTIFICATION_CLICK';
}

/** Вэб: апп нээлттэй үед товшсон push-ийг SW-ээс мессежээр авч чиглүүлнэ (хаалттай үед — `/notification-open`). */
function listenServiceWorkerClicks(): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const onMessage = (event: MessageEvent) => {
    if (isNotificationClick(event.data)) router.push(routeForNotification(event.data.data) as Href);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}

/**
 * Push/локал мэдэгдлийг товшиход холбогдох дэлгэц (AC-50): native — апп хаалттай байхад товшсон
 * (`getLastNotificationResponseAsync`) ба нээлттэй үеийнх; вэб — service worker-ийн `notificationclick`.
 */
export function useNotificationTapRouting(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return listenServiceWorkerClicks();
    const handled = new Set<string>();
    const open = (response: Response) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      handled.add(id);
      const data = (response.notification.request.content.data ?? {}) as { type?: string; deepLink?: string };
      router.push(routeForNotification(data) as Href);
    };
    let subscription: { remove: () => void } | null = null;
    try {
      void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
      subscription = Notifications.addNotificationResponseReceivedListener(open);
    } catch {
      // Expo Go-д зарим push API байхгүй — товшилтын чиглүүлэлт л алгасагдана
    }
    return () => subscription?.remove();
  }, []);
}
