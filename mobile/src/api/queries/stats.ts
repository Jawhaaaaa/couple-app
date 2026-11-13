import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Stats = S['Stats'];
export type YearInReview = S['YearInReview'];

export const STATS_KEY = ['stats'] as const;
export const yearKey = (year: number) => ['year-in-review', year] as const;

/** S-71 Статистик (FR-12.2, FR-12.3, AC-117) — DB-ийн бодит тоо. */
export function useStats() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: STATS_KEY, queryFn: (): Promise<Stats> => unwrap(api.GET('/stats')), enabled: !!accessToken });
}

/** S-72 «Бидний жил» (FR-12.4, AC-118) — S-30-ийн «Recap» таб ч ижил өгөгдлийг (AC-86). */
export function useYearInReview(year: number | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: yearKey(year ?? 0),
    queryFn: (): Promise<YearInReview> => unwrap(api.GET('/year-in-review/{year}', { params: { path: { year: year ?? 0 } } })),
    enabled: !!accessToken && year !== null,
  });
}
