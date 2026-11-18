import type { CityRef } from '@/api/queries/auth';
import {
  type DatePlan,
  type DatePlanCreate,
  type DatePlanUpdate,
  type IdeaCategory,
  type Place,
  type PlanScope,
  type Recurrence,
  CATEGORIES,
  CHECKLIST_TEXT_MAX,
  TITLE_MAX,
} from '@/api/queries/plans';
import { isValidTime, utcToZoned, zonedToUtc } from '@/domain/planTime';
import { type CalendarDate, isCalendarDate } from '@/i18n/calendarDate';

/** S-54 маягт (FR-7.2, FR-7.4, FR-7.10): огноо + цаг хэрэглэгчийн бүсээр (AC-34). */
export interface PlanForm {
  title: string;
  description: string;
  category: IdeaCategory | null;
  ideaId: string | null;
  date: CalendarDate;
  time: string;
  venue: string;
  city: CityRef | null;
  budget: string;
  reminderOffsets: number[];
  recurrence: Recurrence;
  until: string;
  checklist: string[];
}

export type PlanFormError = 'TITLE' | 'DATE' | 'TIME' | 'PLACE' | 'BUDGET' | 'UNTIL';

/** Анхдагч сануулга (FR-7.4): 1 өдөр, 1 цагийн өмнө — минутаар. */
export const REMINDER_DAY = 1440;
export const REMINDER_HOUR = 60;
export const DEFAULT_REMINDERS = [REMINDER_DAY, REMINDER_HOUR];
export const DEFAULT_TIME = '19:00';
export const DESCRIPTION_MAX = 2000;

export function emptyPlanForm(date: CalendarDate): PlanForm {
  return {
    title: '',
    description: '',
    category: null,
    ideaId: null,
    date,
    time: DEFAULT_TIME,
    venue: '',
    city: null,
    budget: '',
    reminderOffsets: [...DEFAULT_REMINDERS],
    recurrence: 'NONE',
    until: '',
    checklist: [],
  };
}

/**
 * `?draft=` — санаа (S-51 «Болзоо болгох»), wishlist (AC-110)-аас ирсэн бөглөлт:
 * `{title, description?, category?, ideaId?, budgetMnt?, place?}`.
 */
export interface PlanDraft {
  title?: string;
  description?: string;
  category?: IdeaCategory;
  ideaId?: string;
  budgetMnt?: number;
  place?: Place | null;
}

export function parsePlanDraft(raw: string | string[] | undefined): PlanDraft | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!p || typeof p !== 'object') return null;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
    const place = p.place as Place | null | undefined;
    return {
      title: str(p.title),
      description: str(p.description),
      category: CATEGORIES.includes(p.category as IdeaCategory) ? (p.category as IdeaCategory) : undefined,
      ideaId: str(p.ideaId),
      budgetMnt: typeof p.budgetMnt === 'number' && p.budgetMnt >= 0 ? p.budgetMnt : undefined,
      place: place && typeof place === 'object' && typeof place.name === 'string' && typeof place.lat === 'number' ? place : null,
    };
  } catch {
    // Эвдэрсэн параметр — хоосон маягтаас эхэлнэ
    return null;
  }
}

function cityOf(place: Place): CityRef {
  return { name: place.city ?? place.name, countryCode: place.countryCode ?? '', lat: place.lat, lon: place.lon, timezone: '' };
}

export function applyPlanDraft(form: PlanForm, draft: PlanDraft | null): PlanForm {
  if (!draft) return form;
  return {
    ...form,
    title: (draft.title ?? form.title).slice(0, TITLE_MAX),
    description: (draft.description ?? form.description).slice(0, DESCRIPTION_MAX),
    category: draft.category ?? form.category,
    ideaId: draft.ideaId ?? form.ideaId,
    budget: draft.budgetMnt !== undefined ? String(draft.budgetMnt) : form.budget,
    ...(draft.place ? { venue: draft.place.name, city: cityOf(draft.place) } : {}),
  };
}

/** Засварын маягт — серверийн болзооноос, хэрэглэгчийн бүсээр. */
export function planFormFrom(plan: DatePlan, timeZone: string): PlanForm {
  const { date, time } = utcToZoned(plan.startsAt, timeZone);
  return {
    title: plan.title,
    description: plan.description ?? '',
    category: plan.category ?? null,
    ideaId: plan.ideaId ?? null,
    date,
    time,
    venue: plan.place?.name ?? '',
    city: plan.place ? cityOf(plan.place) : null,
    budget: plan.plannedBudgetMnt != null ? String(plan.plannedBudgetMnt) : '',
    reminderOffsets: plan.reminderOffsets,
    recurrence: plan.recurrence,
    until: plan.recurrenceUntil ?? '',
    checklist: [],
  };
}

