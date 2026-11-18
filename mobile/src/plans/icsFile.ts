import { Platform } from 'react-native';

import type { DatePlan } from '@/api/queries/plans';
import { planIcsPath } from '@/api/queries/plans';
import { API_BASE } from '@/config';
import { saveFile, type SaveFileInput, type SaveOutcome } from '@/media/saveFile';
import { downloadIcs } from '@/pwa/webFallbacks';
import { useSessionStore } from '@/stores/sessionStore';

/** `.ics` татах хүсэлт — native ба вэб ижил файл (давталттай болзооны тухайн тохиолдол). */
export function icsRequest(plan: Pick<DatePlan, 'id' | 'title' | 'occurrenceOn'>): SaveFileInput {
  const token = useSessionStore.getState().accessToken;
  return {
    url: `${API_BASE}${planIcsPath(plan.id, plan.occurrenceOn)}`,
    fileName: `${plan.title || 'aura-date'}.ics`,
    mime: 'text/calendar',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

/**
 * `GET /plans/{id}/ics` (AC-101, AC-158): native-д кэш рүү татаж хуваалцах цонхоор,
 * вэбэд файл болгон татна (`downloadIcs`, FR-19.8).
 */
export function shareIcs(plan: Pick<DatePlan, 'id' | 'title' | 'occurrenceOn'>): Promise<SaveOutcome> {
  const request = icsRequest(plan);
  return Platform.OS === 'web' ? downloadIcs(request) : saveFile(request);
}
