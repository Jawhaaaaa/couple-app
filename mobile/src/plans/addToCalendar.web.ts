import type { DatePlan } from '@/api/queries/plans';

import { shareIcs } from './icsFile';

export type AddToCalendarOutcome = 'added' | 'shared' | 'downloaded';

/** Вэб (FR-19.8, AC-158): календарийн API алга — `.ics` файл татна. */
export function addToCalendar(plan: DatePlan): Promise<AddToCalendarOutcome> {
  return shareIcs(plan);
}
