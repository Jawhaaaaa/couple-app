import type { CityRef, Me } from '@/api/queries/auth';
import type { ProfilePatch } from '@/api/queries/profile';
import { birthDateIssue, type BirthDateIssue } from '@/auth/birthDate';
import type { Locale } from '@/stores/prefsStore';

/** S-81-ийн засварлаж буй утгууд. */
export interface ProfileDraft {
  displayName: string;
  callName: string;
  /** `YYYY-MM-DD` эсвэл бүтэн биш бол `null`. */
  birthDate: string | null;
  timezone: string;
  locale: Locale;
  city: CityRef | null;
  onlineVisible: boolean;
  typingVisible: boolean;
}

export function draftFromMe(me: Me): ProfileDraft {
  return {
    displayName: me.displayName,
    callName: me.callName ?? '',
    birthDate: me.birthDate,
    timezone: me.timezone,
    locale: me.locale,
    city: me.city ?? null,
    onlineVisible: me.onlineVisible,
    typingVisible: me.typingVisible,
  };
}

/** IANA цагийн бүс мөн эсэх (`Intl` таньдаг). */
export function isValidTimeZone(zone: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$|^UTC$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    // RangeError — `Intl` энэ бүсийг танихгүй
    return false;
  }
}

export interface DraftIssues {
  displayName: 'required' | null;
  birthDate: BirthDateIssue | null;
  timezone: 'invalid' | null;
}

export function draftIssues(draft: ProfileDraft, today: string): DraftIssues {
  return {
    displayName: draft.displayName.trim() ? null : 'required',
    birthDate: birthDateIssue(draft.birthDate, today),
    timezone: isValidTimeZone(draft.timezone.trim()) ? null : 'invalid',
  };
}

const sameCity = (a: CityRef | null, b: CityRef | null) =>
  a === b || (!!a && !!b && a.name === b.name && a.countryCode === b.countryCode && a.lat === b.lat && a.lon === b.lon);

/** Зөвхөн өөрчлөгдсөн талбарууд (`PATCH /me`); өөрчлөлтгүй бол хоосон объект. */
export function profilePatch(initial: ProfileDraft, draft: ProfileDraft): ProfilePatch {
  const patch: ProfilePatch = {};
  const displayName = draft.displayName.trim();
  if (displayName !== initial.displayName) patch.displayName = displayName;
  const callName = draft.callName.trim();
  if (callName !== initial.callName.trim()) patch.callName = callName || null;
  if (draft.birthDate && draft.birthDate !== initial.birthDate) patch.birthDate = draft.birthDate;
  const timezone = draft.timezone.trim();
  if (timezone !== initial.timezone) patch.timezone = timezone;
  if (draft.locale !== initial.locale) patch.locale = draft.locale;
  if (!sameCity(initial.city, draft.city)) patch.city = draft.city;
  if (draft.onlineVisible !== initial.onlineVisible) patch.onlineVisible = draft.onlineVisible;
  if (draft.typingVisible !== initial.typingVisible) patch.typingVisible = draft.typingVisible;
  return patch;
}
