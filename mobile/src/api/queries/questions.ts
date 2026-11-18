import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';
import type { Locale } from '@/stores/prefsStore';

type S = components['schemas'];
export type DailyQuestion = S['DailyQuestion'];
export type DailyQuestionPage = S['DailyQuestionPage'];

/**
 * Өдрийн асуулт (FR-3.5, SD-02). `partnerAnswer` нь өөрөө хариулсны дараа л ирнэ (INV-04);
 * хоёулаа хариулахад `question.revealed` realtime нь `['question']`-ийг бүхэлд нь шинэчилнэ.
 */
export const QUESTION_TODAY_KEY = ['question', 'today'] as const;
export const QUESTION_HISTORY_KEY = ['question', 'history'] as const;
export const ANSWER_MAX = 1000;
const PAGE_SIZE = 20;

export function fetchTodayQuestion(): Promise<DailyQuestion> {
  return unwrap(api.GET('/questions/today'));
}

export function answerTodayQuestion(text: string): Promise<DailyQuestion> {
  return unwrap(api.POST('/questions/today/answer', { body: { text } }));
}

export function fetchQuestionHistory(cursor: string | null): Promise<DailyQuestionPage> {
  return unwrap(api.GET('/questions/history', { params: { query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } } }));
}

export function useTodayQuestion({ enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: QUESTION_TODAY_KEY, queryFn: fetchTodayQuestion, enabled: !!accessToken && enabled });
}

export function useQuestionHistory({ enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useInfiniteQuery({
    queryKey: QUESTION_HISTORY_KEY,
    queryFn: ({ pageParam }) => fetchQuestionHistory(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!accessToken && enabled,
  });
}

/** Асуултын бичвэр одоогийн хэлээр (FR-18.1). */
export function questionText(q: DailyQuestion['question'], locale: Locale): string {
  return locale === 'en' ? q.textEn : q.textMn;
}
