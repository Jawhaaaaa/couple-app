import type { Locale } from '@/stores/prefsStore';

import data from './errors.json';

const byId = new Map(data.items.map((item) => [item.id, item]));

/** Backend-ийн `ErrorCode`-ийн хүнд ойлгомжтой мессеж (Б.3, AC-145; эх — `errors.json`). */
export function errorMessage(code: string | undefined, locale: Locale): string | null {
  if (!code) return null;
  return byId.get(code)?.[locale] ?? null;
}
