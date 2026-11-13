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

// --- S-83 мэдэгдлийн тохиргоо (FR-13.2, FR-13.3, FR-13.5, FR-13.7) ---

export type NotificationSettings = components['schemas']['NotificationSettings'];
export type QuietModeState = components['schemas']['QuietModeState'];
export const NOTIFICATION_SETTINGS_KEY = ['notification-settings'] as const;

export function fetchNotificationSettings(): Promise<NotificationSettings> {
  return unwrap(api.GET('/notification-settings'));
}

export function saveNotificationSettings(body: NotificationSettings): Promise<NotificationSettings> {
  return unwrap(api.PUT('/notification-settings', { body }));
}

/** «Түр тайван байх» 1 цаг – 7 хоног (AC-123). */
export function enableQuietMode(durationMinutes: number): Promise<QuietModeState> {
  return unwrap(api.PUT('/me/quiet-mode', { body: { durationMinutes } }));
}

export async function disableQuietMode(): Promise<void> {
  await unwrap(api.DELETE('/me/quiet-mode'));
}

/** Төрлүүдийг бүлгээр асаах/унтраах (AC-119) — бүлгийн бүх төрөл хамт. */
export const NOTIFICATION_GROUPS: readonly { key: string; types: readonly string[] }[] = [
  { key: 'messages', types: ['MESSAGE_NEW', 'SCREENSHOT_TAKEN'] },
  { key: 'signals', types: ['HEART_RECEIVED', 'HUG_RECEIVED', 'THINKING_OF_YOU'] },
  { key: 'memories', types: ['MEMORY_CREATED', 'MEMORY_COMMENT'] },
  { key: 'plans', types: ['DATE_PROPOSED', 'DATE_RESPONDED', 'PROMISE_PROPOSED'] },
  { key: 'reminders', types: ['DATE_REMINDER', 'ANNIVERSARY_REMINDER'] },
  { key: 'letters', types: ['LETTER_DELIVERED', 'CAPSULE_OPENED'] },
  { key: 'question', types: ['QUESTION_PARTNER_ANSWERED'] },
  { key: 'nudges', types: ['INACTIVITY_NUDGE'] },
];

export function groupEnabled(settings: Pick<NotificationSettings, 'disabledTypes'>, types: readonly string[]): boolean {
  return types.every((t) => !settings.disabledTypes.includes(t));
}

export function toggleGroup(settings: NotificationSettings, types: readonly string[], enabled: boolean): NotificationSettings {
  const set = new Set(settings.disabledTypes);
  for (const t of types) {
    if (enabled) set.delete(t);
    else set.add(t);
  }
  return { ...settings, disabledTypes: [...set] };
}

export const LOCAL_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
