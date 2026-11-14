import { create } from 'zustand';

/** Вэбийн PWA-ийн санах ойн төлөв (persist хийхгүй — хуудас ачаалах бүрт SW-ээс дахин тодорхойлно). */
export interface PwaState {
  /** Шинэ service worker суугаад `waiting` төлөвт хүлээж байна (FR-19.9). */
  waiting: ServiceWorker | null;
  setWaiting: (worker: ServiceWorker | null) => void;
}

export const usePwaStore = create<PwaState>()((set) => ({
  waiting: null,
  setWaiting: (waiting) => set({ waiting }),
}));
