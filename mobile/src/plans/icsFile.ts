import type { DatePlan } from '@/api/queries/plans';
import { planIcsPath } from '@/api/queries/plans';
import { API_BASE } from '@/config';
import { saveFile, type SaveOutcome } from '@/media/saveFile';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * `GET /plans/{id}/ics` (AC-101, AC-158): native-д кэш рүү татаж хуваалцах цонхоор,
 * вэбэд файл болгон татна. Давталттай болзооны тухайн тохиолдлын файл.
 */
export function shareIcs(plan: Pick<DatePlan, 'id' | 'title' | 'occurrenceOn'>): Promise<SaveOutcome> {
  const token = useSessionStore.getState().accessToken;
  return saveFile({
    url: `${API_BASE}${planIcsPath(plan.id, plan.occurrenceOn)}`,
    fileName: `${plan.title || 'aura-date'}.ics`,
    mime: 'text/calendar',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
