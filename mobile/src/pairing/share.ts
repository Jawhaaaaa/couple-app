import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

export type ShareOutcome = 'shared' | 'copied' | 'dismissed';

export interface ShareInviteInput {
  message: string;
  link: string;
}

/** Native: системийн хуваалцах цонх (`Share` API). */
export async function shareInvite({ message, link }: ShareInviteInput): Promise<ShareOutcome> {
  const result = await Share.share({ message: `${message}\n${link}`, url: link });
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

/** Кодыг санах ойд хуулна. */
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
