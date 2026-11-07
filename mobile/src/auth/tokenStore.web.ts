/**
 * Вэб (PWA): refresh token зөвхөн `aura_rt` HttpOnly cookie-д (DD-AURA-006) —
 * JS-д хүрэхгүй тул XSS-ээр хулгайлагдахгүй. Энд хадгалах зүйл байхгүй.
 */
export const usesCookieRefresh = true;

export async function getRefreshToken(): Promise<string | null> {
  return null;
}

export async function setRefreshToken(_token: string | null | undefined): Promise<void> {}

export async function clearRefreshToken(): Promise<void> {}
