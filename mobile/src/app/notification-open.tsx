import { type Href, Redirect, useLocalSearchParams } from 'expo-router';

import { routeForNotification } from '@/notifications/notificationRoutes';

/**
 * Вэбийн push-ийг апп хаалттай үед товшиход service worker энэ замыг нээнэ (FR-13.1, AC-50, AC-154):
 * `type` ба `deepLink`-ээс `routeForNotification`-оор жинхэнэ дэлгэц рүү шилжинэ (маршрутын хүснэгт
 * нэг газар). Дэлгэцгүй — шууд redirect.
 */
export default function NotificationOpen() {
  const { type, deepLink } = useLocalSearchParams<{ type?: string; deepLink?: string }>();
  return <Redirect href={routeForNotification({ type: type ?? null, deepLink: deepLink ?? null }) as Href} />;
}
