import type { Memory, MemoryCreate, MemoryUpdate, Place } from '@/api/queries/memories';
import { mediaUrl } from '@/api/queries/memories';
import { isCalendarDate } from '@/i18n/calendarDate';
import type { DraftMedia, MemoryDraft } from '@/stores/draftStore';

import type { ExifSuggestion } from './exif';
import { MEDIA_MAX } from './limits';

/** Гэрээний хязгаар (`MemoryCreate`). */
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
export const ALT_MAX = 300;
export const TAG_MAX = 40;
export const TAGS_MAX = 20;
export const PLACE_MAX = 200;
export const GROUP_NAME_MAX = 60;

export type DraftError = 'TITLE' | 'DATE' | 'MEDIA' | 'LOCATION';

/** `?draft=` (чат, болзооноос, AC-91, AC-95): `{title, occurredOn, place, description, datePlanId}`. */
export interface DraftPrefill {
  title?: string;
  occurredOn?: string;
  description?: string;
  place?: Place | string | null;
  datePlanId?: string;
  /** Серверт аль хэдийн байгаа медиа (чатаас «Дурсамж болгох», AC-91). */
  media?: { id: string; kind: 'image' | 'video'; previewUri: string | null }[];
}

export function parseDraftParam(raw: string | string[] | undefined): DraftPrefill | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const place = p.place;
    return {
      title: str(p.title),
      occurredOn: str(p.occurredOn),
      description: str(p.description),
      place: typeof place === 'string' || (place && typeof place === 'object') ? (place as Place | string) : null,
      datePlanId: str(p.datePlanId),
      media: Array.isArray(p.media)
        ? (p.media as unknown[])
            .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string')
            .map((m) => ({
              id: m.id as string,
              kind: m.kind === 'video' ? ('video' as const) : ('image' as const),
              previewUri: typeof m.previewUri === 'string' ? m.previewUri : null,
            }))
        : undefined,
    };
  } catch {
    // Эвдэрсэн параметр — хоосон ноорогоос эхэлнэ (хэрэглэгчийн өгөгдөл алдагдахгүй)
    return null;
  }
}

export function applyPrefill(draft: MemoryDraft, prefill: DraftPrefill | null): MemoryDraft {
  if (!prefill) return draft;
  const next = { ...draft };
  if (prefill.title) next.title = prefill.title.slice(0, TITLE_MAX);
  if (prefill.description) next.description = prefill.description.slice(0, DESCRIPTION_MAX);
  if (prefill.occurredOn && isCalendarDate(prefill.occurredOn)) {
    next.occurredOn = prefill.occurredOn;
    next.dateSource = 'MANUAL';
    next.dateTouched = true;
  }
  if (typeof prefill.place === 'string' && prefill.place.trim()) {
    next.placeName = prefill.place.trim().slice(0, PLACE_MAX);
  } else if (prefill.place && typeof prefill.place === 'object') {
    next.placeName = prefill.place.name;
    next.lat = String(prefill.place.lat);
    next.lon = String(prefill.place.lon);
    next.locationSource = 'MANUAL';
    next.locationTouched = true;
  }
  if (prefill.datePlanId) next.datePlanId = prefill.datePlanId;
  if (prefill.media?.length) {
    next.media = prefill.media.map((m, i) => ({
      key: m.id,
      localId: null,
      mediaId: m.id,
      previewUri: m.previewUri,
      kind: m.kind,
      name: `chat-${i + 1}`,
      altText: '',
    }));
  }
  return next;
}

