import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

import { patchPreferences } from './settings';

type S = components['schemas'];
export type FirstWeekState = S['FirstWeekState'];
export type FirstWeekTask = S['FirstWeekTask'];

/**
 * Эхний 7 хоногийн даалгавар (FR-16.4, AC-134) — `GET /me/first-week-tasks`: хос холбогдсон өдрөөс өдөрт
 * нэг (`today`), 8 дахь өдөр, хосгүй эсвэл «Нуух» дарсан бол `visible = false`. Бүгдийг сервер шийднэ.
 */
export const FIRST_WEEK_KEY = ['first-week'] as const;

export function fetchFirstWeek(): Promise<FirstWeekState> {
  return unwrap(api.GET('/me/first-week-tasks'));
}

export function useFirstWeek() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: FIRST_WEEK_KEY, queryFn: fetchFirstWeek, enabled: !!accessToken });
}

/** «Болсон» / «Алгасах» — хариу нь шинэ төлөв. */
export function setFirstWeekTaskStatus(taskKey: string, status: 'DONE' | 'SKIPPED'): Promise<FirstWeekState> {
  return unwrap(api.PUT('/me/first-week-tasks/{taskKey}', { params: { path: { taskKey } }, body: { status } }));
}

/** «Нуух» — `Preferences.firstWeekHidden` (бүх төхөөрөмжид). */
export function hideFirstWeek() {
  return patchPreferences({ firstWeekHidden: true });
}
