import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import type { ListKind } from '@/domain/lists';
import { outbox } from '@/offline/outboxRuntime';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type ListItem = S['ListItem'];
export type ListItemInput = S['ListItemInput'];
export type ListItemUpdate = S['ListItemUpdate'];
export type WishType = S['WishType'];

/** Хамтын жагсаалт (FR-9.1, 9.2, 9.5, 9.6) — гэрээ `Lists`. Key: `['list', kind]` (`list.updated` шинэчилнэ). */
export const listKey = (kind: ListKind) => ['list', kind] as const;
export const listItemsPath = (kind: ListKind) => `/lists/${kind}/items`;

export function useListItems(kind: ListKind) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: listKey(kind),
    queryFn: () => unwrap(api.GET('/lists/{listKind}/items', { params: { path: { listKind: kind } } })),
    enabled: !!accessToken,
  });
}

/**
 * Зүйл нэмэх — outbox-оор (`clientId`, DD-AURA-017): сүлжээгүй бол дараалалд үлдэж холбогдмогц
 * илгээгдэнэ; сервер `clientId`-аар idempotent тул давхар үүсэхгүй.
 */
export async function enqueueListItem(kind: ListKind, input: ListItemInput): Promise<void> {
  await outbox.enqueue({ method: 'POST', path: listItemsPath(kind), body: { ...input }, clientId: input.clientId });
  await outbox.flush().catch(() => 0);
}

export function updateListItem(id: string, body: ListItemUpdate): Promise<ListItem> {
  return unwrap(api.PATCH('/list-items/{itemId}', { params: { path: { itemId: id } }, body }));
}

export async function deleteListItem(id: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/list-items/{itemId}', { params: { path: { itemId: id } } }));
}

/** «Хүсэж байна» санал (AC-109) — хүн тутам нэг. */
export function setListVote(id: string, vote: boolean): Promise<ListItem> {
  const init = { params: { path: { itemId: id } } };
  return unwrap(vote ? api.PUT('/list-items/{itemId}/vote', init) : api.DELETE('/list-items/{itemId}/vote', init));
}

export function reorderList(kind: ListKind, itemIds: string[]): Promise<ListItem[]> {
  return unwrap(api.PUT('/lists/{listKind}/order', { params: { path: { listKind: kind } }, body: { itemIds } }));
}

export async function clearDoneListItems(kind: ListKind): Promise<number> {
  const res = await unwrap(api.POST('/lists/{listKind}/clear-done', { params: { path: { listKind: kind } } }));
  return res.cleared;
}

/** Кэш дэх нэг зүйлийг серверийн хариугаар солино. */
export function replaceListItem(client: QueryClient, kind: ListKind, item: ListItem) {
  client.setQueryData<ListItem[]>(listKey(kind), (data) => data?.map((i) => (i.id === item.id ? item : i)));
}

export function invalidateList(client: QueryClient, kind: ListKind): Promise<void> {
  return client.invalidateQueries({ queryKey: listKey(kind) });
}

async function unwrapEmpty(p: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await p;
  if (!response.ok) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
}
