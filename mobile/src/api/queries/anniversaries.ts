import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Occasion = S['Occasion'];
export type OccasionDetail = S['OccasionDetail'];
export type OccasionKind = S['OccasionKind'];
export type Anniversary = S['Anniversary'];
export type AnniversaryInput = S['AnniversaryInput'];
export type AnniversaryUpdate = S['AnniversaryUpdate'];
export type AnniversaryKind = S['AnniversaryKind'];
export type GiftIdea = S['GiftIdea'];
export type Celebration = S['Celebration'];

/**
 * Ой ба тэмдэглэлт өдөр (FR-8) — гэрээ `Anniversaries`, `Me` (celebrations). Key:
 * `['anniversaries']`, `['occasion', key]`, `['gift-ideas', key]` (зөвхөн өөрийнх — AC-40),
 * `['anniversary', id]`, `['celebrations']`.
 */
export const ANNIVERSARIES_KEY = ['anniversaries'] as const;
export const CELEBRATIONS_KEY = ['celebrations'] as const;
export const occasionKey = (key: string) => ['occasion', key] as const;
export const giftIdeasKey = (key: string) => ['gift-ideas', key] as const;
export const anniversaryKey = (id: string) => ['anniversary', id] as const;

export const ANNIVERSARY_KINDS: AnniversaryKind[] = ['ANNIVERSARY', 'BIRTHDAY', 'FIRST_MET', 'OTHER'];
/** Сануулга (FR-8.4): 7 хоног, 1 өдөр, тухайн өдөр. */
export const REMINDER_OPTIONS = [7, 1, 0] as const;
export const OCCASION_NOTE_MAX = 2000;
export const GIFT_TEXT_MAX = 200;

export function useOccasions(tz: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ANNIVERSARIES_KEY,
    queryFn: () => unwrap(api.GET('/anniversaries', { params: { query: { tz } } })),
    enabled: !!accessToken,
  });
}

export function useOccasion(key: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: occasionKey(key ?? ''),
    queryFn: () => unwrap(api.GET('/occasions/{occasionKey}', { params: { path: { occasionKey: key ?? '' } } })),
    enabled: !!accessToken && !!key,
  });
}

export function putOccasionNote(key: string, body: { note: string | null; memoryIds: string[]; reminderDays: number[]; version: number }): Promise<OccasionDetail> {
  return unwrap(api.PUT('/occasions/{occasionKey}/note', { params: { path: { occasionKey: key } }, body }));
}

export function useGiftIdeas(key: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: giftIdeasKey(key ?? ''),
    queryFn: () => unwrap(api.GET('/gift-ideas', { params: { query: { occasionKey: key ?? '' } } })),
    enabled: !!accessToken && !!key,
  });
}

export function createGiftIdea(occasionKeyValue: string, text: string): Promise<GiftIdea> {
  return unwrap(api.POST('/gift-ideas', { body: { occasionKey: occasionKeyValue, text } }));
}

export function setGiftIdeaDone(id: string, done: boolean): Promise<GiftIdea> {
  return unwrap(api.PATCH('/gift-ideas/{giftIdeaId}', { params: { path: { giftIdeaId: id } }, body: { done } }));
}

export async function deleteGiftIdea(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/gift-ideas/{giftIdeaId}', { params: { path: { giftIdeaId: id } } }));
}

export function useAnniversary(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: anniversaryKey(id ?? ''),
    queryFn: () => unwrap(api.GET('/anniversaries/{anniversaryId}', { params: { path: { anniversaryId: id ?? '' } } })),
    enabled: !!accessToken && !!id,
  });
}

export function createAnniversary(body: AnniversaryInput): Promise<Anniversary> {
  return unwrap(api.POST('/anniversaries', { body }));
}

export function updateAnniversary(id: string, body: AnniversaryUpdate): Promise<Anniversary> {
  return unwrap(api.PATCH('/anniversaries/{anniversaryId}', { params: { path: { anniversaryId: id } }, body }));
}

export async function deleteAnniversary(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/anniversaries/{anniversaryId}', { params: { path: { anniversaryId: id } } }));
}

export function useCelebrations() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: CELEBRATIONS_KEY, queryFn: () => unwrap(api.GET('/me/celebrations')), enabled: !!accessToken });
}

/** Үзсэн (AC-MO-02, GAP-23 — хэрэглэгч тутамд нэг удаа, idempotent). */
export async function markCelebrationSeen(eventKey: string): Promise<void> {
  await unwrapEmpty(api.POST('/me/celebrations/{eventKey}/seen', { params: { path: { eventKey } } }));
}

/** S-25 нь ойн мэндчилгээ — ой ба «N хоног»-ийн баяр (бусад баяр өөрийн дэлгэцтэй). */
export function isOccasionCelebration(c: Celebration): boolean {
  return c.kind === 'ANNIVERSARY' || c.kind === 'MILESTONE';
}

export function invalidateOccasions(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ANNIVERSARIES_KEY }),
    client.invalidateQueries({ queryKey: ['occasion'] }),
    client.invalidateQueries({ queryKey: ['anniversary'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ]).then(() => undefined);
}

async function unwrapEmpty(p: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await p;
  if (!response.ok) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
}
