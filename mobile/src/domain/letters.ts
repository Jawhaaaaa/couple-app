import type { components } from '@/api/schema';
import { type CalendarDate, compareCalendarDates, diffDays, isCalendarDate } from '@/i18n/calendarDate';

import { isValidTime, zonedToUtc } from './planTime';

type S = components['schemas'];
type LetterListItem = S['LetterListItem'];
type LetterStatus = S['LetterStatus'];
type LetterTemplate = S['LetterTemplate'];
type Capsule = S['Capsule'];

/** Захидал ба капсулын зургийн дээд хязгаар (FR-10.3, AC-111) — 6 дахь нь татгалзана. */
export const LETTER_MEDIA_MAX = 5;
export const LETTER_BODY_MAX = 20000;
export const OCCASION_LABEL_MAX = 80;
export const CAPSULE_TITLE_MAX = 80;
export const LETTER_TEMPLATES: LetterTemplate[] = ['PAPER_1', 'PAPER_2', 'PAPER_3'];

/** S-65 хайрцаг: ирэх (битүүмжлэгдсэн), ирсэн, илгээсэн, капсул. */
export type LetterBox = 'upcoming' | 'inbox' | 'sent' | 'capsules';
export const LETTER_BOXES: LetterBox[] = ['upcoming', 'inbox', 'sent', 'capsules'];

export function isLetterBox(value: unknown): value is LetterBox {
  return typeof value === 'string' && (LETTER_BOXES as string[]).includes(value);
}

/** Шинэ зураг сонгоход хэд нь орох вэ (AC-111): байгаа + шинэ ≤ 5, илүү нь татгалзана. */
export function admitLetterPhotos<T>(existing: number, picked: readonly T[]): { accepted: T[]; rejected: number } {
  const room = Math.max(0, LETTER_MEDIA_MAX - existing);
  return { accepted: picked.slice(0, room), rejected: Math.max(0, picked.length - room) };
}

/** Жагсаалтын огноо: хүргэгдсэн → товлосон → үүсгэсэн. */
export function letterDate(l: Pick<LetterListItem, 'deliveredAt' | 'deliverAt'> & { createdAt?: string | null }): string {
  return l.deliveredAt ?? l.deliverAt ?? l.createdAt ?? '';
}

/** «Надад ирсэн / Миний илгээсэн» (AC-113): огноогоор, шинэ нь эхэнд; хайрцагт хамааралгүйг шүүнэ. */
export function filterLetters(items: readonly LetterListItem[], box: 'inbox' | 'sent', myId: string | null): LetterListItem[] {
  return items
    .filter((l) => (box === 'inbox' ? l.recipient.id === myId && (l.status === 'DELIVERED' || l.status === 'READ') : l.author.id === myId))
    .filter((l) => l.status !== 'CANCELLED')
    .sort((a, b) => letterDate(b).localeCompare(letterDate(a)));
}

/** Илгээгчид харагдах төлөв (AC-182): ноорог · хүлээгдэж буй → хүргэгдсэн → уншсан. */
export function sentStatusKey(status: LetterStatus): 'draft' | 'pending' | 'delivered' | 'read' | 'cancelled' {
  switch (status) {
    case 'DRAFT':
      return 'draft';
    case 'SCHEDULED':
      return 'pending';
    case 'DELIVERED':
      return 'delivered';
    case 'READ':
      return 'read';
    default:
      return 'cancelled';
  }
}

/** Хүргэгдэхээс өмнө зөвхөн зохиогч засна/цуцална (AC-112). */
export function canEditLetter(l: { author: { id: string }; status: LetterStatus }, myId: string | null): boolean {
  return l.author.id === myId && (l.status === 'DRAFT' || l.status === 'SCHEDULED');
}

export interface LetterForm {
  template: LetterTemplate;
  body: string;
  /** Шууд илгээх эсвэл товлох. */
  mode: 'now' | 'scheduled';
  date: string;
  time: string;
  occasionLabel: string;
}

export type LetterFormError = 'bodyRequired' | 'dateInvalid' | 'timeInvalid' | 'inPast';

/**
 * Товлосон хүргэлтийн UTC (хэрэглэгчийн бүсийн огноо + цаг, INV-08); шууд бол `null`. Ноорогт
 * огноо шаардахгүй; илгээхэд бичвэр хоосон, огноо буруу, өнгөрсөн цаг бол алдаа.
 */
export function letterDeliverAt(
  form: LetterForm,
  timeZone: string,
  now: number,
  { draft }: { draft: boolean },
): { deliverAt: string | null; error: LetterFormError | null } {
  if (!draft && !form.body.trim()) return { deliverAt: null, error: 'bodyRequired' };
  if (form.mode === 'now') return { deliverAt: null, error: null };
  const date = form.date.trim();
  const time = form.time.trim();
  if (!isCalendarDate(date)) return { deliverAt: null, error: draft && !date ? null : 'dateInvalid' };
  if (!isValidTime(time)) return { deliverAt: null, error: 'timeInvalid' };
  const deliverAt = zonedToUtc(date, time, timeZone);
  if (!draft && Date.parse(deliverAt) <= now) return { deliverAt, error: 'inPast' };
  return { deliverAt, error: null };
}

export interface CapsuleView {
  mine: Capsule['parts'][number] | null;
  partner: Capsule['parts'][number] | null;
  /** Нээгдэх хүртэлх өдөр (хосын бүсийн өнөөдрөөс); өнгөрсөн бол 0. */
  daysLeft: number;
  opened: boolean;
  /** Өөрийн хэсгийг бичиж/засаж болох уу (миний хэсэг битүүмжлэгдээгүй, капсул `WRITING`). */
  canWrite: boolean;
}

/**
 * Капсулын төлөв (FR-10.5, GAP-15, AC-45): үүсгэгч хамтрагчаа урина, тус бүр өөрийн хэсгээ
 * битүүмжилнэ, хоёулаа битүүмжилсний дараа түгжинэ; нээх огноо хүртэл агуулга 0.
 */
export function capsuleView(c: Pick<Capsule, 'parts' | 'status' | 'openOn'>, myId: string | null, today: CalendarDate): CapsuleView {
  const mine = c.parts.find((p) => p.author.id === myId) ?? null;
  const partner = c.parts.find((p) => p.author.id !== myId) ?? null;
  const daysLeft = compareCalendarDates(c.openOn, today) > 0 ? diffDays(today, c.openOn) : 0;
  return { mine, partner, daysLeft, opened: c.status === 'OPENED', canWrite: c.status === 'WRITING' && !mine?.sealed };
}
