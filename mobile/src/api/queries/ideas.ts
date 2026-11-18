import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import type { Locale } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type DateIdea = S['DateIdea'];
export type DateIdeaInput = S['DateIdeaInput'];
export type DateIdeaUpdate = S['DateIdeaUpdate'];
export type LibraryIdea = S['LibraryIdea'];
export type IdeaCategory = S['IdeaCategory'];
export type IdeaSetting = S['IdeaSetting'];
export type BudgetBand = S['BudgetBand'];
export type Season = S['Season'];
export type RandomPick = S['RandomPick'];
export type DeckCard = S['DeckCard'];
export type DeckMatch = S['DeckMatch'];
export type SwipeResult = S['SwipeResult'];
export type BudgetSummary = S['BudgetSummary'];
export type AnyIdea = DateIdea | LibraryIdea;

/**
 * Болзооны санаа (FR-7.1, 7.8, 7.9, 7.11) ба сарын төсөв (FR-7.7) — гэрээ `Ideas`, `Deck`,
 * `Budget`. Key: `['ideas', filters]`, `['idea', id]`, `['idea-library', filters]`, `['deck']`,
 * `['deck','matches']` (realtime `deck.matched`), `['budget', month]`.
 */
export const IDEAS_KEY = ['ideas'] as const;
export const LIBRARY_KEY = ['idea-library'] as const;
export const DECK_KEY = ['deck'] as const;
export const DECK_MATCHES_KEY = ['deck', 'matches'] as const;
export const ideaKey = (id: string) => ['idea', id] as const;
export const budgetKey = (month: string) => ['budget', month] as const;

export const SETTINGS: IdeaSetting[] = ['HOME', 'OUTDOOR'];
export const SEASONS: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'AUTUMN'];
export const BUDGET_BANDS: BudgetBand[] = ['FREE', 'UPTO_50K', '50K_150K', 'OVER_150K'];
/** S-51/S-56-ийн «≤ төсөв» сонголт (₮). */
export const MAX_BUDGETS = [0, 50_000, 150_000] as const;
export const IDEA_TITLE_MAX = 120;
export const DECK_BATCH = 10;

export interface IdeaFilters {
  category?: IdeaCategory;
  setting?: IdeaSetting;
  maxBudget?: number;
  q?: string;
}

/** Хоосон утгагүй, тогтвортой дараалалтай query (query key болно). */
export function ideaQuery(filters: IdeaFilters): IdeaFilters {
  const out: IdeaFilters = {};
  if (filters.category) out.category = filters.category;
  if (filters.setting) out.setting = filters.setting;
  if (typeof filters.maxBudget === 'number') out.maxBudget = filters.maxBudget;
  const q = filters.q?.trim();
  if (q) out.q = q;
  return out;
}

export function useIdeas(filters: IdeaFilters) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = ideaQuery(filters);
  return useQuery({
    queryKey: [...IDEAS_KEY, query],
    queryFn: () => unwrap(api.GET('/ideas', { params: { query } })),
    enabled: !!accessToken,
  });
}

export function useIdea(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ideaKey(id ?? ''),
    queryFn: () => unwrap(api.GET('/ideas/{ideaId}', { params: { path: { ideaId: id ?? '' } } })),
    enabled: !!accessToken && !!id,
  });
}

export function createIdea(body: DateIdeaInput): Promise<DateIdea> {
  return unwrap(api.POST('/ideas', { body }));
}

export function updateIdea(id: string, body: DateIdeaUpdate): Promise<DateIdea> {
  return unwrap(api.PATCH('/ideas/{ideaId}', { params: { path: { ideaId: id } }, body }));
}

export async function deleteIdea(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/ideas/{ideaId}', { params: { path: { ideaId: id } } }));
}

export interface RandomFilters {
  category?: IdeaCategory;
  setting?: IdeaSetting;
  maxBudget?: number;
  includeLibrary?: boolean;
}

/** `GET /ideas/random` (AC-98): 204 бол тохирох санаа алга — `null`. */
export async function pickRandomIdea(filters: RandomFilters): Promise<RandomPick | null> {
  const query = { ...ideaQuery(filters), ...(filters.includeLibrary ? { includeLibrary: true } : {}) };
  const { data, error, response } = await api.GET('/ideas/random', { params: { query } });
  if (response.status === 204) return null;
  if (!response.ok || error !== undefined) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
  return data ?? null;
}

export interface LibraryFilters {
  season?: Season;
  budget?: BudgetBand;
  setting?: IdeaSetting;
  longDistance?: boolean;
  category?: IdeaCategory;
}

export function libraryQuery(filters: LibraryFilters, locale: Locale) {
  return {
    ...(filters.season ? { season: filters.season } : {}),
    ...(filters.budget ? { budget: filters.budget } : {}),
    ...(filters.setting ? { setting: filters.setting } : {}),
    ...(filters.longDistance ? { longDistance: true } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    locale,
  };
}

export function useIdeaLibrary(filters: LibraryFilters, locale: Locale) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = libraryQuery(filters, locale);
  return useQuery({
    queryKey: [...LIBRARY_KEY, query],
    queryFn: () => unwrap(api.GET('/idea-library', { params: { query } })),
    enabled: !!accessToken,
  });
}

/** «Миний санаа болгох» (AC-99): хосын жагсаалтад хуулбар, эх өөрчлөгдөхгүй. */
export function adoptLibraryIdea(libraryId: string): Promise<DateIdea> {
  return unwrap(api.POST('/idea-library/{libraryId}/adopt', { params: { path: { libraryId } } }));
}

export function useDeck() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: [...DECK_KEY, 'next'],
    queryFn: () => unwrap(api.GET('/deck/next', { params: { query: { limit: DECK_BATCH } } })),
    enabled: !!accessToken,
  });
}

export function useDeckMatches() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: DECK_MATCHES_KEY, queryFn: () => unwrap(api.GET('/deck/matches')), enabled: !!accessToken });
}

/** Нууц swipe (AC-36): хариунд зөвхөн тохирол — нөгөөгийн сонголт хэзээ ч ирэхгүй. */
export function swipeDeck(ideaRef: string, liked: boolean): Promise<SwipeResult> {
  return unwrap(api.POST('/deck/swipes', { body: { ideaRef, liked } }));
}

export function useBudgetSummary(month: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: budgetKey(month),
    queryFn: () => unwrap(api.GET('/budget/summary', { params: { query: { month } } })),
    enabled: !!accessToken,
  });
}

export function isLibraryIdea(idea: AnyIdea): idea is LibraryIdea {
  return 'budgetBand' in idea;
}

export function invalidateIdeas(client: QueryClient): Promise<void> {
  return Promise.all([client.invalidateQueries({ queryKey: IDEAS_KEY }), client.invalidateQueries({ queryKey: ['idea'] })]).then(() => undefined);
}

async function unwrapEmpty(p: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await p;
  if (!response.ok) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
}
