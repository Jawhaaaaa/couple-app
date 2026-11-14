import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LetterForm } from '@/domain/letters';
import type { DraftMedia } from '@/stores/draftStore';

/** S-66-ийн ноорог: маягт + сонгосон зураг (upload дараалалд эсвэл серверт). */
export interface LetterDraft {
  form: LetterForm;
  media: DraftMedia[];
}

/** Шинэ захидлын түлхүүр; засварт — захидлын `id`, капсулын хэсэгт — `capsule:<id>`. */
export const NEW_LETTER = 'new';

interface LetterDraftState {
  drafts: Record<string, LetterDraft>;
  put: (key: string, draft: LetterDraft) => void;
  clear: (key: string) => void;
}

/**
 * Захидал, капсулын хэсгийн ноорог (LLD §4.4 `draftStore`, AC-191): дэлгэцээс гарсан ч, апп
 * дахин ачаалсан ч бичсэн зүйл алдагдахгүй; илгээсний (битүүмжилсний) дараа л арилна.
 */
export const useLetterDraftStore = create<LetterDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      put: (key, draft) => set((s) => ({ drafts: { ...s.drafts, [key]: draft } })),
      clear: (key) =>
        set((s) => {
          const { [key]: _removed, ...rest } = s.drafts;
          return { drafts: rest };
        }),
    }),
    { name: 'aura.letter-drafts', storage: createJSONStorage(() => AsyncStorage), partialize: ({ drafts }) => ({ drafts }) },
  ),
);
