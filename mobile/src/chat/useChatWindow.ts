import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMessages, fetchNewer, MESSAGES_KEY, type MessagePage } from '@/api/queries/chat';
import { onRealtime, type RealtimeEventType } from '@/realtime';
import { useSessionStore } from '@/stores/sessionStore';

import { appendNewer, applyChatEvent, type ChatWindow, EMPTY_WINDOW, mergeLatest, prependOlder } from './chatCache';

const MAX_GAP_PAGES = 10;
const LIVE_EVENTS: RealtimeEventType[] = [
  'chat.message.created',
  'chat.message.updated',
  'chat.message.deleted',
  'chat.expired',
  'chat.reaction',
  'chat.pinned',
  'chat.receipt',
];

/**
 * Цонхыг сервертэй тааруулна: сүүлийн хуудсыг кэштэй залгаж, давхцал алга бол сүүлд мэдэгдэх
 * мессежээс `after`-аар нөхнө (≤ 10 хуудас, үгүй бол цонхыг шинээр эхлүүлнэ).
 */
export async function syncWindow(prev: ChatWindow | undefined): Promise<ChatWindow> {
  const latest = await fetchMessages();
  const merged = mergeLatest(prev, latest);
  if (merged) return merged;
  const base = prev ?? EMPTY_WINDOW;
  const pages: MessagePage[] = [];
  let anchor = base.items[base.items.length - 1]?.id;
  try {
    for (let i = 0; anchor && i < MAX_GAP_PAGES; i += 1) {
      const page = await fetchNewer(anchor);
      pages.push(page);
      if (!page.hasMoreAfter || page.items.length === 0) return appendNewer(base, pages);
      anchor = page.items[page.items.length - 1].id;
    }
  } catch {
    // Сүүлд мэдэгдэх мессеж устсан/хугацаа дууссан (404) — цонхыг шинээр
  }
  return { items: latest.items, hasMoreBefore: latest.hasMoreBefore };
}

/** S-40-ийн мессежийн цонх + realtime + хуучныг ачаалах. */
export function useChatWindow({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((s) => s.accessToken);
  const me = useSessionStore((s) => s.userId);
  const query = useQuery({
    queryKey: MESSAGES_KEY,
    queryFn: () => syncWindow(queryClient.getQueryData<ChatWindow>(MESSAGES_KEY)),
    enabled: !!accessToken && enabled,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderRef = useRef(false);

  useEffect(() => {
    const offs = LIVE_EVENTS.map((type) =>
      onRealtime(type, (event) => {
        queryClient.setQueryData<ChatWindow>(MESSAGES_KEY, (prev) => applyChatEvent(prev, event, me));
      }),
    );
    return () => offs.forEach((off) => off());
  }, [queryClient, me]);

  const loadOlder = useCallback(async () => {
    const data = queryClient.getQueryData<ChatWindow>(MESSAGES_KEY);
    const first = data?.items[0];
    if (olderRef.current || !data?.hasMoreBefore || !first) return;
    olderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages({ before: first.id });
      queryClient.setQueryData<ChatWindow>(MESSAGES_KEY, (prev) => (prev ? prependOlder(prev, page) : prev));
    } finally {
      olderRef.current = false;
      setLoadingOlder(false);
    }
  }, [queryClient]);

  return { ...query, window: query.data ?? EMPTY_WINDOW, loadOlder, loadingOlder };
}
