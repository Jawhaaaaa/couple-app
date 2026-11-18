import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Recap = S['Recap'];
export type RecapSlide = S['RecapSlide'];
export type RecapSummary = S['RecapSummary'];

/** Жилийн ойн хураангуй (FR-5.11, AC-84) — S-30-ийн «Recap» таб ба S-38 story. */
export const RECAPS_KEY = ['recaps'] as const;
export const recapKey = (id: string) => ['recap', id] as const;

export function useRecaps({ enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: RECAPS_KEY, queryFn: () => unwrap(api.GET('/recaps')), enabled: !!accessToken && enabled });
}

export function useRecap(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: recapKey(id ?? ''),
    queryFn: () => unwrap(api.GET('/recaps/{recapId}', { params: { path: { recapId: id ?? '' } } })),
    enabled: !!accessToken && !!id,
  });
}
