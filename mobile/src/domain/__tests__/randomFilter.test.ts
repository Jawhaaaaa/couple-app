import type { DateIdea, LibraryIdea } from '@/api/queries/ideas';
import { loosenFilters, matchesRandomFilter, pickRandom } from '@/domain/randomFilter';

const author = { id: 'u1', displayName: 'Бат' };
const idea = (id: string, o: Partial<DateIdea>): DateIdea => ({ id, title: id, category: 'HOME', author, createdAt: '2026-11-01T00:00:00Z', version: 0, ...o });
const lib = (id: string, o: Partial<LibraryIdea>): LibraryIdea => ({
  id,
  title: id,
  description: '',
  category: 'HOME',
  budgetBand: 'FREE',
  seasons: ['WINTER'],
  setting: 'HOME',
  longDistance: false,
  durationMinutes: 60,
  preparation: '',
  ...o,
});

const ideas = [
  idea('home-cheap', { setting: 'HOME', budgetMnt: 30_000 }),
  idea('home-unknown', { setting: 'HOME', budgetMnt: null }),
  idea('home-pricey', { setting: 'HOME', budgetMnt: 80_000 }),
  idea('outdoor-cheap', { setting: 'OUTDOOR', budgetMnt: 10_000 }),
  idea('no-setting', { setting: null, budgetMnt: 0 }),
];

describe('AC-98 санамсаргүй сонголт шүүлтэд тохирох санаанаас л', () => {
  it('«гэртээ, ≤ 50 000₮» шүүлтээр 100 удаа — зөвхөн тохирох санаа', () => {
    const f = { setting: 'HOME' as const, maxBudget: 50_000 };
    const picked = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const pick = pickRandom(ideas, f);
      expect(pick).not.toBeNull();
      expect(matchesRandomFilter(pick!, f)).toBe(true);
      picked.add(pick!.id);
    }
    expect([...picked].sort()).toEqual(['home-cheap', 'home-unknown']);
  });

  it('сангийн санаа: зурвасын дээд хязгаараар; OVER_150K төсвийн шүүлтэд хэзээ ч тохирохгүй', () => {
    expect(matchesRandomFilter(lib('l1', { budgetBand: 'UPTO_50K' }), { maxBudget: 50_000 })).toBe(true);
    expect(matchesRandomFilter(lib('l2', { budgetBand: '50K_150K' }), { maxBudget: 50_000 })).toBe(false);
    expect(matchesRandomFilter(lib('l3', { budgetBand: 'OVER_150K' }), { maxBudget: 1_000_000 })).toBe(false);
  });

  it('тохирох санаа алга бол null; «Шүүлт сулруулах» төсөв → гэр/гадаа → ангилал → сан', () => {
    const f = { category: 'SPORT' as const, setting: 'OUTDOOR' as const, maxBudget: 0 };
    expect(pickRandom(ideas, f)).toBeNull();
    const s1 = loosenFilters(f);
    expect(s1).toEqual({ category: 'SPORT', setting: 'OUTDOOR' });
    const s2 = loosenFilters(s1!);
    expect(s2).toEqual({ category: 'SPORT' });
    const s3 = loosenFilters(s2!);
    expect(s3).toEqual({});
    expect(loosenFilters(s3!)).toEqual({ includeLibrary: true });
    expect(loosenFilters({ includeLibrary: true })).toBeNull();
  });
});
