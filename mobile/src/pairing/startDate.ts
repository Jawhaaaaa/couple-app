import { type CalendarDate, isCalendarDate, parseCalendarDate } from '@/i18n/calendarDate';

export type StartDateIssue = 'incomplete' | 'invalid' | 'future';

/** Эхэлсэн өдрийн шалгалт (FR-2.3): бүтэн, бодит огноо, ирээдүй биш (сервер ч 400). */
export function startDateIssue(date: CalendarDate | null, today: CalendarDate): StartDateIssue | null {
  if (!date) return 'incomplete';
  if (!isCalendarDate(date) || parseCalendarDate(date).year < 1900) return 'invalid';
  if (date > today) return 'future';
  return null;
}

export type StartDateView =
  | { kind: 'confirmed'; date: CalendarDate }
  | { kind: 'mismatch'; mine: CalendarDate; partner: CalendarDate }
  | { kind: 'waitingPartner'; mine: CalendarDate }
  | { kind: 'partnerProposed'; partner: CalendarDate }
  | { kind: 'none' };

/** `Couple`-ийн эхэлсэн өдрийн талбаруудаас S-11-ийн харагдац (AC-65). */
export function startDateView(couple: {
  startDate?: string | null;
  startDateStatus: 'CONFIRMED' | 'PENDING' | 'MISMATCH';
  myProposal?: string | null;
  partnerProposal?: string | null;
}): StartDateView {
  const mine = couple.myProposal ?? null;
  const partner = couple.partnerProposal ?? null;
  if (couple.startDateStatus === 'CONFIRMED' && couple.startDate) return { kind: 'confirmed', date: couple.startDate };
  if (mine && partner && mine !== partner) return { kind: 'mismatch', mine, partner };
  if (mine && !partner) return { kind: 'waitingPartner', mine };
  if (partner && !mine) return { kind: 'partnerProposed', partner };
  if (mine && partner) return { kind: 'confirmed', date: mine };
  return { kind: 'none' };
}
