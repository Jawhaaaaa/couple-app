import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { apiAs, apiJson, signInUi, type TestUser } from './users';

/** Гэрээний `Message`-ийн тестэд хэрэгтэй хэсэг. */
export interface ChatMessage {
  id: string;
  clientMessageId: string;
  kind: string;
  text?: string | null;
  status: 'SENT' | 'DELIVERED' | 'READ';
  deleted: boolean;
  editedAt?: string | null;
  pinnedAt?: string | null;
  replyTo?: { id: string; text?: string | null } | null;
  createdAt: string;
}

export interface ChatPage {
  items: ChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

/** `POST /messages` (UI-гүй) — `clientMessageId` бүр шинэ. */
export function sendMessageApi(user: TestUser, body: Record<string, unknown>) {
  return apiJson<ChatMessage>(user, 'POST', '/messages', { clientMessageId: randomUUID(), kind: 'TEXT', ...body });
}

export function sendTextApi(user: TestUser, text: string, extra: Record<string, unknown> = {}) {
  return sendMessageApi(user, { kind: 'TEXT', text, ...extra });
}

export async function messagesApi(user: TestUser, query = ''): Promise<ChatPage> {
  return apiJson<ChatPage>(user, 'GET', `/messages${query ? `?${query}` : ''}`);
}

export async function messageStatus(user: TestUser, id: string): Promise<string | undefined> {
  const res = await apiAs(user, 'GET', `/messages?around=${id}&limit=1`);
  const page = (await res.json()) as ChatPage;
  return page.items.find((m) => m.id === id)?.status;
}

/** Нэвтэрч S-40 (чат) нээнэ; STOMP холбогдох хүртэл хүлээнэ. */
export async function openChat(page: Page, user: TestUser) {
  await signInUi(page, user);
  await page.goto('/chat');
  await expect(page.getByTestId('screen-S-40')).toBeVisible();
  await page.waitForLoadState('networkidle');
}
