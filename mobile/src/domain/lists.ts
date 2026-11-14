import type { components } from '@/api/schema';

type S = components['schemas'];
type ListItem = S['ListItem'];
type WishType = S['WishType'];
type IdeaCategory = S['IdeaCategory'];

/** Гэрээний `listKind` (path): Bucket · To-do · Худалдан авалт · Wishlist (FR-9.1, 9.2, 9.6). */
export type ListKind = 'bucket' | 'todo' | 'shopping' | 'wishlist';
export const LIST_KINDS: ListKind[] = ['bucket', 'todo', 'shopping', 'wishlist'];
export const WISH_TYPES: WishType[] = ['MOVIE', 'BOOK', 'PLACE', 'OTHER'];
export const LIST_TITLE_MAX = 120;
const IDEA_CATEGORIES: IdeaCategory[] = ['FOOD', 'TRAVEL', 'HOME', 'SPORT', 'CULTURE', 'OUTDOOR', 'OTHER'];

export function isListKind(value: unknown): value is ListKind {
  return typeof value === 'string' && (LIST_KINDS as string[]).includes(value);
}

export interface ListGroups {
  /** «Хоёулаа хүсэж байна 💗» — хоёулаа санал өгсөн, дуусаагүй (AC-109). */
  wanted: ListItem[];
  /** Бусад дуусаагүй зүйл — `position`-оор. */
  open: ListItem[];
  /** Дууссан — доор бүлэглэгдэнэ, сүүлд дууссан нь эхэнд (AC-107). */
  done: ListItem[];
}

const byPosition = (a: ListItem, b: ListItem) => a.position - b.position;

/** Дэлгэцийн бүлэг (AC-107, AC-109): хоёулаа хүссэн нь дээр, дууссан нь доор. */
export function groupListItems(items: readonly ListItem[]): ListGroups {
  const notDone = items.filter((i) => !i.doneAt).sort(byPosition);
  const done = items
    .filter((i) => !!i.doneAt)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return { wanted: notDone.filter((i) => i.bothWant), open: notDone.filter((i) => !i.bothWant), done };
}

/** Дуусаагүй зүйлсийн дэлгэцийн дараалал — `PUT /lists/{kind}/order`-ийн `itemIds` (бүх нээлттэй зүйл). */
export function openOrder(groups: ListGroups): string[] {
  return [...groups.wanted, ...groups.open].map((i) => i.id);
}

/**
 * Нэг зүйлийг бүлэг дотроо нэг байр дээш/доош (AC-109 — чирэхийн хүртээмжтэй хувилбар). Бүлгийн
 * хязгаараас гарахгүй; хөдлөх боломжгүй бол `null`.
 */
export function moveWithinGroup(groups: ListGroups, id: string, delta: -1 | 1): string[] | null {
  const move = (list: ListItem[]): ListItem[] | null => {
    const i = list.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return null;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const wanted = move(groups.wanted);
  if (wanted) return openOrder({ ...groups, wanted });
  const open = move(groups.open);
  if (open) return openOrder({ ...groups, open });
  return null;
}

/** Сервер `reorder`-ийн хариуг ирэхээс өмнө кэшийг шинэ дараалалд оруулна (optimistic). */
export function applyOrder(items: readonly ListItem[], ids: readonly string[]): ListItem[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return items.map((item) => (rank.has(item.id) ? { ...item, position: rank.get(item.id) ?? item.position } : item));
}

/**
 * Wishlist → S-54 ноорог (AC-110): гарчиг, ангилал. Зүйлийн `category` нь болзооны ангилал бол
 * түүгээр, үгүй бол төрлөөс: кино, ном → Соёл; газар → Аялал.
 */
export function wishToPlanDraft(item: Pick<ListItem, 'title' | 'description' | 'category' | 'wishType'>): {
  title: string;
  description?: string;
  category: IdeaCategory;
} {
  const fromCategory = IDEA_CATEGORIES.find((c) => c === item.category?.toUpperCase());
  const fromWish: IdeaCategory =
    item.wishType === 'MOVIE' || item.wishType === 'BOOK' ? 'CULTURE' : item.wishType === 'PLACE' ? 'TRAVEL' : 'OTHER';
  return {
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    category: fromCategory ?? fromWish,
  };
}

export interface ListDraft {
  title: string;
  description?: string;
}

/**
 * Чатын «Жагсаалтад нэмэх» (FR-6.8, AC-91): гарчиг — текстийн эхний мөр (≤ 120), тайлбар — бүтэн
 * текст; байршилтай бол газрын нэр.
 */
export function listPrefillFrom(m: { text?: string | null; location?: { name: string } | null }): ListDraft {
  const text = m.text?.trim() ?? '';
  const firstLine = text.split('\n')[0]?.slice(0, LIST_TITLE_MAX) ?? '';
  const title = firstLine || m.location?.name?.slice(0, LIST_TITLE_MAX) || '';
  return { title, ...(text && text !== title ? { description: text } : {}) };
}

/** `?draft=` параметр (JSON) — эвдэрсэн, гарчиггүй бол `null`. */
export function parseListDraft(raw: string | string[] | undefined): ListDraft | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    const title = typeof p?.title === 'string' ? p.title.trim().slice(0, LIST_TITLE_MAX) : '';
    if (!title) return null;
    const description = typeof p.description === 'string' && p.description.trim() ? p.description : undefined;
    return { title, ...(description ? { description } : {}) };
  } catch {
    // Эвдэрсэн параметр — ноороггүй эхэлнэ
    return null;
  }
}

/** Bucket дуусахад «Дурсамж болгох» (AC-106) — S-32 ноорог: гарчиг, тайлбар, дууссан өдөр. */
export function bucketMemoryDraft(item: Pick<ListItem, 'title' | 'description'>, doneOn: string): {
  title: string;
  description?: string;
  occurredOn: string;
} {
  return { title: item.title, ...(item.description ? { description: item.description } : {}), occurredOn: doneOn };
}
