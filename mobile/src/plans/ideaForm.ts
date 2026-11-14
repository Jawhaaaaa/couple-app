import type { CityRef } from '@/api/queries/auth';
import { type DateIdea, type DateIdeaInput, type DateIdeaUpdate, IDEA_TITLE_MAX, type IdeaCategory, type IdeaSetting } from '@/api/queries/ideas';
import type { Place } from '@/api/queries/plans';

/** S-53 санааны маягт (FR-7.1, AC-179): гарчиг, тайлбар, ангилал, төсөв ₮, газар, холбоос, гэр/гадаа. */
export interface IdeaForm {
  title: string;
  description: string;
  category: IdeaCategory;
  budget: string;
  venue: string;
  city: CityRef | null;
  url: string;
  setting: IdeaSetting | null;
}

export type IdeaFormError = 'TITLE' | 'BUDGET' | 'PLACE' | 'URL';

export const IDEA_DESCRIPTION_MAX = 2000;

export function emptyIdeaForm(): IdeaForm {
  return { title: '', description: '', category: 'OTHER', budget: '', venue: '', city: null, url: '', setting: null };
}

function cityOf(place: Place): CityRef {
  return { name: place.city ?? place.name, countryCode: place.countryCode ?? '', lat: place.lat, lon: place.lon, timezone: '' };
}

export function ideaFormFrom(idea: DateIdea): IdeaForm {
  return {
    title: idea.title,
    description: idea.description ?? '',
    category: idea.category,
    budget: idea.budgetMnt != null ? String(idea.budgetMnt) : '',
    venue: idea.place?.name ?? '',
    city: idea.place ? cityOf(idea.place) : null,
    url: idea.url ?? '',
    setting: idea.setting ?? null,
  };
}

/**
 * `?draft=` — чатын «Болзооны санаа болгох» (FR-6.8, AC-91): `{title, description, place}`.
 * Байршил координаттай бол газар+хот болно, нэр л бол газрын нэр.
 */
export function parseIdeaDraft(raw: string | string[] | undefined): Partial<IdeaForm> | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    const out: Partial<IdeaForm> = {};
    if (typeof p.title === 'string') out.title = p.title.slice(0, IDEA_TITLE_MAX);
    if (typeof p.description === 'string') out.description = p.description.slice(0, IDEA_DESCRIPTION_MAX);
    const place = p.place as Place | string | null | undefined;
    if (typeof place === 'string') out.venue = place.slice(0, 200);
    else if (place && typeof place === 'object' && typeof place.lat === 'number' && typeof place.lon === 'number') {
      out.venue = String(place.name ?? '').slice(0, 200);
      out.city = cityOf(place);
    }
    return out;
  } catch {
    // Эвдэрсэн параметр — хоосон маягтаас эхэлнэ
    return null;
  }
}

function parseBudget(raw: string): number | null | 'INVALID' {
  const digits = raw.replace(/[\s,]/g, '');
  if (!digits) return null;
  return /^\d+$/.test(digits) ? Number(digits) : 'INVALID';
}

function formPlace(form: IdeaForm): Place | null | 'INVALID' {
  const venue = form.venue.trim();
  if (!form.city) return venue ? 'INVALID' : null;
  return {
    name: (venue || form.city.name).slice(0, 200),
    lat: form.city.lat,
    lon: form.city.lon,
    city: form.city.name,
    ...(form.city.countryCode ? { countryCode: form.city.countryCode } : {}),
  };
}

function validUrl(raw: string): boolean {
  return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(raw.trim());
}

export function validateIdeaForm(form: IdeaForm): IdeaFormError[] {
  const errors: IdeaFormError[] = [];
  if (!form.title.trim()) errors.push('TITLE');
  if (parseBudget(form.budget) === 'INVALID') errors.push('BUDGET');
  if (formPlace(form) === 'INVALID') errors.push('PLACE');
  if (form.url.trim() && !validUrl(form.url)) errors.push('URL');
  return errors;
}

export function buildIdeaInput(form: IdeaForm, clientId: string): DateIdeaInput {
  const budget = parseBudget(form.budget);
  const place = formPlace(form);
  const description = form.description.trim();
  const url = form.url.trim();
  return {
    title: form.title.trim().slice(0, IDEA_TITLE_MAX),
    ...(description ? { description: description.slice(0, IDEA_DESCRIPTION_MAX) } : {}),
    category: form.category,
    ...(typeof budget === 'number' ? { budgetMnt: budget } : {}),
    ...(place && place !== 'INVALID' ? { place } : {}),
    ...(url ? { url } : {}),
    ...(form.setting ? { setting: form.setting } : {}),
    clientId,
  };
}

export function buildIdeaUpdate(form: IdeaForm, version: number): DateIdeaUpdate {
  const input = buildIdeaInput(form, 'unused');
  return {
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    budgetMnt: input.budgetMnt ?? null,
    place: input.place ?? null,
    url: input.url ?? null,
    setting: input.setting ?? null,
    version,
  };
}

/** S-51 «Болзоо болгох» → S-54 `?draft=` (AC-110-тэй ижил зам). */
export function planDraftFromIdea(idea: Pick<DateIdea, 'id' | 'title' | 'description' | 'category' | 'budgetMnt' | 'place'>): string {
  return JSON.stringify({
    title: idea.title,
    ...(idea.description ? { description: idea.description } : {}),
    category: idea.category,
    ideaId: idea.id,
    ...(idea.budgetMnt != null ? { budgetMnt: idea.budgetMnt } : {}),
    ...(idea.place ? { place: idea.place } : {}),
  });
}
