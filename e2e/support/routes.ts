import { randomUUID } from 'node:crypto';

import type { ConsoleMessage, Page } from '@playwright/test';

import { setServerClock, resetServerClock } from './clock';
import { confirmStartDate, linkedCouple } from './couple';
import { createMemoryApi, makeJpeg, type Memory } from './memories';
import { runJob } from './seed';
import { apiJson, createVerifiedUser, type TestUser } from './users';

/**
 * AC-143: S-ID → route-ын жагсаалт (LLD §4.3). `who` — ямар хэрэглэгчээр нээх:
 * `anon` нэвтрээгүй, `solo` хосгүй, `couple` хостой. `path` нь seed-ийн ID-аас үүснэ.
 */
export type Who = 'anon' | 'solo' | 'couple';

export interface SmokeIds {
  memory: Memory;
  groupId: string;
  planId: string;
  goalId: string;
  letterId: string;
  capsuleId: string;
  recapId: string;
  userA: TestUser;
}

export interface SmokeRoute {
  sid: string;
  who: Who;
  path: (ids: SmokeIds) => string;
  /** Нээгдэх ёстой testID (анхдагч `screen-<sid>`). */
  testId?: string;
}

const r = (sid: string, who: Who, path: string | ((ids: SmokeIds) => string), testId?: string): SmokeRoute => ({
  sid,
  who,
  path: typeof path === 'string' ? () => path : path,
  testId,
});

export const ROUTES: SmokeRoute[] = [
  // Эхлэл, акаунт
  r('S-02', 'anon', '/intro'),
  r('S-03', 'anon', '/login'),
  r('S-04', 'anon', '/register'),
  r('S-05', 'anon', '/verify-email?email=smoke%40aura.test'),
  r('S-06', 'anon', '/forgot-password'),
  r('S-06', 'anon', '/reset-password?token=smoke-token', 'screen-S-06-reset'),
  r('S-97', 'anon', '/update-required'),
  r('S-100', 'anon', '/install'),
  r('S-07', 'solo', '/profile'),
  r('S-08', 'solo', '/invite-create'),
  r('S-09', 'solo', '/invite-enter'),
  r('S-13', 'solo', '/waiting'),
  r('S-11', 'couple', '/start-date'),
  r('S-12', 'couple', '/linked?celebrated=1'),
  // Нүүр
  r('S-20', 'couple', '/home'),
  r('S-21', 'couple', '/home/counter'),
  r('S-22', 'couple', '/home/question'),
  r('S-23', 'couple', '/home/on-this-day'),
  r('S-24', 'couple', '/notifications'),
  r('S-26', 'couple', '/home/thinking'),
  // Дурсамж
  r('S-30', 'couple', '/memories'),
  r('S-30', 'couple', '/memories?view=map'),
  r('S-30', 'couple', '/memories?view=recap'),
  r('S-31', 'couple', (i) => `/memories/${i.memory.id}`),
  r('S-32', 'couple', '/memory-editor'),
  r('S-33', 'couple', (i) => `/media/${i.memory.id}`),
  r('S-34', 'couple', '/memories/search'),
  r('S-35', 'couple', '/memories/groups'),
  r('S-35', 'couple', (i) => `/memories/groups/${i.groupId}`, 'screen-S-35-detail'),
  r('S-36', 'couple', '/memories/favorites'),
  r('S-37', 'couple', '/memories/trash'),
  r('S-38', 'couple', (i) => `/recap/${i.recapId}`),
  r('S-39', 'couple', '/memories/export'),
  // Чат
  r('S-40', 'couple', '/chat'),
  r('S-42', 'couple', '/chat/pins'),
  r('S-43', 'couple', '/chat/search'),
  r('S-44', 'couple', '/chat/media'),
  r('S-46', 'couple', '/chat/disappearing'),
  r('S-47', 'couple', '/chat/promise'),
  // Төлөвлөгөө
  r('S-50', 'couple', '/plans'),
  r('S-51', 'couple', '/plans/ideas'),
  r('S-52', 'couple', '/plans/calendar'),
  r('S-53', 'couple', '/plans/idea-editor'),
  r('S-54', 'couple', '/plans/new', 'screen-S-54-form'),
  r('S-54', 'couple', (i) => `/plans/${i.planId}`),
  r('S-55', 'couple', (i) => `/plans/${i.planId}/counter`),
  r('S-56', 'couple', '/plans/random'),
  r('S-57', 'couple', '/plans/deck'),
  r('S-58', 'couple', '/plans/library'),
  r('S-59', 'couple', '/plans/budget'),
  // Хамтдаа
  r('S-60', 'couple', '/together'),
  r('S-61', 'couple', '/together/occasions'),
  r('S-61', 'couple', (i) => `/together/occasions/${encodeURIComponent(`birthday:${i.userA.id}`)}`, 'screen-S-61-detail'),
  r('S-62', 'couple', '/together/occasions/edit'),
  r('S-63', 'couple', '/together/lists'),
  r('S-64', 'couple', '/together/goals'),
  r('S-64', 'couple', '/together/goals/new', 'screen-S-64-new'),
  r('S-64', 'couple', (i) => `/together/goals/${i.goalId}`, 'screen-S-64-detail'),
  r('S-65', 'couple', '/together/letters'),
  r('S-66', 'couple', '/together/letters/compose'),
  r('S-67', 'couple', (i) => `/together/letters/${i.letterId}`),
  r('S-68', 'couple', '/together/capsules/new', 'screen-S-68-new'),
  r('S-68', 'couple', (i) => `/together/capsules/${i.capsuleId}`),
  r('S-69', 'couple', '/together/checkin'),
  r('S-70', 'couple', '/together/map'),
  r('S-71', 'couple', '/together/stats'),
  r('S-72', 'couple', '/year/2026'),
  // Тохиргоо
  r('S-80', 'couple', '/settings'),
  r('S-81', 'couple', '/settings/profile'),
  r('S-82', 'couple', '/settings/couple'),
  r('S-83', 'couple', '/settings/notifications'),
  r('S-84', 'couple', '/settings/security'),
  r('S-85', 'couple', '/settings/data'),
  r('S-86', 'couple', '/settings/breakup'),
  r('S-87', 'couple', '/settings/delete-account'),
  r('S-88', 'couple', '/settings/appearance'),
  r('S-89', 'couple', '/settings/licenses'),
  r('S-90', 'couple', '/settings/policies'),
  r('S-91', 'couple', '/settings/about'),
  r('S-98', 'couple', '/storage-full'),
  r('S-101', 'couple', '/push-permission'),
  r('S-102', 'couple', '/settings/passkey'),
];

