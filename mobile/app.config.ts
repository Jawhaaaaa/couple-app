/**
 * Native тохиргоо (FR-17.3, AC-61). Суурь нь `app.json` (вэб, router, хувилбар — вэбийн шалгалтууд ба
 * татах хуудас түүнийг уншина); энд iOS/Android-ийн танигч, дүрс, splash, build дугаар, зөвшөөрлийн
 * тайлбар (Монгол/Англи — `locales/*.json`), EAS project id нэмэгдэнэ.
 *
 * Зөвшөөрлийн тайлбарын эх нь `locales/en.json` (Info.plist-ийн анхдагч) ба `locales/mn.json`
 * (InfoPlist.strings — утасны хэл Монгол бол). Plugin-уудад ижил англи бичвэрийг өгнө: эс бөгөөс
 * plugin өөрийн англи анхдагчаар Info.plist-ийг дарна.
 *
 * Орчны хувьсагч (бүгд сонголттой, нууц биш):
 *   EXPO_PUBLIC_APP_VERSION — semver (хоосон бол app.json-ийнх)
 *   EXPO_PUBLIC_BUILD       — build дугаар; бүхэл тоо бол iOS buildNumber ба Android versionCode
 *   EAS_PROJECT_ID          — `eas init`-ийн дараах project id (EAS Build/Update)
 */
import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

import en from './locales/en.json';

export const BUNDLE_ID = 'mn.aura.couple';

type IosStrings = typeof en.ios;

/** Монгол/Англи хэлээр тайлбар заавал байх iOS зөвшөөрлүүд (spec §7). */
export const REQUIRED_IOS_PERMISSIONS: (keyof IosStrings)[] = [
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSFaceIDUsageDescription',
  'NSCalendarsUsageDescription',
];

/**
 * Бараан палитрын `bg` ба Коралл `primary` — өнгөний цорын ганц эх `src/theme/tokens.ts` (AC-DS-02).
 * Expo-гийн config loader нь app.config.ts-ээс өөр TS файл require хийж чаддаггүй тул текстээс уншина
 * (`scripts/generate-pwa-icons.mjs`-тэй ижил арга).
 */
export function readThemeColors(root: string = __dirname): { bg: string; primary: string } {
  const src = fs.readFileSync(path.join(root, 'src/theme/tokens.ts'), 'utf8');
  const bg = src.match(/const darkBase = \{[^}]*?bg: '(#[0-9A-Fa-f]{6})'/s)?.[1];
  const primary = src.match(/basePalette[^=]*=\s*\{\s*dark:\s*\{[^}]*?primary: '(#[0-9A-Fa-f]{6})'/s)?.[1];
  if (!bg || !primary) throw new Error('src/theme/tokens.ts-ээс bg/primary олдсонгүй');
  return { bg, primary };
}

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** `EXPO_PUBLIC_BUILD` эерэг бүхэл тоо бол түүнийг, эс бол 1. */
export function buildNumberFrom(raw: string | undefined): number {
  const n = Number(nonEmpty(raw));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env;
  const build = buildNumberFrom(env.EXPO_PUBLIC_BUILD);
  const { bg, primary } = readThemeColors();
  const t = en.ios;
  const projectId = nonEmpty(env.EAS_PROJECT_ID);

  return {
    ...config,
    name: config.name ?? 'Aura',
    slug: config.slug ?? 'aura',
    version: nonEmpty(env.EXPO_PUBLIC_APP_VERSION) ?? config.version ?? '1.0.0',
    icon: './assets/images/icon.png',
    backgroundColor: bg,
    ios: {
      ...config.ios,
      bundleIdentifier: BUNDLE_ID,
      buildNumber: String(build),
      supportsTablet: true,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...t,
        CFBundleAllowMixedLocalizations: true,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      ...config.android,
      package: BUNDLE_ID,
      versionCode: build,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: bg,
      },
      predictiveBackGestureEnabled: false,
      blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.SYSTEM_ALERT_WINDOW'],
    },
    locales: {
      en: './locales/en.json',
      mn: './locales/mn.json',
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-splash-screen',
        {
          backgroundColor: bg,
          image: './assets/images/splash-icon.png',
          imageWidth: 120,
        },
      ],
      ['expo-camera', { cameraPermission: t.NSCameraUsageDescription, microphonePermission: t.NSMicrophoneUsageDescription, recordAudioAndroid: true }],
      [
        'expo-image-picker',
        {
          photosPermission: t.NSPhotoLibraryUsageDescription,
          cameraPermission: t.NSCameraUsageDescription,
          microphonePermission: t.NSMicrophoneUsageDescription,
        },
      ],
      ['expo-media-library', { photosPermission: t.NSPhotoLibraryUsageDescription, savePhotosPermission: t.NSPhotoLibraryAddUsageDescription }],
      ['expo-audio', { microphonePermission: t.NSMicrophoneUsageDescription }],
      ['expo-location', { locationWhenInUsePermission: t.NSLocationWhenInUseUsageDescription }],
      ['expo-local-authentication', { faceIDPermission: t.NSFaceIDUsageDescription }],
      ['expo-calendar', { calendarPermission: t.NSCalendarsUsageDescription, writeOnlyCalendarPermission: t.NSCalendarsWriteOnlyAccessUsageDescription }],
      ['expo-notifications', { color: primary }],
    ],
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
