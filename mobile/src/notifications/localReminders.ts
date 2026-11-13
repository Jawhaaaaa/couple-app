import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';

export type Reminder = components['schemas']['Reminder'];

/** Апп-ын товлосон мэдэгдлийн угтвар — бусад (систем, сан)-ын товлолтод хүрэхгүй. */
export const PREFIX = 'aura-rem-';
/** iOS нэг апп-д 64 хүртэл локал мэдэгдэл — нөөцтэйгөөр ойрын 60-ыг. */
export const MAX_LOCAL = 60;
/** Ойрын 30 хоногийн сануулгыг товлоно (апп нээгдэх бүрд дахин тааруулна). */
export const HORIZON_MS = 30 * 24 * 3600 * 1000;

export interface ScheduledLocal {
  identifier: string;
  fireAt: string | null;
}

export function identifierOf(r: Pick<Reminder, 'id' | 'fireAt'>): string {
  // fireAt-ийг id-д оруулна — цаг өөрчлөгдвөл хуучныг цуцалж шинийг товлоно (AC-35)
  return `${PREFIX}${r.id}-${Date.parse(r.fireAt)}`;
}

/**
 * Серверийн сануулга ↔ төхөөрөмжийн товлолт (LocalNotificationScheduler, FR-19.4, AC-35, AC-104):
 * цуцлагдсан/цаг нь өөрчлөгдсөнийг цуцалж, шинийг товлоно; өнгөрсөн ба 60-аас хэтэрснийг алгасна.
 */
export function planLocalReminders(current: ScheduledLocal[], wanted: Reminder[], now: number): { cancel: string[]; schedule: Reminder[] } {
  const future = wanted
    .filter((r) => Date.parse(r.fireAt) > now && Date.parse(r.fireAt) <= now + HORIZON_MS)
    .sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt))
    .slice(0, MAX_LOCAL);
  const wantedIds = new Set(future.map(identifierOf));
  const mine = current.filter((c) => c.identifier.startsWith(PREFIX));
  const existing = new Set(mine.map((c) => c.identifier));
  return {
    cancel: mine.filter((c) => !wantedIds.has(c.identifier)).map((c) => c.identifier),
    schedule: future.filter((r) => !existing.has(identifierOf(r))),
  };
}

const TYPE_BY_SOURCE: Record<Reminder['sourceType'], string> = {
  DATE_PLAN: 'DATE_REMINDER',
  ANNIVERSARY: 'ANNIVERSARY_REMINDER',
  LETTER: 'LETTER_DELIVERED',
  GREETING: 'GREETING_MORNING',
  INACTIVITY: 'INACTIVITY_NUDGE',
};

/**
 * Native-д серверийн хуваарьт сануулгыг локал мэдэгдэл болгон товлоно (вэбэд сервер Web Push-ээр).
 * Зөвшөөрөл өгөөгүй бол юу ч хийхгүй — зөвшөөрлийг S-101 л асууна.
 */
export async function syncLocalReminders(now: number = Date.now()): Promise<{ cancelled: number; scheduled: number } | null> {
  if (Platform.OS === 'web') return null;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;
  const to = new Date(now + HORIZON_MS).toISOString();
  const reminders: Reminder[] = await unwrap(api.GET('/reminders', { params: { query: { from: new Date(now).toISOString(), to } } }));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const current = scheduled.map((n) => ({ identifier: n.identifier, fireAt: null }));
  const plan = planLocalReminders(current, reminders, now);
  await Promise.all(plan.cancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  for (const r of plan.schedule) {
    await Notifications.scheduleNotificationAsync({
      identifier: identifierOf(r),
      content: { title: r.title, data: { type: TYPE_BY_SOURCE[r.sourceType], deepLink: r.deepLink } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.fireAt) },
    });
  }
  return { cancelled: plan.cancel.length, scheduled: plan.schedule.length };
}
