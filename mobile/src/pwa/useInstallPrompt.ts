import { useMemo } from 'react';
import { Platform } from 'react-native';

import { useInstallPromptStore } from '@/stores/installPromptStore';

import { type DeviceInfo, installContext, type InstallContext, readDevice, shouldOfferInstall } from './installPrompt';
import { usePwaStore } from './pwaStore';

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallPrompt {
  /** Native-д `null` (S-100 зөвхөн вэбэд). */
  context: InstallContext | null;
  /** Хөтөч «Суулгах» цонхыг санал болгосон (Android/desktop Chromium). */
  canPrompt: boolean;
  /** Тухайн агшинд S-100-г автоматаар харуулах эсэх (7 хоногийн дүрэм орно). */
  offerAt: (now: number) => boolean;
  prompt: () => Promise<InstallOutcome>;
  dismiss: () => void;
}

/** S-100-ийн төлөв ба үйлдэл (LLD §4.3 `useInstallPrompt`, FR-19.2, AC-153). */
export function useInstallPrompt(device: DeviceInfo | null = Platform.OS === 'web' ? readDevice() : null): InstallPrompt {
  const installEvent = usePwaStore((s) => s.installEvent);
  const dismissedAt = useInstallPromptStore((s) => s.dismissedAt);
  const dismiss = useInstallPromptStore((s) => s.dismiss);
  const ua = device?.ua;
  const standalone = device?.standalone;
  const touch = device?.maxTouchPoints;
  const context = useMemo(
    () => (ua === undefined ? null : installContext({ ua, standalone: !!standalone, maxTouchPoints: touch })),
    [ua, standalone, touch],
  );
  const canPrompt = !!installEvent;
  return {
    context,
    canPrompt,
    offerAt: (now) => context != null && shouldOfferInstall({ context, canPrompt, dismissedAt, now }),
    prompt: async () => {
      if (!installEvent) return 'unavailable';
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      // Хөтөч нэг event-ийг нэг л удаа prompt хийлгэнэ
      usePwaStore.getState().setInstallEvent(null);
      return outcome;
    },
    dismiss: () => dismiss(),
  };
}
