import type { AnyIdea, BudgetBand, RandomFilters } from '@/api/queries/ideas';

/**
 * S-56 «Санамсаргүй сонго» (FR-7.8, AC-98) — backend `RandomIdeaPicker`-тэй ижил дүрэм:
 * - ангилал, гэр/гадаа — яг тэнцүү; санаанд гэр/гадаа заагаагүй бол тэр шүүлтэд тохирохгүй
 * - `maxBudget` — хосын санааны төсөв (сангийнх — зурвасын дээд хязгаар) ≤ шүүлт; төсөв
 *   заагаагүй хосын санаа «зардал тодорхойгүй» тул тохирно; `OVER_150K` хэзээ ч тохирохгүй
 * Сервер сонгоно; offline үед кэшийн санаанаас ижил дүрмээр сонгоно.
 */
export function bandUpperBound(band: BudgetBand): number {
  switch (band) {
    case 'FREE':
      return 0;
    case 'UPTO_50K':
      return 50_000;
    case '50K_150K':
      return 150_000;
    case 'OVER_150K':
      return Number.POSITIVE_INFINITY;
  }
}

function ideaBudget(idea: AnyIdea): number | null {
  if ('budgetBand' in idea) return bandUpperBound(idea.budgetBand);
  return idea.budgetMnt ?? null;
}

export function matchesRandomFilter(idea: AnyIdea, f: RandomFilters): boolean {
  if (f.category && idea.category !== f.category) return false;
  if (f.setting && (idea.setting ?? null) !== f.setting) return false;
  if (typeof f.maxBudget === 'number') {
    const budget = ideaBudget(idea);
    if (budget !== null && budget > f.maxBudget) return false;
  }
  return true;
}

/** Тохирох санаанаас санамсаргүй нэгийг; алга бол `null`. */
export function pickRandom<T extends AnyIdea>(ideas: T[], f: RandomFilters, rng: () => number = Math.random): T | null {
  const candidates = ideas.filter((i) => matchesRandomFilter(i, f));
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}

/**
 * «Шүүлт сулруулах» (AC-98): хамгийн хязгаарлагч шүүлтээс нэгийг хасна — төсөв → гэр/гадаа →
 * ангилал; сангийн санаа ороогүй бол эхлээд сангийнхыг нэмнэ. Сулруулах зүйлгүй бол `null`.
 */
export function loosenFilters(f: RandomFilters): RandomFilters | null {
  if (typeof f.maxBudget === 'number') {
    const { maxBudget: _m, ...rest } = f;
    return rest;
  }
  if (f.setting) {
    const { setting: _s, ...rest } = f;
    return rest;
  }
  if (f.category) {
    const { category: _c, ...rest } = f;
    return rest;
  }
  if (!f.includeLibrary) return { ...f, includeLibrary: true };
  return null;
}
