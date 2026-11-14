import * as Clipboard from 'expo-clipboard';

import { shareOrDownload } from '@/pwa/webFallbacks';

import type { ShareInviteInput, ShareOutcome } from './share';

export type { ShareInviteInput, ShareOutcome } from './share';

/**
 * Вэб (FR-19.8, AC-158): Web Share API (утасны хөтөч) байвал түүгээр; үгүй бол холбоосыг
 * санах ойд хуулна (desktop хөтөч) — `shareOrDownload`.
 */
export async function shareInvite({ message, link }: ShareInviteInput): Promise<ShareOutcome> {
  const outcome = await shareOrDownload({ text: message, url: link, copy: (text) => Clipboard.setStringAsync(text).then(() => undefined) });
  return outcome === 'downloaded' ? 'copied' : outcome;
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
