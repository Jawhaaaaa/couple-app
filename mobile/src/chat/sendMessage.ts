import { useEffect, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';

import type { MessageCreate } from '@/api/queries/chat';
import { outbox } from '@/offline/outboxRuntime';
import type { OutboxItem } from '@/offline/outbox';

/** Мессежийн текстийн дээд урт (гэрээ `maxLength: 4000`). */
export const MESSAGE_MAX = 4000;
const PATH = '/messages';

export type NewMessage = Omit<MessageCreate, 'clientMessageId'>;

/**
 * Мессеж бүр outbox-оор явна (FR-6.4, DD-AURA-017): `clientMessageId` = outbox-ын `clientId` тул
 * давтан илгээлт серверт нэг л мессеж болно, дараалал FIFO (AC-28). Онлайн үед шууд flush.
 */
export async function sendMessage(input: NewMessage, clientMessageId: string = uuidv7()): Promise<string> {
  await outbox.enqueue({ method: 'POST', path: PATH, clientId: clientMessageId, body: { ...input, clientMessageId } });
  outbox.flush().catch(() => undefined);
  return clientMessageId;
}

/** Илгээгдэж байгаа (outbox-д байгаа) мессеж — S-40-д «илгээгдэж байна» төлөвтэй харагдана. */
export interface PendingMessage {
  clientMessageId: string;
  body: NewMessage;
  createdAt: string;
  attempts: number;
}

export function pendingMessages(items: OutboxItem[]): PendingMessage[] {
  return items
    .filter((i) => i.method === 'POST' && i.path === PATH && i.body)
    .map((i) => {
      const { clientMessageId, clientId: _c, ...body } = i.body as MessageCreate & { clientId?: string };
      return { clientMessageId: clientMessageId ?? i.clientId, body: body as NewMessage, createdAt: i.createdAt, attempts: i.attempts };
    });
}

export function usePendingMessages(): PendingMessage[] {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  useEffect(() => {
    let alive = true;
    void outbox.items().then((items) => alive && setPending(pendingMessages(items)));
    const off = outbox.subscribe((items) => setPending(pendingMessages(items)));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return pending;
}
