import { randomUUID } from 'node:crypto';

import { apiAs, apiJson, createVerifiedUser, type TestUser } from './users';

/**
 * Хостой хэрэглэгчдийг UI-гүй бэлтгэнэ (FR-2): A урилга → B нэгдэх → A батлах. UI-ийн
 * холболтын урсгалыг `pairing.spec.ts` шалгадаг.
 */
export async function linkViaApi(a: TestUser, b: TestUser) {
  const invite = await apiJson<{ code: string }>(a, 'POST', '/invites');
  const pairing = await apiJson<{ id: string }>(b, 'POST', '/pairings', { code: invite.code });
  await apiJson(a, 'POST', `/pairings/${pairing.id}/confirm`);
}

export async function linkedCouple(nameA: string, nameB: string, prefix: string): Promise<[TestUser, TestUser]> {
  const a = await createVerifiedUser(nameA, `${prefix}a`);
  const b = await createVerifiedUser(nameB, `${prefix}b`);
  await linkViaApi(a, b);
  return [a, b];
}

/** Хоёулаа ижил өдөр санал болгоход эхэлсэн өдөр батлагдана (AC-65). */
export async function confirmStartDate(a: TestUser, b: TestUser, date: string) {
  await apiJson(a, 'PUT', '/couple/start-date', { date });
  await apiJson(b, 'PUT', '/couple/start-date', { date });
}

/**
 * `PATCH /me` — гэрээний `Me`-д `version` байхгүй тул 0-ээс оролдоод `VERSION_CONFLICT`-ийн
 * `details.currentVersion`-оор нэг удаа давтана (mobile `patchMe`-тэй ижил).
 */
export async function patchMe(user: TestUser, patch: Record<string, unknown>) {
  const first = await apiAs(user, 'PATCH', '/me', { ...patch, version: 0 });
  if (first.ok) return;
  const body = (await first.json()) as { code?: string; details?: { currentVersion?: number } };
  if (first.status !== 409 || body.code !== 'VERSION_CONFLICT') throw new Error(`PATCH /me → ${first.status}: ${JSON.stringify(body)}`);
  await apiJson(user, 'PATCH', '/me', { ...patch, version: body.details?.currentVersion ?? 0 });
}

/** Дохио API-аар (UI-гүй) — `clientId` бүр шинэ. */
export function sendSignalApi(user: TestUser, kind: 'HEART' | 'HUG' | 'THINKING', text?: string) {
  return apiAs(user, 'POST', '/signals', { kind, clientId: randomUUID(), ...(text ? { text } : {}) });
}
