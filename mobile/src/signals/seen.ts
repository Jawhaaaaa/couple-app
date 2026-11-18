import { api, unwrap } from '@/api/client';

/** Хүлээн авсан дохиог үзсэн болгоно (`POST /signals/seen`, AC-18) — 204. */
export function markSignalsSeen(): Promise<unknown> {
  return unwrap(api.POST('/signals/seen'));
}
