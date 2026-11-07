import type { Page } from '@playwright/test';

import { API_BASE } from './env';

/**
 * Серверийн ба хөтчийн цагийг нэг утгад тавина (DD-AURA-011, TQ-02): backend
 * `PUT /test/clock` (зөвхөн `e2e` profile), хөтөч `page.clock`.
 */
export async function setServerClock(instant: Date | string) {
  const res = await fetch(`${API_BASE}/test/clock`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ now: new Date(instant).toISOString() }),
  });
  if (res.status !== 204) throw new Error(`PUT /test/clock → ${res.status}`);
}

export async function resetServerClock() {
  await fetch(`${API_BASE}/test/clock`, { method: 'DELETE' });
}

export async function setClock(pages: Page[], instant: Date | string) {
  await setServerClock(instant);
  for (const page of pages) await page.clock.setFixedTime(new Date(instant));
}