/**
 * Route-гүй S-ID (LLD §4.3): S-01 splash (`_layout`), S-14 түгжээ (`AppLockProvider` — `lock.spec`-д),
 * S-25 баярын бүтэн дэлгэц (ойн өдөр — `animations.spec`), S-41 мессежийн цэс ба S-45 дуу бичих
 * overlay (S-40 дотор — `chat-actions.spec`, `chat-voice.spec`), S-95/S-96 системийн зурвас,
 * S-99 апп-аас гадуурх татах хуудас (`download-page.spec`), S-10 урилгын код шаардана (`pairing.spec`).
 */
export const NON_ROUTE_SIDS = ['S-01', 'S-10', 'S-14', 'S-25', 'S-41', 'S-45', 'S-95', 'S-96', 'S-99'];

/** Хөтчийн console error ба барьж аваагүй алдааг цуглуулна (AC-143: 0). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/**
 * Smoke-ийн хос: эхэлсэн өдөр 2025-11-07, 2026 онд 5 дурсамж (жилийн хураангуй үүснэ — AC-84),
 * бүлэг, болзоо, зорилго, хүргэгдсэн захидал, capsule.
 */
export async function seedSmokeCouple(page: Page): Promise<{ a: TestUser; b: TestUser; solo: TestUser; ids: SmokeIds }> {
  const [a, b] = await linkedCouple('Бат', 'Ану', 'smoke');
  const solo = await createVerifiedUser('Ганц', 'smokesolo');
  await confirmStartDate(a, b, '2025-11-07');
  const image = await makeJpeg(page);
  const memories: Memory[] = [];
  for (const [i, day] of ['2026-01-14', '2026-03-08', '2026-05-20', '2026-07-11', '2026-09-30'].entries()) {
    memories.push(await createMemoryApi(i % 2 ? b : a, image, { title: `Smoke дурсамж ${i + 1}`, occurredOn: day }));
  }
  const group = await apiJson<{ id: string }>(a, 'POST', '/memory-groups', { name: 'Анхны аялал' });
  const plan = await apiJson<{ id: string }>(a, 'POST', '/plans', {
    clientId: randomUUID(),
    title: 'Тэрэлж рүү',
    startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    timezone: 'Asia/Ulaanbaatar',
    reminderOffsets: [60],
    recurrence: 'NONE',
    checklist: [],
  });
  const goal = await apiJson<{ id: string }>(a, 'POST', '/goals', { title: 'Аялалын сан', steps: ['Төлөвлөх', 'Хуримтлуулах'] });
  const letter = await apiJson<{ id: string }>(b, 'POST', '/letters', { template: 'PAPER_1', body: 'Сайн уу, хайрт минь', mediaIds: [], draft: false });
  const capsule = await apiJson<{ id: string }>(a, 'POST', '/capsules', { title: 'Ирээдүйн бид', openOn: '2030-11-07' });
  // Ойн өдөр (2026-11-07) хураангуйн ажлыг ажиллуулна
  await setServerClock('2026-11-07T12:00:00+08:00');
  try {
    await runJob('memoryRecap');
  } finally {
    await resetServerClock();
  }
  const recaps = await apiJson<{ items?: { id: string }[] } | { id: string }[]>(a, 'GET', '/recaps');
  const list = Array.isArray(recaps) ? recaps : (recaps.items ?? []);
  if (!list.length) throw new Error('memoryRecap: хураангуй үүссэнгүй');
  return {
    a,
    b,
    solo,
    ids: {
      memory: memories[0],
      groupId: group.id,
      planId: plan.id,
      goalId: goal.id,
      letterId: letter.id,
      capsuleId: capsule.id,
      recapId: list[0].id,
      userA: a,
    },
  };
}
