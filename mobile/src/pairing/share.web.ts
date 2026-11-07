import * as Clipboard from 'expo-clipboard';

import type { ShareInviteInput, ShareOutcome } from './share';

export type { ShareInviteInput, ShareOutcome } from './share';

/**
 * Вэб: Web Share API (утасны хөтөч) байвал түүгээр; үгүй бол холбоосыг санах ойд
 * хуулна (desktop хөтөч).
 */
export async function shareInvite({ message, link }: ShareInviteInput): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: message, url: link });
      return 'shared';
    } catch (error) {
      // Хэрэглэгч хуваалцах цонхыг хаавал AbortError — алдаа биш
      if (error instanceof Error && error.name === 'AbortError') return 'dismissed';
      // Бусад алдаа (зөвшөөрөлгүй, дэмжигдээгүй өгөгдөл) — доорх хуулах нөөц рүү
    }
  }
  await Clipboard.setStringAsync(`${message}\n${link}`);
  return 'copied';
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
