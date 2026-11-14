import { compareSemver, isUpdateAvailable, isUpdateRequired, parseSemver, updateUrl } from '../versionCompare';

const info = (over: Partial<Parameters<typeof isUpdateAvailable>[0] & object> = {}) => ({
  latest: '1.2.0',
  minVersion: '1.0.0',
  build: '142',
  commitSha: '830fbfe',
  downloadUrl: 'https://aura.example.mn/download',
  storeUrl: null,
  updateAvailable: false,
  updateRequired: false,
  ...over,
});

describe('semver харьцуулалт (FR-17.5, AC-141)', () => {
  it('тоогоор (тэмдэгтээр биш) харьцуулна: 1.10.0 > 1.9.9', () => {
    expect(compareSemver('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.2.0')).toBe(0);
    expect(compareSemver('1.2.0', '2.0.0')).toBeLessThan(0);
    expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3-beta.1', '1.2.3')).toBe(0);
  });

  it('semver биш бол шийдэхгүй (0) — таамгаар шинэчлэл шаардахгүй', () => {
    expect(parseSemver('dev')).toBeNull();
    expect(compareSemver('dev', '1.0.0')).toBe(0);
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver(undefined, '1.0.0')).toBe(0);
  });

  it('AC-141 latest > апп → «Шинэ хувилбар бэлэн» (сервер тооцоогүй ч)', () => {
    expect(isUpdateAvailable(info(), '1.1.0')).toBe(true);
    expect(isUpdateAvailable(info(), '1.2.0')).toBe(false);
    expect(isUpdateAvailable(info({ updateAvailable: true }), '1.2.0')).toBe(true);
    expect(isUpdateAvailable(undefined, '1.0.0')).toBe(false);
  });

  it('S-97 minVersion > апп → шинэчлэх шаардлагатай', () => {
    expect(isUpdateRequired(info({ minVersion: '1.1.0' }), '1.0.9')).toBe(true);
    expect(isUpdateRequired(info({ minVersion: '1.1.0' }), '1.1.0')).toBe(false);
    expect(isUpdateRequired(info({ updateRequired: true }), '1.1.0')).toBe(true);
    expect(isUpdateRequired(null, '0.0.1')).toBe(false);
  });

  it('AC-141 store (prod) холбоос татах хуудсаас (DEV) түрүүлнэ; вэбэд холбоосгүй', () => {
    expect(updateUrl(info({ storeUrl: 'https://play.google.com/store/apps/details?id=mn.aura' }))).toBe(
      'https://play.google.com/store/apps/details?id=mn.aura',
    );
    expect(updateUrl(info())).toBe('https://aura.example.mn/download');
    expect(updateUrl(info({ downloadUrl: null }))).toBeNull();
  });
});
