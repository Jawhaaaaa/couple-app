import type { components } from '@/api/schema';
import {
  admitLetterPhotos,
  canEditLetter,
  capsuleView,
  filterLetters,
  isLetterBox,
  type LetterForm,
  letterDeliverAt,
  sentStatusKey,
} from '@/domain/letters';

type LetterListItem = components['schemas']['LetterListItem'];

const A = { id: 'A', displayName: 'Бат' };
const B = { id: 'B', displayName: 'Ану' };

const item = (id: string, o: Partial<LetterListItem>): LetterListItem => ({ id, author: A, recipient: B, template: 'PAPER_1', status: 'DELIVERED', ...o });

describe('AC-111 захидлын зураг ≤ 5', () => {
  it('5 хүртэл орно, 6 дахь нь татгалзана', () => {
    expect(admitLetterPhotos(0, [1, 2, 3, 4, 5])).toEqual({ accepted: [1, 2, 3, 4, 5], rejected: 0 });
    expect(admitLetterPhotos(5, [6])).toEqual({ accepted: [], rejected: 1 });
    expect(admitLetterPhotos(3, [4, 5, 6])).toEqual({ accepted: [4, 5], rejected: 1 });
  });
});

describe('AC-113 «Надад ирсэн / Миний илгээсэн» шүүлт', () => {
  const letters = [
    item('a1', { author: A, recipient: B, deliveredAt: '2026-11-01T00:00:00Z' }),
    item('b1', { author: B, recipient: A, deliveredAt: '2026-11-03T00:00:00Z' }),
    item('b2', { author: B, recipient: A, deliveredAt: '2026-11-10T00:00:00Z', status: 'READ' }),
    item('a2', { author: A, recipient: B, status: 'SCHEDULED', deliverAt: '2026-12-01T00:00:00Z' }),
    item('a3', { author: A, recipient: B, status: 'CANCELLED', deliverAt: '2026-12-02T00:00:00Z' }),
  ];

  it('A-д ирсэн нь зөвхөн B-гийн хүргэгдсэн захидал, шинэ нь эхэнд', () => {
    expect(filterLetters(letters, 'inbox', 'A').map((l) => l.id)).toEqual(['b2', 'b1']);
  });

  it('A-гийн илгээсэн: товлосон ба хүргэгдсэн, цуцлагдсангүй, огноогоор', () => {
    expect(filterLetters(letters, 'sent', 'A').map((l) => l.id)).toEqual(['a2', 'a1']);
  });

  it('хайрцагны нэр', () => {
    expect(isLetterBox('capsules')).toBe(true);
    expect(isLetterBox('drafts')).toBe(false);
  });
});

describe('AC-182 илгээгчид харагдах төлөв, AC-112 засах эрх', () => {
  it('хүлээгдэж буй → хүргэгдсэн → уншсан', () => {
    expect(['DRAFT', 'SCHEDULED', 'DELIVERED', 'READ', 'CANCELLED'].map((s) => sentStatusKey(s as never))).toEqual(['draft', 'pending', 'delivered', 'read', 'cancelled']);
  });

  it('зөвхөн зохиогч, хүргэгдэхээс өмнө', () => {
    expect(canEditLetter({ author: A, status: 'SCHEDULED' }, 'A')).toBe(true);
    expect(canEditLetter({ author: A, status: 'DRAFT' }, 'A')).toBe(true);
    expect(canEditLetter({ author: A, status: 'DELIVERED' }, 'A')).toBe(false);
    expect(canEditLetter({ author: A, status: 'SCHEDULED' }, 'B')).toBe(false);
  });
});

describe('S-66 хүргэх цаг (хэрэглэгчийн бүсээр)', () => {
  const base: LetterForm = { template: 'PAPER_2', body: 'Хайртай шүү', mode: 'scheduled', date: '2026-12-24', time: '20:00', occasionLabel: '' };
  const now = Date.parse('2026-11-14T00:00:00Z');

  it('Улаанбаатарын 2026-12-24 20:00 → 12:00Z', () => {
    expect(letterDeliverAt(base, 'Asia/Ulaanbaatar', now, { draft: false })).toEqual({ deliverAt: '2026-12-24T12:00:00Z', error: null });
  });

  it('шууд бол null; хоосон бичвэр, буруу огноо/цаг, өнгөрсөн цагт алдаа', () => {
    expect(letterDeliverAt({ ...base, mode: 'now' }, 'UTC', now, { draft: false })).toEqual({ deliverAt: null, error: null });
    expect(letterDeliverAt({ ...base, body: ' ' }, 'UTC', now, { draft: false }).error).toBe('bodyRequired');
    expect(letterDeliverAt({ ...base, date: '2026-13-01' }, 'UTC', now, { draft: false }).error).toBe('dateInvalid');
    expect(letterDeliverAt({ ...base, time: '25:00' }, 'UTC', now, { draft: false }).error).toBe('timeInvalid');
    expect(letterDeliverAt({ ...base, date: '2026-11-01' }, 'UTC', now, { draft: false }).error).toBe('inPast');
  });

  it('ноорогт бичвэр, огноо шаардахгүй', () => {
    expect(letterDeliverAt({ ...base, body: '', date: '' }, 'UTC', now, { draft: true })).toEqual({ deliverAt: null, error: null });
  });
});

describe('AC-45 / GAP-15 капсулын төлөв', () => {
  const open = '2027-11-07';
  it('миний хэсэг битүүмжлээгүй бол бичнэ; битүүмжилсэн бол үгүй; огноо хүртэл хоног', () => {
    const v = capsuleView({ status: 'WRITING', openOn: open, parts: [{ author: A, sealed: false }] }, 'A', '2027-11-01');
    expect(v).toMatchObject({ canWrite: true, daysLeft: 6, opened: false, partner: null });
    expect(capsuleView({ status: 'WRITING', openOn: open, parts: [{ author: A, sealed: true }] }, 'A', '2027-11-01').canWrite).toBe(false);
  });

  it('хоёулаа битүүмжилсэн (SEALED) — бичихгүй, агуулгагүй; огноо өнгөрсөн бол 0 хоног', () => {
    const v = capsuleView({ status: 'SEALED', openOn: open, parts: [{ author: A, sealed: true }, { author: B, sealed: true }] }, 'B', '2027-12-01');
    expect(v).toMatchObject({ canWrite: false, daysLeft: 0 });
    expect(v.mine?.author.id).toBe('B');
    expect(v.mine?.body).toBeUndefined();
  });
});
