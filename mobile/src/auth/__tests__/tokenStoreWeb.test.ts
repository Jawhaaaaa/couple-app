/**
 * Вэбийн сессийн тэмдэг: нэвтэрсний дараа л апп нээгдэхэд `/auth/refresh` дуудна (нэвтрээгүй хүнд
 * дэмий 401 хүсэлт, console алдаа гаргахгүй — AC-143).
 */
import { clearRefreshToken, hasSessionHint, setRefreshToken, usesCookieRefresh } from '../tokenStore.web';

describe('tokenStore.web', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it('нэвтрэхэд тэмдэг тавигдаж, гарахад арилна', async () => {
    expect(usesCookieRefresh).toBe(true);
    expect(hasSessionHint()).toBe(false);
    await setRefreshToken(null);
    expect(hasSessionHint()).toBe(true);
    await clearRefreshToken();
    expect(hasSessionHint()).toBe(false);
  });
});
