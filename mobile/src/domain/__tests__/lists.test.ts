import type { components } from '@/api/schema';
import {
  applyOrder,
  bucketMemoryDraft,
  groupListItems,
  isListKind,
  listPrefillFrom,
  moveWithinGroup,
  openOrder,
  parseListDraft,
  wishToPlanDraft,
} from '@/domain/lists';

type ListItem = components['schemas']['ListItem'];

const item = (id: string, o: Partial<ListItem> = {}): ListItem => ({
  id,
  title: id,
  position: 0,
  createdBy: 'A',
  votes: [],
  bothWant: false,
  version: 0,
  ...o,
});

describe('S-63 жагсаалтын бүлэглэлт', () => {
  const items = [
    item('c', { position: 2 }),
    item('done-old', { position: 3, doneAt: '2026-11-01T10:00:00Z', doneBy: 'B' }),
    item('both', { position: 4, votes: ['A', 'B'], bothWant: true }),
    item('a', { position: 0 }),
    item('done-new', { position: 1, doneAt: '2026-11-10T10:00:00Z', doneBy: 'A' }),
    item('b', { position: 1 }),
  ];

  it('AC-109 хоёулаа хүссэн нь дээр, AC-107 дууссан нь доор (сүүлд дууссан нь эхэнд)', () => {
    const g = groupListItems(items);
    expect(g.wanted.map((i) => i.id)).toEqual(['both']);
    expect(g.open.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(g.done.map((i) => i.id)).toEqual(['done-new', 'done-old']);
    expect(openOrder(g)).toEqual(['both', 'a', 'b', 'c']);
  });

  it('AC-109 дээш/доош — бүлэг дотроо, хязгаарт null; бүх нээлттэй зүйлийн дараалал буцаана', () => {
    const g = groupListItems(items);
    expect(moveWithinGroup(g, 'c', -1)).toEqual(['both', 'a', 'c', 'b']);
    expect(moveWithinGroup(g, 'a', 1)).toEqual(['both', 'b', 'a', 'c']);
    expect(moveWithinGroup(g, 'a', -1)).toBeNull();
    expect(moveWithinGroup(g, 'both', 1)).toBeNull();
    expect(moveWithinGroup(g, 'done-new', 1)).toBeNull();
    const reordered = applyOrder(items, ['both', 'a', 'c', 'b']);
    expect(groupListItems(reordered).open.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('listKind шалгалт', () => {
    expect(isListKind('wishlist')).toBe(true);
    expect(isListKind('movies')).toBe(false);
    expect(isListKind(undefined)).toBe(false);
  });
});

describe('AC-110 wishlist → болзооны ноорог', () => {
  it('кино → гарчиг + «Соёл»; газар → «Аялал»; болзооны ангилал байвал түүгээр', () => {
    expect(wishToPlanDraft({ title: 'Interstellar', wishType: 'MOVIE' })).toEqual({ title: 'Interstellar', category: 'CULTURE' });
    expect(wishToPlanDraft({ title: 'Тэрэлж', wishType: 'PLACE', description: 'Майхан' })).toEqual({ title: 'Тэрэлж', description: 'Майхан', category: 'TRAVEL' });
    expect(wishToPlanDraft({ title: 'Пицца', wishType: 'OTHER', category: 'food' })).toEqual({ title: 'Пицца', category: 'FOOD' });
  });
});

describe('AC-91 чатаас «Жагсаалтад нэмэх»', () => {
  it('текстийн эхний мөр гарчиг, бүтэн текст тайлбар; ноорог параметр буцаж уншигдана', () => {
    const prefill = listPrefillFrom({ text: 'Хөвсгөл явах\nЗуны амралтаар' });
    expect(prefill).toEqual({ title: 'Хөвсгөл явах', description: 'Хөвсгөл явах\nЗуны амралтаар' });
    expect(parseListDraft(JSON.stringify(prefill))).toEqual(prefill);
  });

  it('нэг мөр бол тайлбаргүй; байршлын мессеж → газрын нэр', () => {
    expect(listPrefillFrom({ text: 'Сүү авах' })).toEqual({ title: 'Сүү авах' });
    expect(listPrefillFrom({ text: null, location: { name: 'Зайсан' } })).toEqual({ title: 'Зайсан' });
  });

  it('эвдэрсэн эсвэл гарчиггүй параметр → null', () => {
    expect(parseListDraft('{bad')).toBeNull();
    expect(parseListDraft(JSON.stringify({ title: '  ' }))).toBeNull();
    expect(parseListDraft(undefined)).toBeNull();
  });
});

describe('AC-106 bucket → дурсамжийн ноорог', () => {
  it('гарчиг, тайлбар, дууссан өдөр', () => {
    expect(bucketMemoryDraft({ title: 'Хөвсгөл', description: null }, '2026-11-14')).toEqual({ title: 'Хөвсгөл', occurredOn: '2026-11-14' });
  });
});
