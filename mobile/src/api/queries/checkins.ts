import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { fetchPreferences, patchPreferences, PREFERENCES_KEY } from '@/api/queries/settings';
import { outbox } from '@/offline/outboxRuntime';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type CheckIn = S['CheckIn'];
export type CheckInInput = S['CheckInInput'];
export type CheckInSeries = S['CheckInSeries'];

/** Сэтгэл санааны check-in (FR-11) — гэрээ `CheckIns`. Key: `['checkins', range]` (`checkin.shared` шинэчилнэ). */
export const CHECKINS_KEY = ['checkins'] as const;
export const checkInsKey = (from: string, to: string) => ['checkins', from, to] as const;
export const TODAY_PATH = '/checkins/today';

export function useCheckIns(from: string, to: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: checkInsKey(from, to),
    queryFn: () => unwrap(api.GET('/checkins', { params: { query: { from, to } } })),
    enabled: !!accessToken,
  });
}

/** Өнөөдрийн check-in (хүний бүсийн өдөрт нэг — хоёр дахь нь засвар, AC-114). */
export function putTodayCheckIn(body: CheckInInput): Promise<CheckIn> {
  return unwrap(api.PUT('/checkins/today', { body }));
}

/** Сүлжээгүй үед — outbox (DD-AURA-017) холбогдмогц илгээнэ; PUT нь өдөрт нэг тул давхардахгүй. */
export async function enqueueTodayCheckIn(body: CheckInInput): Promise<void> {
  await outbox.enqueue({ method: 'PUT', path: TODAY_PATH, body: { ...body } });
  await outbox.flush().catch(() => 0);
}

/** «Өдөр бүр автоматаар хуваалцах» (`checkinAutoShare`, анхдагч унтраастай — AC-183). */
export function useCheckinAutoShare() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: PREFERENCES_KEY, queryFn: fetchPreferences, enabled: !!accessToken, select: (p) => p.checkinAutoShare });
}

export async function setCheckinAutoShare(client: QueryClient, value: boolean): Promise<void> {
  const prefs = await patchPreferences({ checkinAutoShare: value });
  client.setQueryData(PREFERENCES_KEY, prefs);
}

export function invalidateCheckIns(client: QueryClient): Promise<void> {
  return Promise.all([client.invalidateQueries({ queryKey: CHECKINS_KEY }), client.invalidateQueries({ queryKey: ['dashboard'] })]).then(() => undefined);
}