function parseBudget(raw: string): number | null | 'INVALID' {
  const digits = raw.replace(/[\s,]/g, '');
  if (!digits) return null;
  if (!/^\d+$/.test(digits)) return 'INVALID';
  return Number(digits);
}

export function formPlace(form: PlanForm): Place | null | 'INVALID' {
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

export function validatePlanForm(form: PlanForm): PlanFormError[] {
  const errors: PlanFormError[] = [];
  if (!form.title.trim()) errors.push('TITLE');
  if (!isCalendarDate(form.date.trim())) errors.push('DATE');
  if (!isValidTime(form.time)) errors.push('TIME');
  if (formPlace(form) === 'INVALID') errors.push('PLACE');
  if (parseBudget(form.budget) === 'INVALID') errors.push('BUDGET');
  if (form.recurrence !== 'NONE' && form.until.trim() && !isCalendarDate(form.until.trim())) errors.push('UNTIL');
  return errors;
}

/** `POST /plans` — `startsAt` нь хэрэглэгчийн бүсийн огноо+цагийн UTC агшин (AC-34). */
export function buildPlanCreate(form: PlanForm, timeZone: string, clientId: string): DatePlanCreate {
  const place = formPlace(form);
  const budget = parseBudget(form.budget);
  const description = form.description.trim();
  const until = form.until.trim();
  return {
    clientId,
    title: form.title.trim().slice(0, TITLE_MAX),
    ...(description ? { description: description.slice(0, DESCRIPTION_MAX) } : {}),
    ...(form.category ? { category: form.category } : {}),
    ...(form.ideaId ? { ideaId: form.ideaId } : {}),
    startsAt: zonedToUtc(form.date.trim(), form.time.trim(), timeZone),
    timezone: timeZone,
    ...(place && place !== 'INVALID' ? { place } : {}),
    ...(typeof budget === 'number' ? { plannedBudgetMnt: budget } : {}),
    reminderOffsets: [...form.reminderOffsets].sort((a, b) => b - a),
    recurrence: form.recurrence,
    ...(form.recurrence !== 'NONE' && until ? { recurrenceUntil: until } : {}),
    checklist: form.checklist
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ text: text.slice(0, CHECKLIST_TEXT_MAX) })),
  };
}

/** `PATCH /plans/{id}` — давталттай болзоонд нэг удаа эсвэл бүх давталт (AC-37). */
export function buildPlanUpdate(
  form: PlanForm,
  timeZone: string,
  version: number,
  scope: PlanScope,
  occurrenceOn: string | null,
): DatePlanUpdate {
  const create = buildPlanCreate(form, timeZone, 'unused');
  return {
    title: create.title,
    description: create.description ?? null,
    category: create.category ?? null,
    startsAt: create.startsAt,
    timezone: timeZone,
    place: create.place ?? null,
    plannedBudgetMnt: create.plannedBudgetMnt ?? null,
    reminderOffsets: create.reminderOffsets,
    ...(scope === 'SERIES' ? { recurrence: create.recurrence, recurrenceUntil: create.recurrenceUntil ?? null } : {}),
    version,
    scope,
    ...(scope === 'OCCURRENCE' && occurrenceOn ? { occurrenceOn } : {}),
  };
}

/** S-55: 1–3 «огноо + цаг» мөрийг UTC болгоно; дутуу мөр бол `null`. */
export function counterOptions(rows: { date: string; time: string }[], timeZone: string): string[] | null {
  if (rows.length < 1 || rows.length > 3) return null;
  if (rows.some((r) => !isCalendarDate(r.date.trim()) || !isValidTime(r.time))) return null;
  return rows.map((r) => zonedToUtc(r.date.trim(), r.time.trim(), timeZone));
}

/** Газрын нэр, хот нэрээс өөр бол «нэр, хот» (S-54, календарийн үйл явдал). */
export function placeLabel(place: { name: string; city?: string | null }): string {
  return place.city && place.city !== place.name ? `${place.name}, ${place.city}` : place.name;
}
