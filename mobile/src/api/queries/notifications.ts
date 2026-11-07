import { type InfiniteData, type QueryClient, useInfiniteQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

export type AppNotification = components['schemas']['Notification'];
export type NotificationPage = components['schemas']['NotificationPage'];
export type NotificationPages = InfiniteData<NotificationPage, unknown>;

/** S-24 ба толгойн хонх нэг key-г хуваалцана (`notification.created` realtime шинэчилнэ). */
export const NOTIFICATIONS_KEY = ['notifications'] as const;
const PAGE_SIZE = 30;

export function fetchNotifications(cursor: string | null): Promise<NotificationPage> {
  return unwrap(api.GET('/notifications', { params: { query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } } }));
}

export function markNotificationRead(notificationId: string): Promise<unknown> {
  return unwrap(api.POST('/notifications/{notificationId}/read', { params: { path: { notificationId } } }));
}

export function markAllNotificationsRead(): Promise<unknown> {
  return unwrap(api.POST('/notifications/read-all'));
}

export function useNotifications() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!accessToken,
  });
}

/** Уншаагүй тоо — эхний хуудасны `unreadCount` (сервер нийт тоог өгнө). */
export function unreadCountOf(data: NotificationPages | undefined): number {
  return data?.pages[0]?.unreadCount ?? 0;
}

export function useUnreadCount(): number {
  return unreadCountOf(useNotifications().data);
}

/** Нэг мэдэгдлийг кэшид уншсан болгоно (optimistic, AC-120). */
export function applyRead(data: NotificationPages | undefined, id: string, now: string): NotificationPages | undefined {
  if (!data) return data;
  const wasUnread = data.pages.some((p) => p.items.some((n) => n.id === id && !n.readAt));
  if (!wasUnread) return data;
  return {
    ...data,
    pages: data.pages.map((p, i) => ({
      ...p,
      unreadCount: i === 0 ? Math.max(0, p.unreadCount - 1) : p.unreadCount,
      items: p.items.map((n) => (n.id === id ? { ...n, readAt: now } : n)),
    })),
  };
}

export function applyReadAll(data: NotificationPages | undefined, now: string): NotificationPages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, unreadCount: 0, items: p.items.map((n) => (n.readAt ? n : { ...n, readAt: now })) })),
  };
}

export function setNotificationsCache(
  client: QueryClient,
  update: (data: NotificationPages | undefined) => NotificationPages | undefined,
): NotificationPages | undefined {
  const previous = client.getQueryData<NotificationPages>(NOTIFICATIONS_KEY);
  client.setQueryData<NotificationPages>(NOTIFICATIONS_KEY, update(previous));
  return previous;
}
