import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { routeForNotification } from './notificationRoutes';

type Response = Notifications.NotificationResponse | null;

/**
 * Native push/локал мэдэгдлийг товшиход холбогдох дэлгэц (AC-50): апп хаалттай байхад товшсон
 * (`getLastNotificationResponseAsync`) ба нээлттэй үеийнх. Вэбэд service worker-ийн
 * `notificationclick` (T-84) хийнэ.
 */
export function useNotificationTapRouting(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
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
