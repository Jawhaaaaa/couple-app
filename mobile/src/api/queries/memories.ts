import { type QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { isCalendarDate } from '@/i18n/calendarDate';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type MemorySummary = S['MemorySummary'];
export type Memory = S['Memory'];
export type MemoryPage = S['MemoryPage'];
export type MonthCount = S['MonthCount'];
export type MemoryCreate = S['MemoryCreate'];
export type MemoryUpdate = S['MemoryUpdate'];
export type MemoryMediaItem = S['MemoryMediaItem'];
export type Perspective = S['Perspective'];
export type Comment = S['Comment'];
export type ReactionEmoji = S['ReactionEmoji'];
export type ReactionSummary = S['ReactionSummary'];
export type DeletePreview = S['DeletePreview'];
export type TrashEntry = S['TrashEntry'];
export type MemoryPlace = S['MemoryPlace'];
export type MemoryGroup = S['MemoryGroup'];
export type MemoryGroupDetail = S['MemoryGroupDetail'];
export type Place = S['Place'];
export type MediaRef = S['MediaRef'];

/**
 * Дурсамж (FR-5) — гэрээ `contracts/openapi.yaml` (Memories). Query key-үүд `['memories', …]`,
 * `['memory', id]`, `['memory-months', scope]` нь realtime `memory.*` үйл явдлаар шинэчлэгдэнэ
 * (`eventRouter.ts`); хогийн сав, газар, шошго нь `['memories', …]` дор тул тэд ч мөн адил.
 * Бүлэг (`['memory-groups']`, `['memory-group', id]`) нь мутацийн дараа гараар шинэчлэгдэнэ.
 */
export const MEMORIES_KEY = ['memories'] as const;
export const MEMORY_MONTHS_KEY = ['memory-months'] as const;
export const TRASH_KEY = ['memories', 'trash'] as const;
export const PLACES_KEY = ['memories', 'places'] as const;
export const TAGS_KEY = ['memories', 'tags'] as const;
export const GROUPS_KEY = ['memory-groups'] as const;
export const memoryKey = (id: string) => ['memory', id] as const;
export const groupKey = (id: string) => ['memory-group', id] as const;

export const PAGE_SIZE = 20;
export const PERSPECTIVE_MAX = 2000;
export const COMMENT_MAX = 2000;

export type MemoryScopeParam = 'shared' | 'private' | 'all';

/** S-30/S-34-ийн шүүлтүүр (`GET /memories`-ийн query, cursor/limit-гүй). */
export interface MemoryFilters {
  q?: string;
  from?: string;
  to?: string;
  tag?: string;
  groupId?: string;
  author?: 'me' | 'partner';
  favorite?: boolean;
  hasLocation?: boolean;
  scope?: MemoryScopeParam;
  place?: string;
}

const FILTER_KEYS: (keyof MemoryFilters)[] = ['q', 'from', 'to', 'tag', 'groupId', 'author', 'favorite', 'hasLocation', 'scope', 'place'];

/**
 * Хоосон утгагүй query (AC-175): мөрийг тайрч, хоосон/`undefined`/`false`-ийг хасна — `false`
 * шүүлт гэдэг нь «шүүхгүй» гэсэн үг. Түлхүүрийн дараалал тогтвортой тул query key болгоно.
 */
export function buildMemoryQuery(filters: MemoryFilters): MemoryFilters {
  const out: MemoryFilters = {};
  for (const key of FILTER_KEYS) {
    const raw = filters[key];
    if (raw === undefined || raw === null || raw === false) continue;
    if (typeof raw === 'string') {
      const value = raw.trim();
      if (value) (out as Record<string, unknown>)[key] = value;
    } else {
      (out as Record<string, unknown>)[key] = raw;
    }
  }
  return out;
}

/**
 * S-34-ийн маягтыг шүүлт болгоно (AC-175): дутуу/буруу огноо хасагдана — бичиж дуусаагүй
 * огноогоор хүсэлт явуулахгүй.
 */
export function searchFilters(form: MemoryFilters): MemoryFilters {
  const date = (v: string | undefined) => (v && isCalendarDate(v.trim()) ? v.trim() : undefined);
  return buildMemoryQuery({ ...form, from: date(form.from), to: date(form.to) });
}

export function hasActiveFilters(filters: MemoryFilters): boolean {
  return Object.keys(buildMemoryQuery(filters)).length > 0;
}

export function fetchMemories(filters: MemoryFilters, cursor: string | null): Promise<MemoryPage> {
  const query = { ...buildMemoryQuery(filters), limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) };
  return unwrap(api.GET('/memories', { params: { query } }));
}

