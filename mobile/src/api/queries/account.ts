import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';

type S = components['schemas'];
export type AccountDeletionResult = S['AccountDeletionResult'];

/**
 * `POST /me/deletion` (FR-14.7, GAP-14, AC-128) — нууц үг (401 `AUTH_INVALID_CREDENTIALS`) ба
 * хэрэглэгчийн хэлээрх баталгаажуулах үг («УСТГАХ» / «DELETE», 400). Сервер бүх session-ийг хаана.
 */
export function deleteAccount(body: S['AccountDeletionRequest']): Promise<AccountDeletionResult> {
  return unwrap(api.POST('/me/deletion', { body }));
}

/** Баталгаажуулах үг таарч байгаа эсэх (том/жижиг үсэг, зай хамаарахгүй — сервертэй ижил). */
export function phraseMatches(input: string, phrase: string): boolean {
  return input.trim().toLocaleLowerCase() === phrase.toLocaleLowerCase();
}

/**
 * Акаунт устгаад энэ төхөөрөмжийн сессийг цэвэрлэнэ: refresh token, санах ойн кэш. `sessionStore.clear()`
 * нь root layout-ийг S-03 нэвтрэх руу шилжүүлнэ.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await api.signOut();
      queryClient.clear();
    },
  });
}
