import { create } from 'zustand';

/** Chromium-ийн `beforeinstallprompt` (стандарт DOM төрөлд байхгүй). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Вэбийн PWA-ийн санах ойн төлөв (persist хийхгүй — хуудас ачаалах бүрт SW/хөтчөөс дахин тодорхойлно). */
export interface PwaState {
  /** Шинэ service worker суугаад `waiting` төлөвт хүлээж байна (FR-19.9). */
  waiting: ServiceWorker | null;
  /** Хөтөч суулгахыг санал болгосон (`beforeinstallprompt`, FR-19.2) — «Суулгах» товчинд. */
  installEvent: BeforeInstallPromptEvent | null;
  setWaiting: (worker: ServiceWorker | null) => void;
  setInstallEvent: (event: BeforeInstallPromptEvent | null) => void;
}

export const usePwaStore = create<PwaState>()((set) => ({
  waiting: null,
  installEvent: null,
  setWaiting: (waiting) => set({ waiting }),
  setInstallEvent: (installEvent) => set({ installEvent }),
}));

let listening = false;

/**
 * `beforeinstallprompt`-ийг аль болох эрт барина (хөтөч ачаалсны дараахан илгээдэг) — root layout
 * импортлох үед дуудагдана. Суусны дараа (`appinstalled`) товч алга болно.
 */
export function captureInstallPrompt(win: Pick<Window, 'addEventListener'> | undefined = typeof window !== 'undefined' ? window : undefined) {
  if (listening || !win || typeof win.addEventListener !== 'function') return;
  listening = true;
  win.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    usePwaStore.getState().setInstallEvent(e as BeforeInstallPromptEvent);
  });
  win.addEventListener('appinstalled', () => usePwaStore.getState().setInstallEvent(null));
}
