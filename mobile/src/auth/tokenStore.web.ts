/**
 * Вэб (PWA): refresh token зөвхөн `aura_rt` HttpOnly cookie-д (DD-AURA-006) —
 * JS-д хүрэхгүй тул XSS-ээр хулгайлагдахгүй. Энд зөвхөн нууц биш «сесс байж магадгүй»
 * тэмдгийг (`aura.session`) хадгална: тэмдэггүй бол апп нээгдэхэд `/auth/refresh`-ийг
 * дуудахгүй (нэвтрээгүй хүнд илүү 401 хүсэлт, console алдаа гаргахгүй).
 */
export const usesCookieRefresh = true;

const HINT = 'aura.session';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  return null;
}

export async function setRefreshToken(_token: string | null | undefined): Promise<void> {
  storage()?.setItem(HINT, '1');
}

export async function clearRefreshToken(): Promise<void> {
  storage()?.removeItem(HINT);
}

/** Cookie-той сесс байж болох эсэх (нэвтэрсний дараа тавигдана, гарахад арилна). */
export function hasSessionHint(): boolean {
  return storage()?.getItem(HINT) === '1';
}
