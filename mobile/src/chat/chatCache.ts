import type { Message, MessagePage, MessageReaction } from '@/api/queries/chat';
import type { RealtimeEnvelope } from '@/realtime';

/**
 * S-40-ийн мессежийн цонх: хуучнаас шинэ рүү, давхардалгүй. TanStack-ийн infinite query-г
 * ашиглахгүй — шинэ мессеж ирэх бүрд «сүүлийн N» хуудас гулсдаг тул pageParam-аар дахин
 * татахад хуудас хооронд мессеж алга болдог. Оронд нь цонхыг энд нэгтгэнэ:
 * сүүлийн хуудсыг кэштэй давхцлаар нь залгаж, давхцахгүй бол `after`-аар дутууг нөхнө.
 */
export interface ChatWindow {
  items: Message[];
  /** Цонхны өмнө хуучин мессеж бий (`loadOlder`). */
  hasMoreBefore: boolean;
}

export const EMPTY_WINDOW: ChatWindow = { items: [], hasMoreBefore: false };

function upsert(items: Message[], incoming: Message[]): Message[] {
  const byId = new Map(incoming.map((m) => [m.id, m]));
  const out = items.map((m) => byId.get(m.id) ?? m);
  const known = new Set(items.map((m) => m.id));
  for (const m of incoming) if (!known.has(m.id)) out.push(m);
  return out;
}

/**
 * Сүүлийн хуудсыг (`latest`) кэштэй нэгтгэнэ. Давхцал олдвол давхцсан хэсгээс хойшхийг сервер
 * хариугаар солино (засвар, устгал, хугацаа дууссаныг ч тусгана). Олдохгүй бол `null` —
 * дуудагч `after`-аар нөхөх (`fillGap`) эсвэл цонхыг шинээр эхлүүлнэ.
 */
export function mergeLatest(prev: ChatWindow | undefined, latest: MessagePage): ChatWindow | null {
  if (!prev || prev.items.length === 0 || latest.items.length === 0) {
    return { items: latest.items, hasMoreBefore: latest.hasMoreBefore };
  }
  const first = latest.items[0].id;
  const idx = prev.items.findIndex((m) => m.id === first);
  if (idx >= 0) return { items: [...prev.items.slice(0, idx), ...latest.items], hasMoreBefore: prev.hasMoreBefore };
  // Сүүлийн хуудас кэшийн өмнөх мессежтэй ч давхцахгүй бол (цөөн мессежтэй хос) бүгд шинэ
  if (!latest.hasMoreBefore) return { items: latest.items, hasMoreBefore: false };
  return null;
}

/** `after` хуудсуудыг (хуучнаас шинэ) цонхны ард залгана. */
export function appendNewer(prev: ChatWindow, pages: MessagePage[]): ChatWindow {
  return { items: upsert(prev.items, pages.flatMap((p) => p.items)), hasMoreBefore: prev.hasMoreBefore };
}

/** `before` хуудсыг цонхны өмнө залгана. */
export function prependOlder(prev: ChatWindow, page: MessagePage): ChatWindow {
  const known = new Set(prev.items.map((m) => m.id));
  return { items: [...page.items.filter((m) => !known.has(m.id)), ...prev.items], hasMoreBefore: page.hasMoreBefore };
}

const STATUS_RANK: Record<Message['status'], number> = { SENT: 0, DELIVERED: 1, READ: 2 };

/**
 * Realtime үйл явдлыг цонхонд шууд тусгана (AC-27 ≤ 1 с — дахин татахыг хүлээхгүй). Payload нь
 * сервер харж буй хүний өнцгөөс проекцлосон тул (`reactions.mine`) шууд итгэнэ.
 */
export function applyChatEvent(prev: ChatWindow | undefined, event: RealtimeEnvelope, me: string | null): ChatWindow | undefined {
  if (!prev) return prev;
  const p = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case 'chat.message.created':
    case 'chat.message.updated':
      return { ...prev, items: upsert(prev.items, [p as unknown as Message]) };
    case 'chat.message.deleted':
      return {
        ...prev,
        items: prev.items.map((m) =>
          m.id === p.messageId ? { ...m, deleted: true, text: null, media: null, location: null, reactions: [], pinnedAt: null } : m,
        ),
      };
    case 'chat.expired':
      return { ...prev, items: prev.items.filter((m) => m.id !== p.messageId) };
    case 'chat.reaction':
      return {
        ...prev,
        items: prev.items.map((m) => (m.id === p.messageId ? { ...m, reactions: p.reactions as MessageReaction[] } : m)),
      };
    case 'chat.pinned':
      return {
        ...prev,
        items: prev.items.map((m) =>
          m.id === p.messageId ? { ...m, pinnedAt: p.pinned ? (m.pinnedAt ?? event.occurredAt) : null } : m,
        ),
      };
    case 'chat.receipt': {
      // Хамтрагч миний `upToMessageId` хүртэлх мессежийг хүлээн авсан/уншсан (AC-29, AC-176)
      const upTo = prev.items.findIndex((m) => m.id === p.upToMessageId);
      const status = p.status as Message['status'];
      if (upTo < 0 || !(status in STATUS_RANK)) return prev;
      return {
        ...prev,
        items: prev.items.map((m, i) =>
          i <= upTo && m.sender.id === me && STATUS_RANK[m.status] < STATUS_RANK[status] ? { ...m, status } : m,
        ),
      };
    }
    default:
      return prev;
  }
}

/** Хамтрагчийн хамгийн сүүлийн, уншаагүй мессеж (`POST /messages/read`-ийн `upTo`). */
export function lastUnreadFromPartner(items: Message[], me: string | null): Message | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const m = items[i];
    if (m.sender.id !== me) return m.status === 'READ' ? null : m;
  }
  return null;
}

/** Өдрийн тусгаарлагч (S-40 «Өнөөдөр, 11 сарын 7»): өмнөх мессежээс өөр орон нутгийн өдөр бол. */
export function startsNewDay(prev: Message | undefined, current: Message, tz: string): boolean {
  if (!prev) return true;
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return day(prev.createdAt) !== day(current.createdAt);
}
