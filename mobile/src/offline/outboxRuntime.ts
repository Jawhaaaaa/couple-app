import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { API_BASE } from '@/config';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { httpSender, Outbox } from './outbox';
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

/** Апп нээгдэх, сүлжээ сэргэх, апп урд гарах үед outbox-ыг илгээнэ. Буцаах функц — цэвэрлэгээ. */
export function startOutbox(): () => void {
  outbox.flush().catch(() => {});
  const net = NetInfo.addEventListener((s) => {
    if (s.isConnected) outbox.flush().catch(() => {});
  });
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') outbox.flush().catch(() => {});
  });
  // Вэб (FR-19.5): iOS-д Background Sync байхгүй тул `online` үйл явдал дээр шууд илгээнэ. NetInfo-гийн
  // вэб хувилбар `navigator.connection`-ий өөрчлөлтийг сонсдог ба `online` болоход заавал дуудагддаггүй.
  const onOnline = () => void outbox.flush().catch(() => {});
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  win?.addEventListener('online', onOnline);
  return () => {
    net();
    app.remove();
    win?.removeEventListener('online', onOnline);
  };
}
