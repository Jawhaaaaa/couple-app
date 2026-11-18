/**
 * `contracts/asyncapi.yaml`-ийн `RealtimeEnvelope` ба `EventType` (DD-AURA-009). Жагсаалтыг
 * `realtime-contract.test.ts` гэрээтэй тулгана — гэрээнд шинэ төрөл нэмэгдвэл тест унана.
 */
export const REALTIME_EVENT_TYPES = [
  'signal.received',
  'chat.message.created',
  'chat.message.updated',
  'chat.message.deleted',
  'chat.expired',
  'chat.receipt',
  'chat.typing',
  'chat.pinned',
  'chat.reaction',
  'presence.changed',
  'profile.updated',
  'couple.updated',
  'couple.linked',
  'pairing.requested',
  'pairing.cancelled',
  'memory.created',
  'memory.updated',
  'memory.deleted',
  'memory.comment',
  'memory.reaction',
  'plan.updated',
  'checklist.updated',
  'deck.matched',
  'list.updated',
  'goal.updated',
  'letter.delivered',
  'letter.read',
  'capsule.opened',
  'question.revealed',
  'checkin.shared',
  'notification.created',
  'promise.updated',
  'quiet.changed',
  'session.revoked',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export interface RealtimeEnvelope<P = unknown> {
  id: string;
  type: RealtimeEventType;
  occurredAt: string;
  actorId?: string | null;
  payload: P;
}

/** Client → сервер destination (asyncapi `typing`, `presence`, `chatDelivered`). */
export const SEND_DESTINATIONS = {
  typing: '/app/typing',
  presence: '/app/presence',
  chatDelivered: '/app/chat.delivered',
} as const;

export const EVENTS_DESTINATION = '/user/queue/events';

export function isRealtimeEnvelope(v: unknown): v is RealtimeEnvelope {
  if (typeof v !== 'object' || v == null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.type === 'string' &&
    (REALTIME_EVENT_TYPES as readonly string[]).includes(o.type) &&
    typeof o.occurredAt === 'string'
  );
}
