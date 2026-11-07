import { API_BASE } from './env';

/** Scenario seed (`POST /test/seed`, `e2e` profile). Биеийн хэлбэр нь гэрээний `SeedRequest`. */
export async function seed<T = unknown>(request: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`POST /test/seed → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Хугацаат ажлыг шууд ажиллуулна (`POST /test/jobs/{jobName}/run`). */
export async function runJob(jobName: string) {
  const res = await fetch(`${API_BASE}/test/jobs/${encodeURIComponent(jobName)}/run`, { method: 'POST' });
  if (!res.ok) throw new Error(`job ${jobName} → ${res.status}`);
  return res.json();
}

/** Давтагдашгүй тестийн имэйл. */
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@aura.test`;
}
