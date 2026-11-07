import { v7 as uuidv7 } from 'uuid';

import type { KeyValueStore } from './storage';

/**
 * Offline outbox (DD-AURA-017, FR-6.4, NFR-03). Үйлдэл бүр `clientId`-тай (UUIDv7);
 * сервер `clientId`/`clientMessageId`-аар idempotent тул давхар илгээлт нь давхар
 * объект үүсгэхгүй. Апп нээгдэх, `online`, AppState `active` үед FIFO-оор илгээнэ —
 * iOS-д Background Sync байхгүй (FR-19.5).
 */
export interface OutboxItem {
  clientId: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  createdAt: string;
  attempts: number;
}

/** Илгээгчийн хариу: `sent` — устгана · `retry` — дараалал зогсож дараа дахин · `rejected` — буцаалттай (сервер татгалзсан). */
export type SendResult = 'sent' | 'retry' | 'rejected';
export type Sender = (item: OutboxItem) => Promise<SendResult>;

const KEY = 'aura.outbox.v1';
const REJECTED_KEY = 'aura.outbox.rejected.v1';

export class Outbox {
  private flushing: Promise<number> | null = null;
  private listeners = new Set<(items: OutboxItem[]) => void>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly send: Sender,
  ) {}

  async items(): Promise<OutboxItem[]> {
    const raw = await this.store.get(KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  }

  async rejected(): Promise<OutboxItem[]> {
    const raw = await this.store.get(REJECTED_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  }

  subscribe(fn: (items: OutboxItem[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private async save(items: OutboxItem[]) {
    await this.store.set(KEY, JSON.stringify(items));
    this.listeners.forEach((l) => l(items));
  }

  /** Дараалалд нэмнэ. `clientId` өгөөгүй бол UUIDv7 үүсгэж биед ч оруулна. */
  async enqueue(input: { method: OutboxItem['method']; path: string; body?: Record<string, unknown>; clientId?: string }): Promise<OutboxItem> {
    const clientId = input.clientId ?? (input.body?.clientId as string | undefined) ?? uuidv7();
    const item: OutboxItem = {
      clientId,
      method: input.method,
      path: input.path,
      body: input.body ? { clientId, ...input.body } : undefined,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    const items = await this.items();
    if (!items.some((i) => i.clientId === clientId)) await this.save([...items, item]);
    return item;
  }

  /**
   * Дарааллыг эхнээс нь илгээнэ. Нэг зэрэг нэг л flush (давхар дуудлага ижил
   * promise хүлээнэ) тул нэг зүйл хоёр удаа илгээгдэхгүй. Сүлжээний алдаанд
   * (`retry`) зогсож дарааллыг хадгална — дараалал алдагдахгүй (AC-28).
   */
  flush(): Promise<number> {
    if (!this.flushing) {
      this.flushing = this.run().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async run(): Promise<number> {
    let sent = 0;
    for (;;) {
      const [head, ...rest] = await this.items();
      if (!head) return sent;
      let result: SendResult;
      try {
        result = await this.send(head);
      } catch {
        result = 'retry';
      }
      if (result === 'retry') {
        await this.save([{ ...head, attempts: head.attempts + 1 }, ...rest]);
        return sent;
      }
      if (result === 'rejected') {
        const rejected = await this.rejected();
        await this.store.set(REJECTED_KEY, JSON.stringify([...rejected, head]));
      } else {
        sent += 1;
      }
      await this.save(rest);
    }
  }
}

/**
 * HTTP илгээгч: 2xx ба 409 (давхар `clientId` — анхны объект) → `sent`;
 * сүлжээ, 5xx, 401, 429 → `retry`; бусад 4xx → `rejected`.
 */
export function httpSender(baseUrl: string, fetchFn: typeof fetch, headers: () => Record<string, string>): Sender {
  return async (item) => {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${item.path}`, {
        method: item.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: item.body === undefined ? undefined : JSON.stringify(item.body),
      });
    } catch {
      return 'retry';
    }
    if (res.ok || res.status === 409) return 'sent';
    if (res.status >= 500 || res.status === 401 || res.status === 429 || res.status === 408) return 'retry';
    return 'rejected';
  };
}
