import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** S-32-ийн нэг медиа: шинэ (upload дараалалд) эсвэл аль хэдийн серверт байгаа. */
export interface DraftMedia {
  /** Жагсаалтын түлхүүр (шинэд — upload-ын `localId`, хуучинд — `mediaId`). */
  key: string;
  localId: string | null;
  mediaId: string | null;
  previewUri: string | null;
  kind: 'image' | 'video';
  name: string;
  altText: string;
  durationMs?: number | null;
}

export interface MemoryDraft {
  /** `POST /memories`-ийн idempotent түлхүүр — ноорог амьд байх хугацаанд тогтмол. */
  clientId: string;
  title: string;
  description: string;
  /** `YYYY-MM-DD` */
  occurredOn: string;
  dateSource: 'EXIF' | 'MANUAL';
  /** Хэрэглэгч огноог гараар өөрчилсөн — EXIF дахин дарахгүй (AC-79). */
  dateTouched: boolean;
  placeName: string;
  lat: string;
  lon: string;
  locationSource: 'EXIF' | 'MANUAL' | 'NONE';
  locationTouched: boolean;
  tags: string[];
  groupIds: string[];
  media: DraftMedia[];
  datePlanId: string | null;
  /** Засварын горимд — эхлүүлсэн серверийн хувилбар (`PATCH`-ийн `version`). */
  baseVersion: number | null;
}

export const NEW_DRAFT = 'new';

export function emptyDraft(today: string): MemoryDraft {
  return {
    clientId: uuidv7(),
    title: '',
    description: '',
    occurredOn: today,
    dateSource: 'MANUAL',
    dateTouched: false,
    placeName: '',
    lat: '',
    lon: '',
    locationSource: 'NONE',
    locationTouched: false,
    tags: [],
    groupIds: [],
    media: [],
    datePlanId: null,
    baseVersion: null,
  };
}

export interface DraftState {
  drafts: Record<string, MemoryDraft>;
  put: (key: string, draft: MemoryDraft) => void;
  patch: (key: string, patch: Partial<MemoryDraft>) => void;
  clear: (key: string) => void;
}

/**
 * Ноорог (LLD §4.4 `draftStore`, AC-191): S-32-оос гарсан ч, апп/хуудас дахин ачаалсан ч
 * бичсэн текст, сонгосон файл алдагдахгүй. Хадгалсны дараа л арилна.
 */
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      put: (key, draft) => set((s) => ({ drafts: { ...s.drafts, [key]: draft } })),
      patch: (key, patch) =>
        set((s) => {
          const current = s.drafts[key];
          if (!current) return s;
          return { drafts: { ...s.drafts, [key]: { ...current, ...patch } } };
        }),
      clear: (key) =>
        set((s) => {
          const { [key]: _removed, ...rest } = s.drafts;
          return { drafts: rest };
        }),
    }),
    {
      name: 'aura.drafts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ drafts }) => ({ drafts }),
    },
  ),
);

/** Хадгалсан ноорог ачаалагдсан эсэх — түүнээс өмнө шинэ ноорог үүсгэвэл хуучнаа дарна. */
export function useDraftsHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useDraftStore.persist.onFinishHydration(onChange),
    () => useDraftStore.persist.hasHydrated(),
  );
}
