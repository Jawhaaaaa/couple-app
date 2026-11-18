import { router, usePathname } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { captureInstallPrompt } from '@/pwa/pwaStore';
import { nextPwaPrompt } from '@/pwa/pwaPrompts';
import { pushPermission, pushSupport } from '@/pwa/subscribePush';
import { useInstallPrompt } from '@/pwa/useInstallPrompt';
import { useInstallPromptStore } from '@/stores/installPromptStore';
import { useSessionStore } from '@/stores/sessionStore';

// `beforeinstallprompt` ачаалсны дараахан ирдэг — модуль ачаалагдах үед (root layout) барина
if (Platform.OS === 'web') captureInstallPrompt();

/** Нүүрэнд буусны дараа бусад цонх (ойн мэндчилгээ, цагийн бүс) эхэлж гарах хугацаа. */
export const PROMPT_DELAY_MS = 1500;
let shownThisSession = false;

function useHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useInstallPromptStore.persist.onFinishHydration(onChange),
    () => useInstallPromptStore.persist.hasHydrated(),
  );
}

/** S-100 / S-101-ийг нэвтэрсний дараа нэг удаа санал болгоно (вэбэд л) — дэлгэцгүй. */
export function PwaPrompts() {
  const pathname = usePathname();
  const signedIn = useSessionStore((s) => !!s.accessToken);
  const pushOffered = useInstallPromptStore((s) => s.pushOffered);
  const dismissedAt = useInstallPromptStore((s) => s.dismissedAt);
  const hydrated = useHydrated();
  const install = useInstallPrompt();
  const { offerAt } = install;

  useEffect(() => {
    if (Platform.OS !== 'web' || !signedIn || !hydrated || shownThisSession) return;
    let alive = true;
    const timer = setTimeout(() => {
      void pushPermission().then((permission) => {
        if (!alive) return;
        const next = nextPwaPrompt({
          platform: Platform.OS,
          signedIn,
          pathname,
          hydrated,
          shownThisSession,
          installOffer: offerAt(Date.now()),
          pushOffered,
          pushSupport: pushSupport(),
          permission,
        });
        if (!next) return;
        shownThisSession = true;
        if (next === 'push') useInstallPromptStore.getState().markPushOffered();
        router.push(next === 'install' ? '/install' : '/push-permission');
      });
    }, PROMPT_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // offerAt нь context, canPrompt, dismissedAt-аас хамаарна — тэдгээр өөрчлөгдөхөд л дахин шийднэ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, signedIn, hydrated, pushOffered, dismissedAt, install.context, install.canPrompt]);

  return null;
}