/** Координатыг нэрийн анхдагч болгон харуулах «47.918500, 106.917600». */
export function coordinateLabel(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/**
 * EXIF-ийн санал (FR-5.2, AC-79): хэрэглэгч гараар өөрчлөөгүй талбарыг л бөглөнө — огноо
 * `dateSource=EXIF`, байршил `locationSource=EXIF` («Зурагнаас авсан» тэмдэг). Нэрийг
 * координатаар эхлүүлж засуулна (урвуу geocoding байхгүй).
 */
export function applyExif(draft: MemoryDraft, suggestion: ExifSuggestion): MemoryDraft {
  const next = { ...draft };
  if (suggestion.occurredOn && !draft.dateTouched && draft.dateSource !== 'EXIF') {
    next.occurredOn = suggestion.occurredOn;
    next.dateSource = 'EXIF';
  }
  const hasLocation = draft.lat.trim() !== '' || draft.lon.trim() !== '';
  if (suggestion.location && !draft.locationTouched && !hasLocation) {
    next.lat = String(suggestion.location.lat);
    next.lon = String(suggestion.location.lon);
    next.placeName = draft.placeName.trim() || coordinateLabel(suggestion.location.lat, suggestion.location.lon);
    next.locationSource = 'EXIF';
  }
  return next;
}

/** Байршил: нэр + координат бүрэн бол `Place`, бүгд хоосон бол `null`, дутуу бол `'INVALID'`. */
export function draftPlace(draft: MemoryDraft): Place | null | 'INVALID' {
  const name = draft.placeName.trim();
  const latRaw = draft.lat.trim().replace(',', '.');
  const lonRaw = draft.lon.trim().replace(',', '.');
  if (!name && !latRaw && !lonRaw) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!latRaw || !lonRaw || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'INVALID';
  return { name: (name || coordinateLabel(lat, lon)).slice(0, PLACE_MAX), lat, lon };
}

export function validateDraft(draft: MemoryDraft): DraftError[] {
  const errors: DraftError[] = [];
  if (!draft.title.trim()) errors.push('TITLE');
  if (!isCalendarDate(draft.occurredOn)) errors.push('DATE');
  if (draft.media.length === 0 || draft.media.length > MEDIA_MAX) errors.push('MEDIA');
  if (draftPlace(draft) === 'INVALID') errors.push('LOCATION');
  return errors;
}

function mediaInputs(media: DraftMedia[], ids: string[]) {
  return ids.map((mediaId, i) => {
    const alt = media[i]?.altText.trim().slice(0, ALT_MAX);
    return alt ? { mediaId, altText: alt } : { mediaId };
  });
}

/** `POST /memories` (`clientId` нь нооргийнх — давтан илгээлт давхар үүсгэхгүй). */
export function buildCreateBody(draft: MemoryDraft, mediaIds: string[]): MemoryCreate {
  const place = draftPlace(draft);
  const location = place && place !== 'INVALID' ? place : null;
  const description = draft.description.trim();
  return {
    clientId: draft.clientId,
    title: draft.title.trim().slice(0, TITLE_MAX),
    ...(description ? { description: description.slice(0, DESCRIPTION_MAX) } : {}),
    occurredOn: draft.occurredOn,
    dateSource: draft.dateSource,
    ...(location ? { location } : {}),
    locationSource: location ? (draft.locationSource === 'NONE' ? 'MANUAL' : draft.locationSource) : 'NONE',
    tags: draft.tags,
    groupIds: draft.groupIds,
    media: mediaInputs(draft.media, mediaIds),
    ...(draft.datePlanId ? { datePlanId: draft.datePlanId } : {}),
  };
}

/** `PATCH /memories/{id}` — `version` нь эхлүүлсэн (эсвэл зөрчлийн дараах) хувилбар. */
export function buildUpdateBody(draft: MemoryDraft, mediaIds: string[], version: number): MemoryUpdate {
  const create = buildCreateBody(draft, mediaIds);
  return {
    title: create.title,
    description: create.description ?? null,
    occurredOn: create.occurredOn,
    dateSource: create.dateSource,
    location: create.location ?? null,
    locationSource: create.locationSource,
    tags: create.tags,
    groupIds: create.groupIds,
    media: create.media,
    version,
  };
}

/** Засварын горимын ноорог серверийн дурсамжаас. */
export function draftFromMemory(memory: Memory, clientId: string): MemoryDraft {
  return {
    clientId,
    title: memory.title,
    description: memory.description ?? '',
    occurredOn: memory.occurredOn,
    dateSource: memory.dateSource ?? 'MANUAL',
    dateTouched: true,
    placeName: memory.location?.name ?? '',
    lat: memory.location ? String(memory.location.lat) : '',
    lon: memory.location ? String(memory.location.lon) : '',
    locationSource: memory.locationSource ?? (memory.location ? 'MANUAL' : 'NONE'),
    locationTouched: true,
    tags: [...memory.tags],
    groupIds: memory.groups.map((g) => g.id),
    media: memory.media.map((m) => ({
      key: m.media.id,
      localId: null,
      mediaId: m.media.id,
      previewUri: m.media.kind === 'VIDEO' ? (m.media.urls.poster ?? null) : mediaUrl(m.media, 'sm'),
      kind: m.media.kind === 'VIDEO' ? 'video' : 'image',
      name: m.media.fileName ?? '',
      altText: m.altText ?? '',
      durationMs: m.media.durationMs ?? null,
    })),
    datePlanId: memory.datePlan?.id ?? null,
    baseVersion: memory.version,
  };
}

/** Шошго нэмэх: тайрч, давхардлыг (том/жижиг үсэг үл хамааран) ба хязгаарыг шалгана. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = raw.trim().replace(/^#/, '').slice(0, TAG_MAX);
  if (!tag || tags.length >= TAGS_MAX || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

/** Энгийн тогтвортой hash — `?draft=`-ийн нооргийн түлхүүрт. */
export function hashKey(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
