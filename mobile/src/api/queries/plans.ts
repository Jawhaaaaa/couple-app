import { type QueryClient, useQuery } from '@tanstack/react-query';

import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';
import { useSessionStore } from '@/stores/sessionStore';

type S = components['schemas'];
export type DatePlan = S['DatePlan'];
export type DatePlanSummary = S['DatePlanSummary'];
export type DatePlanCreate = S['DatePlanCreate'];
export type DatePlanUpdate = S['DatePlanUpdate'];
export type ChecklistItem = S['ChecklistItem'];
export type CounterOption = S['CounterOption'];
export type Expense = S['Expense'];
export type WeatherForecast = S['WeatherForecast'];
export type PlanStatus = S['PlanStatus'];
export type Recurrence = S['Recurrence'];
export type IdeaCategory = S['IdeaCategory'];
export type Place = S['Place'];
export type PlanView = 'upcoming' | 'past' | 'pending';
export type PlanScope = 'SERIES' | 'OCCURRENCE';

/**
 * Болзоо (FR-7.2…7.13) — гэрээ `contracts/openapi.yaml` (Plans). Key `['plans', view|range]`
 * ба `['plan', id, occurrenceOn]` нь realtime `plan.updated`, `checklist.updated`-ээр
 * шинэчлэгдэнэ (`eventRouter.ts`) — checklist «2 of 4» хоёр талд бодит цагаар (AC-96).
 */
export const PLANS_KEY = ['plans'] as const;
export const planKey = (id: string, occurrenceOn?: string | null) => ['plan', id, occurrenceOn ?? null] as const;

export const CATEGORIES: IdeaCategory[] = ['FOOD', 'TRAVEL', 'HOME', 'SPORT', 'CULTURE', 'OUTDOOR', 'OTHER'];
export const RECURRENCES: Recurrence[] = ['NONE', 'WEEKLY', 'MONTHLY'];
export const TITLE_MAX = 120;
export const CHECKLIST_TEXT_MAX = 200;
/** «Өөр цаг» — 1–3 хувилбар (AC-33). */
export const COUNTER_MAX = 3;

export function usePlans(view: PlanView, { enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: [...PLANS_KEY, view],
    queryFn: () => unwrap(api.GET('/plans', { params: { query: { view } } })),
    enabled: !!accessToken && enabled,
  });
}

/** Календарийн муж (AC-94): давталтыг сервер мужид задална. */
export function usePlansRange(from: string, to: string) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: [...PLANS_KEY, { from, to }],
    queryFn: () => unwrap(api.GET('/plans', { params: { query: { from, to } } })),
    enabled: !!accessToken,
  });
}

export function usePlan(id: string | undefined, occurrenceOn?: string | null) {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: planKey(id ?? '', occurrenceOn),
    queryFn: () =>
      unwrap(
        api.GET('/plans/{planId}', {
          params: { path: { planId: id ?? '' }, query: occurrenceOn ? { occurrenceOn } : {} },
        }),
      ),
    enabled: !!accessToken && !!id,
  });
}

export function createPlan(body: DatePlanCreate): Promise<DatePlan> {
  return unwrap(api.POST('/plans', { body }));
}

export function updatePlan(id: string, body: DatePlanUpdate): Promise<DatePlan> {
  return unwrap(api.PATCH('/plans/{planId}', { params: { path: { planId: id } }, body }));
}

export async function cancelPlan(id: string, scope: PlanScope, occurrenceOn?: string | null): Promise<void> {
  const query = { scope, ...(occurrenceOn ? { occurrenceOn } : {}) };
  await unwrapEmpty(api.DELETE('/plans/{planId}', { params: { path: { planId: id }, query } }));
}

export type PlanAction = 'ACCEPT' | 'DECLINE' | 'COUNTER';

/** RSVP (AC-33): зөвшөөрөх, татгалзах, эсвэл 1–3 өөр цаг санал болгох. */
export function respondToPlan(id: string, action: PlanAction, options?: string[]): Promise<DatePlan> {
  return unwrap(
    api.POST('/plans/{planId}/respond', {
      params: { path: { planId: id } },
      body: { action, ...(action === 'COUNTER' ? { options } : {}) },
    }),
  );
}

export function chooseOption(id: string, optionId: string): Promise<DatePlan> {
  return unwrap(api.POST('/plans/{planId}/choose-option', { params: { path: { planId: id } }, body: { optionId } }));
}

export function addChecklistItem(planId: string, text: string): Promise<ChecklistItem> {
  return unwrap(api.POST('/plans/{planId}/checklist', { params: { path: { planId } }, body: { text } }));
}

export function setChecklistDone(item: ChecklistItem, done: boolean): Promise<ChecklistItem> {
  return unwrap(api.PATCH('/checklist-items/{itemId}', { params: { path: { itemId: item.id } }, body: { done, version: item.version } }));
}

export async function deleteChecklistItem(itemId: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/checklist-items/{itemId}', { params: { path: { itemId } } }));
}

export function addExpense(planId: string, body: { amountMnt: number; payerId: string; note?: string; spentOn: string }): Promise<Expense> {
  return unwrap(api.POST('/plans/{planId}/expenses', { params: { path: { planId } }, body }));
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await unwrapEmpty(api.DELETE('/expenses/{expenseId}', { params: { path: { expenseId } } }));
}

/** `.ics` (AC-101, AC-158) — нэвтрэлттэй тул `saveFile`-д `Authorization`-тэй. */
export function planIcsPath(id: string, occurrenceOn?: string | null): string {
  const q = occurrenceOn ? `?occurrenceOn=${encodeURIComponent(occurrenceOn)}` : '';
  return `/plans/${encodeURIComponent(id)}/ics${q}`;
}

/** Checklist-ийн явц «2 of 4» (AC-96): серверийн `checklistProgress`, үгүй бол жагсаалтаас. */
export function checklistProgress(plan: Pick<DatePlan, 'checklist' | 'checklistProgress'>): { done: number; total: number } {
  if (plan.checklistProgress) return plan.checklistProgress;
  return { done: plan.checklist.filter((i) => i.done).length, total: plan.checklist.length };
}

/** Хариу өгөх ээлж хэнийх вэ (AC-33). */
export type RsvpState =
  | { kind: 'respond' }
  | { kind: 'waiting' }
  | { kind: 'choose'; options: CounterOption[] }
  | { kind: 'confirmed' }
  | { kind: 'closed' };

export function rsvpState(plan: Pick<DatePlan, 'status' | 'proposer' | 'counterOptions'>, myId: string | null): RsvpState {
  switch (plan.status) {
    case 'PENDING':
      return plan.proposer?.id === myId ? { kind: 'waiting' } : { kind: 'respond' };
    case 'COUNTER_PROPOSED': {
      const options = plan.counterOptions.filter((o) => o.proposerId !== myId);
      return options.length > 0 ? { kind: 'choose', options } : { kind: 'waiting' };
    }
    case 'CONFIRMED':
      return { kind: 'confirmed' };
    default:
      return { kind: 'closed' };
  }
}

async function unwrapEmpty(p: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await p;
  if (!response.ok) throw new ApiRequestError(response.status, (error as S['ApiError']) ?? null);
}

/** Болзоо өөрчлөгдсөний дараа: жагсаалт, дэлгэрэнгүй, нүүрний «Дараагийн болзоо». */
export function invalidatePlans(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: PLANS_KEY }),
    client.invalidateQueries({ queryKey: ['plan'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ]).then(() => undefined);
}
