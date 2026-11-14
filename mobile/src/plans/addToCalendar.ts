import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import type { DatePlan } from '@/api/queries/plans';

import { shareIcs } from './icsFile';
import { placeLabel } from './planForm';

/** `added` — утасны календарьт; `shared`/`downloaded` — `.ics` (зөвшөөрөлгүй эсвэл календарьгүй). */
export type AddToCalendarOutcome = 'added' | 'shared' | 'downloaded';

/** Болзооны үргэлжлэх хугацаа гэрээнд алга — календарьт 2 цагийн үйл явдал болгоно. */
export const EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

async function writableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const def = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (def?.allowsModifications) return def.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  return (writable.find((c) => c.isPrimary) ?? writable[0])?.id ?? null;
}

/**
 * «Календарьт нэмэх» (FR-7.13, AC-101): `expo-calendar`-аар утасны календарьт зөв цаг (UTC
 * агшин), бүс, газартай үйл явдал. Зөвшөөрөл татгалзсан эсвэл бичих календарьгүй бол
 * `.ics` хуваалцана.
 */
export async function addToCalendar(plan: DatePlan): Promise<AddToCalendarOutcome> {
  const permission = await Calendar.requestCalendarPermissionsAsync().catch(() => null);
  if (permission?.status !== 'granted') return shareIcs(plan);
  const calendarId = await writableCalendarId().catch(() => null);
  if (!calendarId) return shareIcs(plan);
  const start = new Date(plan.startsAt);
  await Calendar.createEventAsync(calendarId, {
    title: plan.title,
    startDate: start,
    endDate: new Date(start.getTime() + EVENT_DURATION_MS),
    timeZone: plan.timezone,
    ...(plan.place ? { location: placeLabel(plan.place) } : {}),
    ...(plan.description ? { notes: plan.description } : {}),
  });
  return 'added';
}
