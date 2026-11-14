import type { components } from '@/api/schema';

type VersionInfo = components['schemas']['VersionInfo'];

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/** Semver-ийн `major.minor.patch`; таних боломжгүй бол `null` (pre-release/build хэсгийг үл тооно). */
export function parseSemver(value: string | null | undefined): [number, number, number] | null {
  const m = SEMVER.exec((value ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** `a < b` → сөрөг, тэнцүү → 0, `a > b` → эерэг. Аль нэг нь semver биш бол 0 (шийдэхгүй). */
export function compareSemver(a: string | null | undefined, b: string | null | undefined): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

/**
 * «Шинэ хувилбар бэлэн» (FR-17.5, AC-141): сервер `current`-оор тооцсон `updateAvailable`, эсвэл
 * (сервер хувилбарыг мэдээгүй үед) апп-ын хувилбар `latest`-ээс бага.
 */
export function isUpdateAvailable(info: VersionInfo | null | undefined, current: string): boolean {
  if (!info) return false;
  return info.updateAvailable || compareSemver(current, info.latest) < 0;
}

/** S-97 «Шинэчлэх шаардлагатай»: `updateRequired` эсвэл апп-ын хувилбар `minVersion`-оос бага. */
export function isUpdateRequired(info: VersionInfo | null | undefined, current: string): boolean {
  if (!info) return false;
  return info.updateRequired || compareSemver(current, info.minVersion) < 0;
}

/** Татах холбоос: prod-д store, DEV-д татах хуудас (`storeUrl` ?? `downloadUrl`); вэбэд байхгүй. */
export function updateUrl(info: VersionInfo | null | undefined): string | null {
  return info?.storeUrl ?? info?.downloadUrl ?? null;
}
