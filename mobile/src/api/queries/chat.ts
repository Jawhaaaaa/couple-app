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
export type MessageSearchPage = S['MessageSearchPage'];
export type ChatMediaKind = 'IMAGE' | 'FILE' | 'VOICE' | 'LINK';

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

// --- T-48: хайлт, огноо руу үсрэх, медиа, pin (S-42…S-44) ---

export const PINNED_KEY = ['messages', 'pinned'] as const;

export function searchMessages(q: string, cursor: string | null): Promise<MessageSearchPage> {
  return unwrap(api.GET('/messages/search', { params: { query: { q, limit: 20, ...(cursor ? { cursor } : {}) } } }));
}

export function jumpToDate(date: string): Promise<MessagePage> {
  return unwrap(api.GET('/messages/jump', { params: { query: { date } } }));
}

export function listChatMedia(kind: ChatMediaKind, cursor: string | null): Promise<MessagePage & { nextCursor?: string | null }> {
  return unwrap(api.GET('/messages/media', { params: { query: { kind, limit: 30, ...(cursor ? { cursor } : {}) } } }));
}

export function listPinned(): Promise<Message[]> {
  return unwrap(api.GET('/messages/pinned'));
}

export async function setPinned(messageId: string, pinned: boolean): Promise<void> {
  await unwrap(
    pinned
      ? api.PUT('/messages/{messageId}/pin', { params: { path: { messageId } } })
      : api.DELETE('/messages/{messageId}/pin', { params: { path: { messageId } } }),
  );
}

// --- T-49: хамтын амлалт (FR-6.11, S-47) ---

export const PROMISE_KEY = ['promise'] as const;
export const PROMISE_MAX = 140;

export function proposePromise(text: string): Promise<SharedPromise> {
  return unwrap(api.POST('/promises', { body: { text } }));
}

export function respondPromise(promiseId: string, accept: boolean): Promise<SharedPromise> {
  return accept
    ? unwrap(api.POST('/promises/{promiseId}/accept', { params: { path: { promiseId } } }))
    : unwrap(api.POST('/promises/{promiseId}/decline', { params: { path: { promiseId } } }));
}

export function promiseOutcome(promiseId: string, kept: boolean): Promise<SharedPromise> {
  return unwrap(api.POST('/promises/{promiseId}/outcome', { params: { path: { promiseId } }, body: { kept } }));
}
