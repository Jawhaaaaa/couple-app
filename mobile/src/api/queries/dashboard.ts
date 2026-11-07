import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { deviceTimezone } from '@/auth/device';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Dashboard = S['Dashboard'];
export type PersonCard = S['PersonCard'];
export type WeatherNow = S['WeatherNow'];
export type WeatherForecast = S['WeatherForecast'];
export type SignalSummary = S['SignalSummary'];
export type SignalKind = S['SignalKind'];
export type DatePlanSummary = S['DatePlanSummary'];
export type OccasionSummary = S['OccasionSummary'];
export type MemorySummary = S['MemorySummary'];
export type LetterTeaser = S['LetterTeaser'];
export type Couple = S['Couple'];

/**
 * S-20 нүүрний нэгтгэл (`GET /dashboard?tz=`). Key `['dashboard']` нь persist хийгдэнэ
 * (offline-д кэшээс, AC-156); `signal.received`, `presence.changed`, `quiet.changed` г.м.
 * realtime үйл явдал үүнийг шинэчилнэ (`eventRouter.ts`).
 */
export const DASHBOARD_KEY = ['dashboard'] as const;

export function fetchDashboard(tz: string | null): Promise<Dashboard> {
  return unwrap(api.GET('/dashboard', { params: { query: tz ? { tz } : {} } }));
}

export function useDashboard() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: DASHBOARD_KEY, queryFn: () => fetchDashboard(deviceTimezone()), enabled: !!accessToken });
}

/** «Уулзалт тэмдэглэх» (FR-3.7): `null` бол арилгана. */
export function setNextMeetup(at: string | null): Promise<Couple> {
  return unwrap(api.PUT('/couple/next-meetup', { body: { at } }));
}

export function answerSurvey(score: number | null): Promise<unknown> {
  return unwrap(api.POST('/me/survey', { body: { score } }));
}
