import { v7 as uuidv7 } from 'uuid';
import { create } from 'zustand';

import { api, type ApiError, ApiRequestError } from '@/api/client';
import type { components } from '@/api/schema';
import { outbox } from '@/offline/outboxRuntime';

export type SignalRequest = components['schemas']['SignalRequest'];
export type SignalKind = SignalRequest['kind'];

/** «Чамайг бодож байна»-ын бичвэрийн дээд урт (FR-4.3, AC-77; гэрээ `maxLength: 80`). */
export const THINKING_MAX = 80;
/**
 * Нэг мөр, ≤ 80 тэмдэгт — хуулж буулгасан ч таслана (AC-77). Урт нь `TextInput.maxLength`
 * ба серверийн шалгалттай ижил UTF-16 нэгжээр.
 */
export function clampThinking(raw: string): string {
  return raw.replace(/\s*[\r\n]+\s*/g, ' ').slice(0, THINKING_MAX);
}

/** Тэврэлт — товчийг ≥ 0.6 с дарах (FR-4.2, AC-76). */
export const HUG_PRESS_MS = 600;
/** Сервер `retryAfterSeconds` өгөөгүй үеийн cooldown. */
const DEFAULT_COOLDOWN_S = 30;

export type SendOutcome =
  | { status: 'sent' }
  /** Сүлжээгүй — outbox-д хадгалагдсан, холбогдмогц илгээгдэнэ (FR-6.4). */
  | { status: 'queued' }
  /** 429 `RATE_LIMITED` — алдаа биш, товч зөөлөн амарна (AC-19). */
  | { status: 'cooldown'; seconds: number }
  | { status: 'failed'; error: ApiRequestError };

export interface SignalTransport {
  post(body: SignalRequest): Promise<{ error?: unknown; response: Response }>;
  enqueue(body: SignalRequest): Promise<void>;
}

const defaultTransport: SignalTransport = {
  post: (body) => api.POST('/signals', { body }),
  enqueue: async (body) => {
    await outbox.enqueue({ method: 'POST', path: '/signals', body: { ...body }, clientId: body.clientId });
    // Холболт эргэж ирсэн бол шууд; үгүй бол `startOutbox`-ийн дараагийн өдөөлтөөр
    outbox.flush().catch(() => undefined);
  },
};

function retryAfter(error: ApiError | null, response: Response): number {
  const header = Number(response.headers.get('Retry-After'));
  const seconds = error?.retryAfterSeconds ?? (Number.isFinite(header) && header > 0 ? header : DEFAULT_COOLDOWN_S);
  return Math.max(1, Math.ceil(seconds));
}

/**
 * Зүрх / тэврэлт / «Чамайг бодож байна» илгээх (FR-4). `clientId` (UUIDv7)-тэй тул
 * давхар илгээлт idempotent. Offline эсвэл сүлжээ тасарвал outbox-д (дараа нь FIFO-оор
 * илгээгдэнэ); онлайн үед шууд илгээж 429-ийг cooldown болгон буцаана — outbox нь 429-ийг
 * «дараа дахин» гэж хадгалдаг тул хязгаарт хүрсэн зүрх хэдэн минутын дараа санаандгүй
 * очихгүйн тулд энэ замаар л явна.
 */
export async function sendSignal(
  input: { kind: SignalKind; text?: string },
  { offline }: { offline: boolean },
  transport: SignalTransport = defaultTransport,
): Promise<SendOutcome> {
  const text = input.text?.trim().slice(0, THINKING_MAX);
  const body: SignalRequest = { kind: input.kind, clientId: uuidv7(), ...(text ? { text } : {}) };
  if (offline) {
    await transport.enqueue(body);
    return { status: 'queued' };
  }
  let result: { error?: unknown; response: Response };
  try {
    result = await transport.post(body);
  } catch {
    // fetch reject = сүлжээ тасарсан: outbox-д үлдээж дараа илгээнэ
    await transport.enqueue(body);
    return { status: 'queued' };
  }
  const { response, error } = result;
  if (response.ok) return { status: 'sent' };
  const apiError = (error as ApiError | undefined) ?? null;
  if (response.status === 429) return { status: 'cooldown', seconds: retryAfter(apiError, response) };
  return { status: 'failed', error: new ApiRequestError(response.status, apiError) };
}

interface SignalFxState {
  /** Realtime-аар дохио хүлээн авч ANIM-02 тоглуулсан сүүлийн агшин (мс). */
  liveAt: number | null;
  markLive: () => void;
}

/**
 * Нэг дохиог хоёр удаа тоглуулахгүй (AC-18): realtime overlay тоглосон бол нүүрний
 * «үзээгүй» карт тэр дохиог дахин ANIM-02-оор үзүүлэхгүй.
 */
export const useSignalFx = create<SignalFxState>()((set) => ({
  liveAt: null,
  markLive: () => set({ liveAt: Date.now() }),
}));

/** Realtime overlay-ийн дараах энэ хугацаанд нүүрний «үзээгүй» карт ANIM-02 тоглуулахгүй. */
export const LIVE_SUPPRESS_MS = 10_000;
