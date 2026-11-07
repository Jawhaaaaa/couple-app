import type { Locale } from '@/stores/prefsStore';

import data from './empty-states.json';

export interface EmptyStateText {
  text: string;
  action: string;
}

const byId = new Map(data.items.map((item) => [item.id, item]));

/** Хоосон төлөвийн бичвэр S-ID-аар (Хавсралт Б.3; эх — `empty-states.json`). */
export function emptyStateText(screenId: string, locale: Locale): EmptyStateText {
  const item = byId.get(screenId);
  if (!item) throw new Error(`Хоосон төлөвийн бичвэр алга: ${screenId}`);
  return item[locale];
}
