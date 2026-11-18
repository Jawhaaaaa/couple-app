import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { api } from '@/api/client';
import { API_BASE } from '@/config';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { httpSender, Outbox } from './outbox';
import { queryClient } from './persist';
import { kvStore } from './storage';

export const outbox = new Outbox(
  kvStore,
  httpSender(API_BASE, (...a) => globalThis.fetch(...a), () => {
    const token = useSessionStore.getState().accessToken;
    return {
      'Accept-Language': usePrefsStore.getState().locale,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }),
);

/** S-01-ийн сесс сэргээлтийн query (`useBootstrap`) — offline-д нээгдсэн бол `unreachable`. */
const SESSION_RESTORE_KEY = ['session-restore'];
/** Offline сессийг сэргээх оролдлого: сүлжээ «online» болсон агшинд холболт бэлэн биш байж болно. */
export const RESUME_ATTEMPTS = 5;
export const RESUME_RETRY_MS = 2000;

/** Апп нээгдэх, сүлжээ сэргэх, апп урд гарах үед outbox-ыг илгээнэ. Буцаах функц — цэвэрлэгээ. */
export function startOutbox({ retryMs = RESUME_RETRY_MS }: { retryMs?: number } = {}): () => void {
  outbox.flush().catch(() => {});
  let stopped = false;
  let resuming = false;

  /**
   * Апп offline-д нээгдсэн бол (S-01 `unreachable` — кэштэй `me`-ээр үргэлжилсэн, AC-156) access token
   * алга: outbox 401-ээр гацаж, апп offline горимдоо үлдэнэ. Сүлжээ сэргэхэд сессийг сэргээж (холболт
   * бэлэн болтол хэдэн удаа), илгээгээд persist кэшийг бүхэлд нь шинэчилнэ — realtime-ийн анхны холболт
   * «дахин холболт» биш тул (`onReconnect`) offline хугацааны өөрчлөлт, өөрийн илгээсэн мессеж ирэхгүй.
   */
  const resumeOfflineSession = async () => {
    for (let attempt = 0; attempt < RESUME_ATTEMPTS && !stopped; attempt += 1) {
      const result = await api.restoreSession();
      if (result === 'restored') {
        queryClient.setQueryData(SESSION_RESTORE_KEY, 'restored');
        await outbox.flush().catch(() => 0);
        await queryClient.invalidateQueries();
        return;
      }
      if (result === 'none') return;
      await new Promise((r) => setTimeout(r, retryMs * (attempt + 1)));
    }
  };

  const onOnline = () => {
    if (useSessionStore.getState().accessToken) {
      void outbox.flush().catch(() => {});
      return;
    }
    if (resuming || queryClient.getQueryData(SESSION_RESTORE_KEY) !== 'unreachable') return;
    resuming = true;
    void resumeOfflineSession()
      .catch(() => undefined)
      .finally(() => {
        resuming = false;
      });
  };
  const net = NetInfo.addEventListener((s) => {
    if (s.isConnected) onOnline();
  });
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') outbox.flush().catch(() => {});
  });
  // Вэб (FR-19.5): iOS-д Background Sync байхгүй тул `online` үйл явдал дээр шууд илгээнэ. NetInfo-гийн
  // вэб хувилбар `navigator.connection`-ий өөрчлөлтийг сонсдог ба `online` болоход заавал дуудагддаггүй.
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  win?.addEventListener('online', onOnline);
  // Апп нээгдэхэд access token refresh-ээр хожуу ирдэг — тэр мөчид дахин илгээнэ
  const session = useSessionStore.subscribe((state, prev) => {
    if (state.accessToken && !prev.accessToken) void outbox.flush().catch(() => {});
  });
  return () => {
    stopped = true;
    session();
    net();
    app.remove();
    win?.removeEventListener('online', onOnline);
  };
}
