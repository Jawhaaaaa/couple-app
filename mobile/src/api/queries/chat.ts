import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import type { DisappearSeconds } from '@/chat/disappearing';

type S = components['schemas'];
export type ChatSettings = S['ChatSettings'];
export type Message = S['Message'];
export type MessagePage = S['MessagePage'];
export type MessageCreate = S['MessageCreate'];
export type MessageKind = S['MessageKind'];
export type MessageReaction = S['ReactionSummary'];
export type ReactionEmoji = S['ReactionEmoji'];
export type ChatPlace = S['Place'];
export type SharedPromise = S['SharedPromise'];

/** S-40-ийн харагдах цонх (`chatCache.ts`) — `['messages']` угтвартай тул чатын бүх realtime үүнийг шинэчилнэ. */
export const MESSAGES_KEY = ['messages', 'window'] as const;
export const PAGE_SIZE = 30;
const SYNC_PAGE = 100;

export interface MessageQuery {
  before?: string;
  after?: string;
  around?: string;
  limit?: number;
}

export function fetchMessages(query: MessageQuery = {}): Promise<MessagePage> {
  return unwrap(api.GET('/messages', { params: { query: { limit: PAGE_SIZE, ...query } } }));
}

export function fetchNewer(afterId: string): Promise<MessagePage> {
  return fetchMessages({ after: afterId, limit: SYNC_PAGE });
}

export function editMessage(messageId: string, text: string): Promise<Message> {
  return unwrap(api.PATCH('/messages/{messageId}', { params: { path: { messageId } }, body: { text } }));
}

export async function deleteMessage(messageId: string): Promise<void> {
  await unwrap(api.DELETE('/messages/{messageId}', { params: { path: { messageId } } }));
}

export async function markMessagesRead(upToMessageId: string): Promise<void> {
  await unwrap(api.POST('/messages/read', { body: { upToMessageId } }));
}

export function reactToMessage(messageId: string, emoji: ReactionEmoji | null): Promise<MessageReaction[]> {
  return emoji
    ? unwrap(api.PUT('/messages/{messageId}/reaction', { params: { path: { messageId } }, body: { emoji } }))
    : unwrap(api.DELETE('/messages/{messageId}/reaction', { params: { path: { messageId } } }));
}

/** S-40 толгойн амлалт (FR-6.11) — байхгүй бол 204 → `null`. */
export async function fetchCurrentPromise(): Promise<SharedPromise | null> {
  const res = await api.GET('/promises/current');
  if (res.response.status === 204 || res.response.status === 404) return null;
  return (await unwrap(Promise.resolve(res))) ?? null;
}

/** S-46: хосын алга болдог мессежийн анхдагч хугацаа (AC-92). */
export function updateChatSettings(disappearSeconds: DisappearSeconds): Promise<ChatSettings> {
  return unwrap(api.PUT('/chat/settings', { body: { disappearSeconds } }));
}

/** iOS дэлгэцийн зураг илэрсэн — илгээгчид мэдэгдэнэ (FR-6.9). */
export async function reportScreenshot(messageId: string): Promise<void> {
  await unwrap(api.POST('/messages/{messageId}/screenshot', { params: { path: { messageId } } }));
}
