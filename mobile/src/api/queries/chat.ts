import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import type { DisappearSeconds } from '@/chat/disappearing';

type S = components['schemas'];
export type ChatSettings = S['ChatSettings'];

/** S-46: хосын алга болдог мессежийн анхдагч хугацаа (AC-92). */
export function updateChatSettings(disappearSeconds: DisappearSeconds): Promise<ChatSettings> {
  return unwrap(api.PUT('/chat/settings', { body: { disappearSeconds } }));
}

/** iOS дэлгэцийн зураг илэрсэн — илгээгчид мэдэгдэнэ (FR-6.9). */
export async function reportScreenshot(messageId: string): Promise<void> {
  await unwrap(api.POST('/messages/{messageId}/screenshot', { params: { path: { messageId } } }));
}
