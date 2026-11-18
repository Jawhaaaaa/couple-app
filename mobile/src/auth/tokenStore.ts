import * as SecureStore from 'expo-secure-store';

/**
 * Native: refresh token `expo-secure-store`-д (`aura.refresh`, DD-AURA-006).
 * Вэбийн хувилбар (`tokenStore.web.ts`) нь HttpOnly cookie ашигладаг тул хоосон.
 */
const KEY = 'aura.refresh';

export const usesCookieRefresh = false;

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setRefreshToken(token: string | null | undefined): Promise<void> {
  if (token) await SecureStore.setItemAsync(KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

/** Native-д refresh token-ыг SecureStore-оос шууд шалгадаг тул тэмдэг шаардлагагүй. */
export function hasSessionHint(): boolean {
  return true;
}
