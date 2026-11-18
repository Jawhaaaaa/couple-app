import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { apiJson, signInUi, type TestUser, ZONE } from './users';

/**
 * Төлөвлөгөөний E2E бэлтгэл (T-54, T-55): болзоо ба санааг API-аар (UI-гүй), календарийн
 * сарыг UI-аар шилжүүлэх. AC-ийн алхмыг тест өөрөө UI-аар хийнэ.
 */
export interface PlanPlace {
  name: string;
  lat: number;
  lon: number;
  city?: string;
  countryCode?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  position: number;
  done: boolean;
  doneBy?: string | null;
}

export interface DatePlan {
  id: string;
  title: string;
  startsAt: string;
  status: string;
  memoryId?: string | null;
  checklist: ChecklistItem[];
  counterOptions: { id: string; startsAt: string; proposerId: string }[];
}

export interface NewPlan {
  title: string;
  /** ISO, офсеттэй (`2026-11-20T19:00:00+08:00`). */
  startsAt: string;
  place?: PlanPlace;
  description?: string;
  checklist?: string[];
}

/** `POST /plans` — санал болгогч нь `user` (хамтрагчид PENDING). */
export function createPlanApi(user: TestUser, input: NewPlan): Promise<DatePlan> {
  return apiJson<DatePlan>(user, 'POST', '/plans', {
    clientId: randomUUID(),
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    startsAt: input.startsAt,
    timezone: ZONE,
    ...(input.place ? { place: input.place } : {}),
    reminderOffsets: [],
    recurrence: 'NONE',
    checklist: (input.checklist ?? []).map((text) => ({ text })),
  });
}

export function respondPlanApi(user: TestUser, planId: string, action: 'ACCEPT' | 'DECLINE') {
  return apiJson<DatePlan>(user, 'POST', `/plans/${planId}/respond`, { action });
}

export function getPlanApi(user: TestUser, planId: string) {
  return apiJson<DatePlan>(user, 'GET', `/plans/${planId}`);
}

export interface DateIdea {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  budgetMnt?: number | null;
  place?: PlanPlace | null;
  url?: string | null;
  setting?: string | null;
}

export function createIdeaApi(user: TestUser, title: string, category = 'HOME'): Promise<DateIdea> {
  return apiJson<DateIdea>(user, 'POST', '/ideas', { clientId: randomUUID(), title, category });
}

export function listIdeasApi(user: TestUser): Promise<DateIdea[]> {
  return apiJson<DateIdea[]>(user, 'GET', '/ideas');
}

/** Давтагдашгүй богино дагавар (хэрэглэгч бүр шинэ ч гарчгаар хайхад тодорхой байлгах). */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;
}

/** `YYYY-MM-DD` + `HH:MM` (Улаанбаатар) → ISO офсеттэй. */
export function ubDateTime(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}

/** Нэвтэрч S-50 нээнэ; STOMP холбогдох хүртэл хүлээнэ (realtime шинэчлэлтийг хүлээх тестэд). */
export async function openPlans(page: Page, user: TestUser, path = '/plans', screen = 'screen-S-50') {
  await signInUi(page, user);
  await page.goto(path);
  await expect(page.getByTestId(screen)).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/**
 * S-52 календарийг `date`-ийн сар руу UI-аар (‹ › товч) шилжүүлнэ — сарын гарчиг
 * «2026 оны 11-р сар».
 */
export async function calendarGoToMonth(page: Page, date: string) {
  const [year, month] = date.split('-').map(Number);
  const want = `${year} оны ${month}-р сар`;
  const title = page.getByTestId('calendar-title');
  for (let i = 0; i < 24; i += 1) {
    const text = (await title.textContent()) ?? '';
    if (text === want) return;
    const m = /^(\d{4}) оны (\d{1,2})-р сар$/.exec(text);
    if (!m) throw new Error(`calendar-title танигдсангүй: «${text}»`);
    const current = Number(m[1]) * 12 + Number(m[2]);
    await page.getByTestId(current < year * 12 + month ? 'calendar-next' : 'calendar-prev').click();
    await expect(title).not.toHaveText(text);
  }
  await expect(title).toHaveText(want);
}
