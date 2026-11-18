/**
 * S-32-ийн хязгаар (FR-5.1, AC-172) — сервер ч мөн адил шалгана (`UploadSessionService`):
 * нэг дурсамжид ≤ 20 медиа, видео ≤ 60 с ба ≤ 200 MB, зураг илгээхийн өмнө урт тал ≤ 2560 px.
 */
export const MEDIA_MAX = 20;
export const VIDEO_MAX_MS = 60_000;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 2560;

export type MediaKind = 'image' | 'video';
export type RejectReason = 'TOO_MANY' | 'VIDEO_TOO_LONG' | 'VIDEO_TOO_LARGE' | 'TYPE';

export interface PickCandidate {
  name: string;
  kind: MediaKind | null;
  durationMs?: number | null;
  sizeBytes?: number | null;
}

export interface Rejection {
  name: string;
  reason: RejectReason;
}

/**
 * Сонгосон файлуудыг хязгаараар шүүнэ: аль хэдийн `existing` байгаа үед 20 хүртэл л
 * хүлээн авна; урт/том видео ба танихгүй төрлийг шалтгаантай нь буцаана.
 */
export function admitPicks<T extends PickCandidate>(existing: number, picks: T[]): { accepted: T[]; rejected: Rejection[] } {
  const accepted: T[] = [];
  const rejected: Rejection[] = [];
  for (const p of picks) {
    let reason: RejectReason | null = null;
    if (p.kind !== 'image' && p.kind !== 'video') reason = 'TYPE';
    else if (p.kind === 'video' && (p.durationMs ?? 0) > VIDEO_MAX_MS) reason = 'VIDEO_TOO_LONG';
    else if (p.kind === 'video' && (p.sizeBytes ?? 0) > VIDEO_MAX_BYTES) reason = 'VIDEO_TOO_LARGE';
    else if (existing + accepted.length >= MEDIA_MAX) reason = 'TOO_MANY';
    if (reason) rejected.push({ name: p.name, reason });
    else accepted.push(p);
  }
  return { accepted, rejected };
}

/** Зургийн урт талыг ≤ 2560 болгох хэмжээ; аль хэдийн багтаж байвал `null`. */
export function resizeTarget(width: number, height: number, maxSide = IMAGE_MAX_SIDE): { width: number; height: number } | null {
  const long = Math.max(width, height);
  if (!(long > maxSide)) return null;
  const ratio = maxSide / long;
  return width >= height
    ? { width: maxSide, height: Math.max(1, Math.round(height * ratio)) }
    : { width: Math.max(1, Math.round(width * ratio)), height: maxSide };
}
