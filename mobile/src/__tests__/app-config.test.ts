/**
 * AC-61 (FR-17.3): `app.config.ts` ба `eas.json` нь EAS бүртгэлгүйгээр шалгах боломжтой хэсгээрээ зөв.
 * - `npx expo config --type public` алдаагүй, iOS bundle id / Android package `mn.aura.couple`, хувилбар;
 * - iOS зөвшөөрлийн тайлбар (камер, зураг, микрофон, байршил, Face ID, календарь) Монгол/Англиар;
 * - `eas.json` EAS-ийн JSON schema-д нийцэж, development / preview / production profile-той;
 * - `docs/store/`, `docs/RELEASE.md` байна.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import Ajv from 'ajv';
import draft06 from 'ajv/dist/refs/json-schema-draft-06.json';
import type { ExpoConfig } from 'expo/config';

import appConfig, { BUNDLE_ID, REQUIRED_IOS_PERMISSIONS, buildNumberFrom, readThemeColors } from '../../app.config';

const MOBILE = path.resolve(__dirname, '../..');
const REPO = path.resolve(MOBILE, '..');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

const appJson = readJson(path.join(MOBILE, 'app.json')).expo as ExpoConfig;
const en = readJson(path.join(MOBILE, 'locales/en.json'));
const mn = readJson(path.join(MOBILE, 'locales/mn.json'));

const ENV_KEYS = ['EXPO_PUBLIC_BUILD', 'EXPO_PUBLIC_APP_VERSION', 'EAS_PROJECT_ID'] as const;

function resolve(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}): ExpoConfig {
  const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);
  ENV_KEYS.forEach((k) => {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  });
  try {
    return appConfig({ config: appJson, projectRoot: MOBILE, staticConfigPath: null, packageJsonPath: null } as never);
  } finally {
    saved.forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  }
}

const pluginOptions = (cfg: ExpoConfig, name: string): Record<string, unknown> | undefined => {
  const entry = (cfg.plugins ?? []).find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(entry) ? (entry[1] as Record<string, unknown>) : undefined;
};

describe('AC-61 app.config.ts', () => {
  const cfg = resolve();

  it('iOS bundle id ба Android package mn.aura.couple, semver хувилбар', () => {
    expect(BUNDLE_ID).toBe('mn.aura.couple');
    expect(cfg.ios?.bundleIdentifier).toBe('mn.aura.couple');
    expect(cfg.android?.package).toBe('mn.aura.couple');
    expect(cfg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cfg.version).toBe(appJson.version);
    expect(cfg.name).toBe('Aura');
  });

  it('app.json-ийн вэб тохиргоо хэвээр (web.output single, router asyncRoutes)', () => {
    expect(cfg.web?.output).toBe('single');
    expect(pluginOptions(cfg, 'expo-router')).toEqual({ asyncRoutes: { web: true } });
  });

  it('build дугаар: EXPO_PUBLIC_BUILD бүхэл тоо бол iOS buildNumber ба Android versionCode', () => {
    expect(cfg.ios?.buildNumber).toBe('1');
    expect(cfg.android?.versionCode).toBe(1);
    const built = resolve({ EXPO_PUBLIC_BUILD: '42', EXPO_PUBLIC_APP_VERSION: '1.3.0' });
    expect(built.ios?.buildNumber).toBe('42');
    expect(built.android?.versionCode).toBe(42);
    expect(built.version).toBe('1.3.0');
    expect(buildNumberFrom('dev')).toBe(1);
    expect(buildNumberFrom('')).toBe(1);
    expect(buildNumberFrom('-3')).toBe(1);
    expect(buildNumberFrom('2.5')).toBe(1);
  });

  it('EAS project id зөвхөн орчноос (репод бичигдэхгүй)', () => {
    expect(cfg.extra?.eas).toBeUndefined();
    expect(resolve({ EAS_PROJECT_ID: 'abc-123' }).extra?.eas).toEqual({ projectId: 'abc-123' });
  });

  it.each(REQUIRED_IOS_PERMISSIONS.map((k) => [k]))('%s — Англи ба Монгол тайлбар хоёулаа бий', (key) => {
    const enText: string = en.ios[key];
    const mnText: string = mn.ios[key];
    expect(enText.length).toBeGreaterThan(20);
    expect(mnText.length).toBeGreaterThan(20);
    expect(mnText).not.toBe(enText);
    expect(mnText).toMatch(/[А-Яа-яӨөҮүЁё]/);
    expect(enText).not.toMatch(/[А-Яа-яӨөҮүЁё]/);
    // Info.plist-ийн анхдагч — Англи; Монгол нь InfoPlist.strings (locales.mn)
    expect(cfg.ios?.infoPlist?.[key]).toBe(enText);
  });

  it('шаардлагатай зөвшөөрөл бүрэн: камер, зураг, микрофон, байршил, Face ID, календарь', () => {
    expect(REQUIRED_IOS_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'NSCameraUsageDescription',
        'NSPhotoLibraryUsageDescription',
        'NSMicrophoneUsageDescription',
        'NSLocationWhenInUseUsageDescription',
        'NSFaceIDUsageDescription',
        'NSCalendarsUsageDescription',
      ]),
    );
  });

  it('Монгол/Англи locale файл ижил түлхүүртэй, app.config-д бүртгэлтэй', () => {
    expect(Object.keys(mn.ios).sort()).toEqual(Object.keys(en.ios).sort());
    expect(Object.keys(mn.android).sort()).toEqual(Object.keys(en.android).sort());
    expect(cfg.locales).toEqual({ en: './locales/en.json', mn: './locales/mn.json' });
  });

  it('plugin-ууд locale-ийн англи бичвэрийг өгнө (өөрийн анхдагчаар Info.plist-ийг дарахгүй)', () => {
    const t = en.ios;
    expect(pluginOptions(cfg, 'expo-camera')).toMatchObject({ cameraPermission: t.NSCameraUsageDescription, microphonePermission: t.NSMicrophoneUsageDescription });
    expect(pluginOptions(cfg, 'expo-image-picker')).toMatchObject({
      photosPermission: t.NSPhotoLibraryUsageDescription,
      cameraPermission: t.NSCameraUsageDescription,
      microphonePermission: t.NSMicrophoneUsageDescription,
    });
    expect(pluginOptions(cfg, 'expo-media-library')).toMatchObject({ savePhotosPermission: t.NSPhotoLibraryAddUsageDescription });
    expect(pluginOptions(cfg, 'expo-audio')).toMatchObject({ microphonePermission: t.NSMicrophoneUsageDescription });
    expect(pluginOptions(cfg, 'expo-location')).toMatchObject({ locationWhenInUsePermission: t.NSLocationWhenInUseUsageDescription });
    expect(pluginOptions(cfg, 'expo-local-authentication')).toMatchObject({ faceIDPermission: t.NSFaceIDUsageDescription });
    expect(pluginOptions(cfg, 'expo-calendar')).toMatchObject({ calendarPermission: t.NSCalendarsUsageDescription });
  });

  it('дүрс, adaptive icon, splash файл байгаа ба өнгө нь tokens.ts-ийн бараан bg', () => {
    const { bg } = readThemeColors(MOBILE);
    expect(bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const splash = pluginOptions(cfg, 'expo-splash-screen');
    expect(splash?.backgroundColor).toBe(bg);
    expect(cfg.android?.adaptiveIcon?.backgroundColor).toBe(bg);
    for (const file of [cfg.icon, cfg.android?.adaptiveIcon?.foregroundImage, splash?.image as string, cfg.web?.favicon]) {
      expect(file).toBeTruthy();
      expect(fs.existsSync(path.join(MOBILE, file as string))).toBe(true);
    }
  });

  it('Android-д арын байршлын зөвшөөрөл хаалттай (байршлыг ашиглах үед л)', () => {
    expect(cfg.android?.blockedPermissions).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(cfg.ios?.infoPlist?.NSLocationAlwaysUsageDescription).toBeUndefined();
  });

  it('`npx expo config --type public` алдаагүй уншигдана', () => {
    const cli = require.resolve('expo/bin/cli', { paths: [MOBILE] });
    const env: NodeJS.ProcessEnv = { ...process.env, EXPO_NO_TELEMETRY: '1', CI: '1' };
    ENV_KEYS.forEach((k) => delete env[k]);
    const out = execFileSync(process.execPath, [cli, 'config', '--type', 'public', '--json'], { cwd: MOBILE, env, encoding: 'utf8', timeout: 90_000 });
    const pub = JSON.parse(out.slice(out.indexOf('{')));
    expect(pub.ios.bundleIdentifier).toBe('mn.aura.couple');
    expect(pub.android.package).toBe('mn.aura.couple');
    expect(pub.version).toBe(appJson.version);
    expect(pub.ios.infoPlist.NSFaceIDUsageDescription).toBe(en.ios.NSFaceIDUsageDescription);
    expect(pub.sdkVersion).toMatch(/^58\./);
  }, 120_000);
});

describe('AC-61 eas.json', () => {
  const eas = readJson(path.join(MOBILE, 'eas.json'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addMetaSchema(draft06);
  const validate = ajv.compile(readJson(path.join(MOBILE, 'test/schemas/eas.schema.json')));

  it('EAS-ийн JSON schema-д нийцнэ', () => {
    const ok = validate(eas);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('schema шалгагч буруу утгыг барьдаг (өөрийгөө шалгах)', () => {
    expect(validate({ build: { production: { distribution: 'everywhere' } } })).toBe(false);
    expect(validate({ build: { preview: { android: { buildType: 'exe' } } } })).toBe(false);
  });

  it('development / preview / production profile', () => {
    expect(Object.keys(eas.build).sort()).toEqual(['development', 'preview', 'production']);
    expect(eas.build.development.distribution).toBe('internal');
    expect(eas.build.preview.android.buildType).toBe('apk');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.submit.production).toBeDefined();
  });

  it('нууц утга (token, нууц үг, түлхүүрийн зам) агуулахгүй', () => {
    expect(JSON.stringify(eas)).not.toMatch(/token|password|secret|serviceAccountKeyPath|\.p8|\.p12|keystore/i);
  });
});

describe('AC-61 store metadata ба RELEASE.md', () => {
  const store = path.join(REPO, 'docs/store');

  it('docs/store/-д Монгол, Англи бичвэр ба шалгагчийн тэмдэглэл', () => {
    for (const f of ['README.md', 'metadata.mn.md', 'metadata.en.md', 'review-notes.md']) {
      expect(fs.existsSync(path.join(store, f))).toBe(true);
    }
    const mnMeta = fs.readFileSync(path.join(store, 'metadata.mn.md'), 'utf8');
    const enMeta = fs.readFileSync(path.join(store, 'metadata.en.md'), 'utf8');
    expect(mnMeta).toMatch(/Aura/);
    expect(enMeta).toMatch(/Aura/);
    // Google Play-ийн богино тайлбар ≤ 80 тэмдэгт
    for (const md of [mnMeta, enMeta]) {
      const short = md.split(/\n## /).find((s) => /^(Богино тайлбар|Short description)/.test(s));
      const text = short?.split('\n').slice(1).join(' ').trim() ?? '';
      expect(text.length).toBeGreaterThan(0);
      expect([...text].length).toBeLessThanOrEqual(80);
    }
  });

  it('docs/RELEASE.md-д EAS build ба submit-ийн командууд', () => {
    const release = fs.readFileSync(path.join(REPO, 'docs/RELEASE.md'), 'utf8');
    for (const profile of ['development', 'preview', 'production']) {
      expect(release).toMatch(new RegExp(`eas-cli@latest build [^\\n]*--profile ${profile}`));
    }
    expect(release).toMatch(/eas-cli@latest submit --platform android/);
    expect(release).toMatch(/SDK 58/);
  });
});
