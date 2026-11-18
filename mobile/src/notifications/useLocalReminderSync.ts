import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { onRealtime, type RealtimeEventType } from '@/realtime';
import { useSessionStore } from '@/stores/sessionStore';

import { syncLocalReminders } from './localReminders';

const TRIGGERS: RealtimeEventType[] = ['plan.updated', 'letter.delivered', 'couple.updated', 'profile.updated'];
const DEBOUNCE_MS = 1500;

/** Native: нэвтэрмэгц, апп урд гарах бүрд, болзоо/ой/захидал өөрчлөгдөхөд локал сануулгыг тааруулна (AC-35). */
export function useLocalReminderSync(): void {
  const token = useSessionStore((s) => s.accessToken);
  useEffect(() => {
    if (Platform.OS === 'web' || !token) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncLocalReminders().catch(() => undefined), DEBOUNCE_MS);
    };
    run();
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    const offs = TRIGGERS.map((type) => onRealtime(type, run));
    return () => {
      if (timer) clearTimeout(timer);
      app.remove();
      offs.forEach((off) => off());
    };
  }, [token]);
}
