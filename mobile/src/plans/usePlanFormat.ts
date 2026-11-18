import { useCallback } from 'react';

import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDate, formatTime, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

/**
 * Болзооны цагийг хэрэглэгчийн бүсээр (INV-08, AC-34): «2026.11.14 · 19:30». Нэг болзоог
 * Улаанбаатарт 19:30, Токиод 20:30 гэж харуулна.
 */
export function usePlanFormat(): { tz: string; when: (iso: string) => string; time: (iso: string) => string } {
  const t = useT();
  const tz = useUserTimezone();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const time = useCallback((iso: string) => formatTime(new Date(iso), locale, tz), [locale, tz]);
  const when = useCallback(
    (iso: string) => t('plans.when', { date: formatDate(new Date(iso), dateFormat, tz), time: formatTime(new Date(iso), locale, tz) }),
    [dateFormat, locale, t, tz],
  );
  return { tz, when, time };
}