export function useMemoriesInfinite(filters: MemoryFilters, { enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = buildMemoryQuery(filters);
  return useInfiniteQuery({
    queryKey: [...MEMORIES_KEY, query],
    queryFn: ({ pageParam }) => fetchMemories(query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!accessToken && enabled,
  });
}

export function useMemoryMonths(scope: MemoryScopeParam | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: [...MEMORY_MONTHS_KEY, scope ?? 'all'],
    queryFn: () => unwrap(api.GET('/memories/months', { params: { query: scope ? { scope } : {} } })),
    enabled: !!accessToken,
  });
}

export function fetchMemory(id: string): Promise<Memory> {
  return unwrap(api.GET('/memories/{memoryId}', { params: { path: { memoryId: id } } }));
}

export function useMemory(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: memoryKey(id ?? ''), queryFn: () => fetchMemory(id ?? ''), enabled: !!accessToken && !!id });
}

export function createMemory(body: MemoryCreate): Promise<Memory> {
  return unwrap(api.POST('/memories', { body }));
}

export function updateMemory(id: string, body: MemoryUpdate): Promise<Memory> {
  return unwrap(api.PATCH('/memories/{memoryId}', { params: { path: { memoryId: id } }, body }));
}

export function fetchDeletePreview(id: string): Promise<DeletePreview> {
  return unwrap(api.GET('/memories/{memoryId}/delete-preview', { params: { path: { memoryId: id } } }));
}

export function deleteMemory(id: string): Promise<TrashEntry> {
  return unwrap(api.DELETE('/memories/{memoryId}', { params: { path: { memoryId: id } } }));
}

export function useTrash() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: TRASH_KEY, queryFn: () => unwrap(api.GET('/memories/trash')), enabled: !!accessToken });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Хогийн савны үлдсэн хоног (AC-23): серверийн `daysLeft`, үгүй бол `purgeAfter`-аас (≥ 0). */
export function trashDaysLeft(entry: Pick<TrashEntry, 'daysLeft' | 'purgeAfter'>, now: number): number {
  if (typeof entry.daysLeft === 'number') return Math.max(0, entry.daysLeft);
  return Math.max(0, Math.ceil((Date.parse(entry.purgeAfter) - now) / DAY_MS));
}

export function restoreMemory(id: string): Promise<Memory> {
  return unwrap(api.POST('/memories/{memoryId}/restore', { params: { path: { memoryId: id } } }));
}

export async function purgeMemory(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/memories/{memoryId}/purge', { params: { path: { memoryId: id } } }));
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  const params = { params: { path: { memoryId: id } } };
  await unwrapEmpty(favorite ? api.PUT('/memories/{memoryId}/favorite', params) : api.DELETE('/memories/{memoryId}/favorite', params));
}

export function savePerspective(id: string, text: string, version?: number): Promise<Perspective> {
  return unwrap(
    api.PUT('/memories/{memoryId}/perspective', {
      params: { path: { memoryId: id } },
      body: { text, ...(version !== undefined ? { version } : {}) },
    }),
  );
}

export async function deletePerspective(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/memories/{memoryId}/perspective', { params: { path: { memoryId: id } } }));
}

export function updateComment(commentId: string, text: string, version: number): Promise<Comment> {
  return unwrap(api.PATCH('/comments/{commentId}', { params: { path: { commentId } }, body: { text, version } }));
}

export async function deleteComment(commentId: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/comments/{commentId}', { params: { path: { commentId } } }));
}

export async function setReaction(id: string, emoji: ReactionEmoji | null): Promise<void> {
  const path = { params: { path: { memoryId: id } } };
  await unwrapEmpty(emoji ? api.PUT('/memories/{memoryId}/reaction', { ...path, body: { emoji } }) : api.DELETE('/memories/{memoryId}/reaction', path));
}

export function useMemoryTags() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: TAGS_KEY, queryFn: () => unwrap(api.GET('/memory-tags')), enabled: !!accessToken });
}

export function useMemoryPlaces({ enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: PLACES_KEY, queryFn: () => unwrap(api.GET('/memories/places')), enabled: !!accessToken && enabled });
}

export function useMemoryGroups() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: GROUPS_KEY, queryFn: () => unwrap(api.GET('/memory-groups')), enabled: !!accessToken });
}

