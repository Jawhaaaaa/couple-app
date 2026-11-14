import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type Letter = S['Letter'];
export type LetterListItem = S['LetterListItem'];
export type LetterTeaser = S['LetterTeaser'];
export type LetterInput = S['LetterInput'];
export type LetterUpdate = S['LetterUpdate'];
export type LetterTemplate = S['LetterTemplate'];
export type LetterStatus = S['LetterStatus'];
export type LetterApiBox = 'inbox' | 'sent' | 'upcoming';

/** Захидал (FR-10.1…10.4) — гэрээ `Letters`. Key: `['letters', box]`, `['letter', id]` (`letter.delivered/read`). */
export const LETTERS_KEY = ['letters'] as const;
export const lettersKey = (box: LetterApiBox) => ['letters', box] as const;
export const letterKey = (id: string) => ['letter', id] as const;

/** `upcoming` нь агуулгагүй `LetterTeaser` (INV-04); `inbox`, `sent` нь `LetterListItem`. */
export function useLetters(box: 'upcoming'): ReturnType<typeof useLettersQuery<LetterTeaser>>;
export function useLetters(box: 'inbox' | 'sent'): ReturnType<typeof useLettersQuery<LetterListItem>>;
export function useLetters(box: LetterApiBox) {
  return useLettersQuery(box);
}

function useLettersQuery<T>(box: LetterApiBox, enabled = true) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: lettersKey(box),
    queryFn: async () => (await unwrap(api.GET('/letters', { params: { query: { box } } }))) as T[],
    enabled: !!accessToken && enabled,
  });
}

export function useLetter(id: string | undefined) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: letterKey(id ?? ''),
    queryFn: () => unwrap(api.GET('/letters/{letterId}', { params: { path: { letterId: id ?? '' } } })),
    enabled: !!accessToken && !!id,
  });
}

export function createLetter(body: LetterInput): Promise<Letter> {
  return unwrap(api.POST('/letters', { body }));
}

export function updateLetter(id: string, body: LetterUpdate): Promise<Letter> {
  return unwrap(api.PATCH('/letters/{letterId}', { params: { path: { letterId: id } }, body }));
}

/** Хүргэгдэхээс өмнө цуцлах (AC-112) — хүлээн авагчийн «ирэх захидал» тэмдэг алга болно. */
export async function cancelLetter(id: string): Promise<void> {
  const { error, response } = await api.DELETE('/letters/{letterId}', { params: { path: { letterId: id } } });
  if (!response.ok) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
}

export function markLetterRead(id: string): Promise<Letter> {
  return unwrap(api.POST('/letters/{letterId}/read', { params: { path: { letterId: id } } }));
}

export function invalidateLetters(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: LETTERS_KEY }),
    client.invalidateQueries({ queryKey: ['letter'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ]).then(() => undefined);
}
