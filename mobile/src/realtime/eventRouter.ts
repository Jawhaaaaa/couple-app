import type { QueryClient } from '@tanstack/react-query';

import type { RealtimeEnvelope, RealtimeEventType } from './events';

/**
 * Үйл явдлын төрөл → шинэчлэх TanStack query key-үүд (LLD §4.4). Payload-аар кэшийг шууд засахын
 * оронд invalidate хийнэ: сервер л нууц талбарын проекцийг (INV-04) мэднэ.
 */
export const INVALIDATIONS: Record<RealtimeEventType, readonly (readonly string[])[]> = {
  'signal.received': [['dashboard']],
  'chat.message.created': [['messages'], ['dashboard']],
  'chat.message.updated': [['messages']],
  'chat.message.deleted': [['messages']],
  'chat.expired': [['messages']],
  'chat.receipt': [['messages']],
  'chat.typing': [],
  'chat.pinned': [['messages']],
  'chat.reaction': [['messages']],
  'presence.changed': [['dashboard']],
  'profile.updated': [['couple'], ['dashboard']],
  'couple.updated': [['couple'], ['dashboard'], ['me']],
  'couple.linked': [['me'], ['couple'], ['pairing'], ['invite'], ['dashboard']],
  'pairing.requested': [['pairing']],
  'pairing.cancelled': [['pairing'], ['invite']],
  'memory.created': [['memories'], ['memory-months'], ['dashboard']],
  'memory.updated': [['memories'], ['memory']],
  'memory.deleted': [['memories'], ['memory-months'], ['dashboard']],
  'memory.comment': [['memory']],
  'memory.reaction': [['memory']],
  'plan.updated': [['plans'], ['plan'], ['dashboard']],
  'checklist.updated': [['plan']],
  'deck.matched': [['deck']],
  'list.updated': [['list']],
  'goal.updated': [['goals'], ['goal']],
  'letter.delivered': [['letters'], ['dashboard']],
  'letter.read': [['letters'], ['letter']],
  'capsule.opened': [['capsules'], ['capsule']],
  'question.revealed': [['question']],
  'checkin.shared': [['checkins']],
  'notification.created': [['notifications']],
  'promise.updated': [['promise']],
  'quiet.changed': [['dashboard']],
  'session.revoked': [['sessions']],
};

type Listener = (event: RealtimeEnvelope) => void;
const listeners = new Map<RealtimeEventType, Set<Listener>>();

/** Дэлгэц тусгай урвал (ANIM-02, «бичиж байна») хийх үед — буцаасан функцээр цуцална. */
export function onRealtime(type: RealtimeEventType, fn: Listener): () => void {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

export function routeEvent(event: RealtimeEnvelope, queryClient: QueryClient): void {
  for (const key of INVALIDATIONS[event.type] ?? []) {
    void queryClient.invalidateQueries({ queryKey: [...key] });
  }
  listeners.get(event.type)?.forEach((fn) => fn(event));
}

/** Дахин холбогдоход тасарсан хугацааны өөрчлөлтийг авахын тулд бүгдийг шинэчилнэ. */
export function onReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries();
}
