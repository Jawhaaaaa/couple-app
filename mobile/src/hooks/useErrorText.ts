import { useCallback } from 'react';

import { ApiRequestError } from '@/api/client';
import { errorMessage } from '@/content/errors';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

/**
 * Алдааг хэрэглэгчид харуулах нэг өгүүлбэр болгоно: серверийн `ErrorCode` →
 * `errors.json`; сүлжээний алдаа (`fetch` reject) → «Сервертэй холбогдож чадсангүй»;
 * бусад → ерөнхий алдаа.
 */
export function useErrorText(): (error: unknown) => string {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiRequestError) {
        return errorMessage(error.code, locale) ?? error.body?.message ?? t('states.errorBody');
      }
      if (error instanceof TypeError) return t('states.serverUnreachableBody');
      return t('states.errorBody');
    },
    [locale, t],
  );
}
