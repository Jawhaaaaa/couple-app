import type { QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { WS_URL } from '@/config';
import { useSessionStore } from '@/stores/sessionStore';

import { onReconnect, routeEvent } from './eventRouter';
import { SEND_DESTINATIONS } from './events';
import { RealtimeClient } from './stompClient';

let client: RealtimeClient | null = null;

/**
 * Нэвтэрсэн үед realtime холболтыг асаана; токен солигдоход шинэ токеноор дахин холбогдоно,
 * гарахад хаана. Апп ард/нүүрэнд шилжихэд `/app/presence` (FR-3.2). Буцаасан функц — цэвэрлэгээ.
 */
export function startRealtime(queryClient: QueryClient): () => void {
  client = new RealtimeClient({
    url: WS_URL,
    getToken: () => useSessionStore.getState().accessToken,
    onEvent: (e) => {
      routeEvent(e, queryClient);
      // Апп нээлттэй (аль ч дэлгэц) — хамтрагчийн мессеж төхөөрөмжид хүрсэн (AC-176)
      if (e.type === 'chat.message.created') {
        const m = e.payload as { id?: string; sender?: { id?: string } };
        if (m.id && m.sender?.id && m.sender.id !== useSessionStore.getState().userId) {
          client?.send(SEND_DESTINATIONS.chatDelivered, { upToMessageId: m.id });
        }
      }
    },
    onReconnect: () => onReconnect(queryClient),
  });
  let token = useSessionStore.getState().accessToken;
  if (token) client.start();
  const unsubscribe = useSessionStore.subscribe((s) => {
    if (s.accessToken === token) return;
    token = s.accessToken;
    if (token) client?.restart();
    else client?.stop();
  });
  const appState = AppState.addEventListener('change', (state) => {
    client?.send(SEND_DESTINATIONS.presence, { state: state === 'active' ? 'FOREGROUND' : 'BACKGROUND' });
  });
  return () => {
    unsubscribe();
    appState.remove();
    client?.stop();
    client = null;
  };
}

/** «Бичиж байна» (ANIM-08) — холбогдоогүй бол чимээгүй алгасна (зөвхөн харагдацын дохио). */
export function sendTyping(typing: boolean): void {
  client?.send(SEND_DESTINATIONS.typing, { typing });
}

export function sendDelivered(upToMessageId: string): void {
  client?.send(SEND_DESTINATIONS.chatDelivered, { upToMessageId });
}

export { onRealtime } from './eventRouter';
export type { RealtimeEnvelope, RealtimeEventType } from './events';
