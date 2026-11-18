import type { Message, MessagePage } from '@/api/queries/chat';
import { appendNewer, applyChatEvent, type ChatWindow, lastUnreadFromPartner, mergeLatest, prependOlder, startsNewDay } from '@/chat/chatCache';
import { pendingMessages } from '@/chat/sendMessage';
import type { RealtimeEnvelope } from '@/realtime';

const ME = 'u-bat';
const PARTNER = 'u-anu';

function msg(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    clientMessageId: `c-${id}`,
    sender: { id: ME, displayName: 'Бат' },
    kind: 'TEXT',
    text: id,
    status: 'SENT',
    deleted: false,
    reactions: [],
    createdAt: '2026-11-07T04:00:00Z',
    ...overrides,
  } as Message;
}

const page = (ids: string[], more = { hasMoreBefore: false, hasMoreAfter: false }): MessagePage => ({ items: ids.map((i) => msg(i)), ...more });
const ids = (w: ChatWindow | null | undefined) => w?.items.map((m) => m.id);
const event = (type: RealtimeEnvelope['type'], payload: unknown): RealtimeEnvelope => ({ id: 'e', type, occurredAt: '2026-11-07T05:00:00Z', payload }) as RealtimeEnvelope;

describe('AC-27 AC-28 чатын цонх — хуудас гулсахад мессеж алдагдахгүй, давхардахгүй', () => {
  it('сүүлийн хуудас кэштэй давхцвал давхцлаас хойшхийг солино (хуучин хэсэг хэвээр)', () => {
    const prev: ChatWindow = { items: ['m1', 'm2', 'm3', 'm4'].map((i) => msg(i)), hasMoreBefore: true };
    const latest = page(['m3', 'm4', 'm5'], { hasMoreBefore: true, hasMoreAfter: false });
    latest.items[0] = msg('m3', { text: 'засварласан', editedAt: '2026-11-07T04:10:00Z' });
    const merged = mergeLatest(prev, latest);
    expect(ids(merged)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(merged?.items[2].text).toBe('засварласан');
    expect(merged?.hasMoreBefore).toBe(true);
  });

  it('давхцалгүй (тасарсан хооронд олон мессеж) бол null — дуудагч after-аар нөхнө', () => {
    const prev: ChatWindow = { items: [msg('m1'), msg('m2')], hasMoreBefore: false };
    expect(mergeLatest(prev, page(['m40', 'm41'], { hasMoreBefore: true, hasMoreAfter: false }))).toBeNull();
    const filled = appendNewer(prev, [page(['m3', 'm4']), page(['m5'])]);
    expect(ids(filled)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('кэш хоосон бол сүүлийн хуудас; хуучныг өмнө нь залгахад давхардалгүй', () => {
    const first = mergeLatest(undefined, page(['m3', 'm4'], { hasMoreBefore: true, hasMoreAfter: false }));
    expect(ids(first)).toEqual(['m3', 'm4']);
    const older = prependOlder(first!, page(['m1', 'm2', 'm3']));
    expect(ids(older)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(older.hasMoreBefore).toBe(false);
  });
});

describe('AC-176 AC-29 realtime үйл явдал', () => {
  const base: ChatWindow = {
    items: [msg('m1'), msg('m2'), msg('p1', { sender: { id: PARTNER, displayName: 'Ану' } }), msg('m3')],
    hasMoreBefore: false,
  };

  it('chat.message.created шинэ мессежийг төгсгөлд, давтан ирвэл солино', () => {
    const w = applyChatEvent(base, event('chat.message.created', msg('m4')), ME);
    expect(ids(w)).toEqual(['m1', 'm2', 'p1', 'm3', 'm4']);
    const again = applyChatEvent(w, event('chat.message.created', msg('m4', { text: 'x' })), ME);
    expect(again?.items).toHaveLength(5);
  });

  it('chat.receipt READ — upTo хүртэлх МИНИЙ мессеж уншсан, хойшхи нь хэвээр; төлөв ухрахгүй', () => {
    const w = applyChatEvent(base, event('chat.receipt', { upToMessageId: 'm2', status: 'READ', at: 'x' }), ME)!;
    expect(w.items.map((m) => m.status)).toEqual(['READ', 'READ', 'SENT', 'SENT']);
    const back = applyChatEvent(w, event('chat.receipt', { upToMessageId: 'm3', status: 'DELIVERED', at: 'x' }), ME)!;
    expect(back.items.map((m) => m.status)).toEqual(['READ', 'READ', 'SENT', 'DELIVERED']);
  });

  it('устгасан мессеж «Мессеж устгагдсан» болж агуулга, реакц арилна; дууссан мессеж цонхноос алга (AC-30, AC-92)', () => {
    const withReaction: ChatWindow = { ...base, items: base.items.map((m) => (m.id === 'm1' ? { ...m, reactions: [{ emoji: 'LOVE', count: 1, userIds: [PARTNER], mine: false }] } : m)) };
    const deleted = applyChatEvent(withReaction, event('chat.message.deleted', { messageId: 'm1' }), ME)!;
    expect(deleted.items[0]).toMatchObject({ deleted: true, text: null, reactions: [] });
    const expired = applyChatEvent(deleted, event('chat.expired', { messageId: 'p1' }), ME)!;
    expect(ids(expired)).toEqual(['m1', 'm2', 'm3']);
  });

  it('реакц ба pin', () => {
    const r = applyChatEvent(base, event('chat.reaction', { messageId: 'm2', reactions: [{ emoji: 'HUG', count: 1, userIds: [PARTNER], mine: false }] }), ME)!;
    expect(r.items[1].reactions[0].emoji).toBe('HUG');
    const pinned = applyChatEvent(r, event('chat.pinned', { messageId: 'm2', pinned: true }), ME)!;
    expect(pinned.items[1].pinnedAt).toBe('2026-11-07T05:00:00Z');
    const unpinned = applyChatEvent(pinned, event('chat.pinned', { messageId: 'm2', pinned: false }), ME)!;
    expect(unpinned.items[1].pinnedAt).toBeNull();
  });

  it('хамтрагчийн хамгийн сүүлийн уншаагүй мессеж; уншсан бол null', () => {
    const items = [msg('p0', { sender: { id: PARTNER, displayName: 'Ану' } }), msg('m9')];
    expect(lastUnreadFromPartner(items, ME)?.id).toBe('p0');
    items[0] = { ...items[0], status: 'READ' };
    expect(lastUnreadFromPartner(items, ME)).toBeNull();
  });

  it('өдрийн тусгаарлагч орон нутгийн өдрөөр', () => {
    const a = msg('a', { createdAt: '2026-11-07T15:30:00Z' });
    const b = msg('b', { createdAt: '2026-11-07T16:30:00Z' });
    expect(startsNewDay(a, b, 'Asia/Ulaanbaatar')).toBe(true); // 23:30 → 00:30
    expect(startsNewDay(a, b, 'UTC')).toBe(false);
    expect(startsNewDay(undefined, a, 'UTC')).toBe(true);
  });
});

describe('AC-28 outbox-ын хүлээгдэж буй мессеж', () => {
  it('зөвхөн POST /messages, clientMessageId-аар', () => {
    const pending = pendingMessages([
      { clientId: 'c1', method: 'POST', path: '/messages', body: { clientId: 'c1', clientMessageId: 'c1', kind: 'TEXT', text: 'сайн уу' }, createdAt: 'x', attempts: 0 },
      { clientId: 's1', method: 'POST', path: '/signals', body: { clientId: 's1', kind: 'HEART' }, createdAt: 'x', attempts: 0 },
    ]);
    expect(pending).toEqual([{ clientMessageId: 'c1', body: { kind: 'TEXT', text: 'сайн уу' }, createdAt: 'x', attempts: 0 }]);
  });
});