export function useMemoryGroup(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: groupKey(id ?? ''),
    queryFn: () => unwrap(api.GET('/memory-groups/{groupId}', { params: { path: { groupId: id ?? '' } } })),
    enabled: !!accessToken && !!id,
  });
}

export function createGroup(name: string): Promise<MemoryGroup> {
  return unwrap(api.POST('/memory-groups', { body: { name } }));
}

export function renameGroup(id: string, name: string, version: number): Promise<MemoryGroup> {
  return unwrap(api.PATCH('/memory-groups/{groupId}', { params: { path: { groupId: id } }, body: { name, version } }));
}

export async function deleteGroup(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/memory-groups/{groupId}', { params: { path: { groupId: id } } }));
}

export async function removeFromGroup(groupId: string, memoryId: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/memory-groups/{groupId}/memories/{memoryId}', { params: { path: { groupId, memoryId } } }));
}

/** 204 хариутай дуудлага: амжилтгүй бол `ApiRequestError`. */
async function unwrapEmpty(p: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await p;
  if (!response.ok) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
}

/**
 * 409 `VERSION_CONFLICT`-ийн серверийн одоогийн объект (`details.current`, DD-AURA-016) ба
 * хэн өөрчилсөн (`details.updatedBy`). Зөрчил биш бол `null` (AC-131).
 */
export function conflictCurrent<T>(error: unknown): { current: T; updatedBy: string | null } | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'VERSION_CONFLICT') return null;
  const details = error.body?.details;
  const current = (details?.current ?? (error.body as { current?: unknown } | null)?.current) as T | undefined;
  if (!current || typeof current !== 'object') return null;
  const updatedBy = typeof details?.updatedBy === 'string' ? details.updatedBy : null;
  return { current, updatedBy };
}

/** Дурсамжийн өөрчлөлтийн дараа жагсаалт, сар, нэгтгэлийг шинэчилнэ. */
export function invalidateMemoryLists(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: MEMORIES_KEY });
  void queryClient.invalidateQueries({ queryKey: MEMORY_MONTHS_KEY });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

/** Жагсаалтын кэш дэх нэг дурсамжийг (timeline, дуртай) шууд засна — optimistic. */
export function patchSummaryInLists(queryClient: QueryClient, id: string, patch: Partial<MemorySummary>) {
  queryClient.setQueriesData<{ pages: MemoryPage[]; pageParams: unknown[] }>({ queryKey: MEMORIES_KEY }, (data) => {
    if (!data || !Array.isArray(data.pages)) return data;
    return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) })) };
  });
}

/** Дурсамжийн хамгийн тохиромжтой үзүүлэх URL (жижиг → том → эх). */
export function mediaUrl(media: MediaRef | null | undefined, size: 'sm' | 'md' | 'lg' = 'md'): string | null {
  if (!media) return null;
  const { urls } = media;
  if (size === 'sm') return urls.sm ?? urls.md ?? urls.lg ?? urls.original;
  if (size === 'md') return urls.md ?? urls.lg ?? urls.original;
  return urls.lg ?? urls.original;
}

/**
 * Зураг ачаалж дуустал харагдах орлуулга (FR-19.10, AC-160): blurhash байвал түүгээр, үгүй бол
 * жижиг (`sm`) thumbnail — том хувилбар (`md`/`lg`) ачаалагдах хооронд. `sm`-ийг өөрийг нь
 * харуулахад орлуулга хэрэггүй (blurhash л).
 */
export function mediaPlaceholder(
  media: Pick<MediaRef, 'blurhash' | 'urls'> | null | undefined,
  size: 'sm' | 'md' | 'lg' = 'md',
): { blurhash: string } | { uri: string } | undefined {
  if (!media) return undefined;
  if (media.blurhash) return { blurhash: media.blurhash };
  const thumb = media.urls.sm;
  if (size === 'sm' || !thumb || thumb === mediaUrl(media as MediaRef, size)) return undefined;
  return { uri: thumb };
}

/** S-23 «Жилийн өмнөх өнөөдөр» (FR-3.6, AC-73): өмнөх жилүүдийн ижил өдрийн дурсамжууд жилээр. */
export type OnThisDayGroup = S['OnThisDayGroup'];
export const ON_THIS_DAY_KEY = ['memories', 'on-this-day'] as const;

export function useOnThisDay() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ON_THIS_DAY_KEY,
    queryFn: (): Promise<OnThisDayGroup[]> => unwrap(api.GET('/memories/on-this-day')),
    enabled: !!accessToken,
  });
}
