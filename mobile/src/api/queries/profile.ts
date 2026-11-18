import { api, ApiRequestError, unwrap } from '@/api/client';
import type { components } from '@/api/schema';

import type { Me } from './auth';

/** `ProfileUpdate`-ээс `version`-ийг хассан — хувилбарыг энэ модуль өөрөө удирдана. */
export type ProfilePatch = Omit<components['schemas']['ProfileUpdate'], 'version'>;

/**
 * `PATCH /me`-ийн optimistic lock (`version`). Гэрээний `Me`-д `version` талбар алга
 * (гэрээний мэдэгдэж буй дутуу тал), тиймээс сүүлд мэдсэн утгыг санах ойд барина:
 * эхэндээ 0; `409 VERSION_CONFLICT` ирвэл `details.currentVersion`-ийг аваад нэг удаа
 * давтана. Амжилттай бол сервер хувилбарыг нэгээр ахиулна гэж үзнэ (буруу таавал
 * дараагийн дуудлагад зөрчлөөр дахин тааруулна).
 */
let knownVersion = 0;

export function profileVersionCache() {
  return {
    get: () => knownVersion,
    reset: () => {
      knownVersion = 0;
    },
  };
}

/** 409 `VERSION_CONFLICT`-ийн `details.currentVersion` (тоо биш бол `null`). */
export function conflictVersion(error: unknown): number | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'VERSION_CONFLICT') return null;
  const value = error.body?.details?.currentVersion;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export type PatchFn = (body: components['schemas']['ProfileUpdate']) => Promise<Me>;

const defaultPatch: PatchFn = (body) => unwrap(api.PATCH('/me', { body }));

/** `PATCH /me` — хувилбарын зөрчилд нэг удаа давтана (S-07, S-81, AC-64 бүсийн асуулт). */
export async function patchMe(patch: ProfilePatch, send: PatchFn = defaultPatch): Promise<Me> {
  try {
    const me = await send({ ...patch, version: knownVersion });
    knownVersion += 1;
    return me;
  } catch (error) {
    const current = conflictVersion(error);
    if (current === null) throw error;
    knownVersion = current;
    const me = await send({ ...patch, version: knownVersion });
    knownVersion += 1;
    return me;
  }
}

/** `PUT /me/avatar` — upload-аар авсан `mediaId` (≤ 10 MB зураг, AC-62). */
export function setAvatar(mediaId: string): Promise<Me> {
  return unwrap(api.PUT('/me/avatar', { body: { mediaId } }));
}
