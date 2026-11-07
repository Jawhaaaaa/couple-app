import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

/**
 * Бодлогын хамгаалалт (DEC-AURA-008): Expo Go-д байхгүй native модуль, Skia, Rive,
 * төлбөр, аналитик/tracker, шифрлэлтийн худал мэдэгдэл, streak/оноо, нөгөөгийн
 * агуулгыг нуух сонголт — бүгд 0 байна.
 */
const MOBILE = path.resolve(__dirname, '../../..');
const REPO = path.resolve(MOBILE, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(MOBILE, 'package.json'), 'utf8'));
const bundled: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(MOBILE, 'node_modules/expo/bundledNativeModules.json'), 'utf8'),
);

/** `expo` өөрөө Expo Go-гийн суурь тул жагсаалтад байхгүй ч зөвшөөрөгдөнө. */
const EXPO_GO_CORE = new Set(['expo']);
const NATIVE_MARKERS = ['android', 'ios', 'expo-module.config.json', 'react-native.config.js'];

export function nativeDepsOutsideExpoGo(deps: Record<string, string>, isNative: (name: string) => boolean): string[] {
  return Object.keys(deps).filter((d) => !EXPO_GO_CORE.has(d) && isNative(d) && !(d in bundled));
}

const isNativePackage = (name: string) =>
  NATIVE_MARKERS.some((m) => fs.existsSync(path.join(MOBILE, 'node_modules', name, m)));

const FORBIDDEN_DEPS: [RegExp, string][] = [
  [/skia/i, 'Skia (§3.4 — вэб export-ыг эвддэг)'],
  [/rive/i, 'Rive (Expo Go-д ажилладаггүй)'],
  [/(^|\/)(react-native-iap|expo-in-app-purchases|react-native-purchases|@stripe\/|stripe|revenuecat)/i, 'төлбөр (§2-2)'],
  [/analytics|mixpanel|amplitude|segment|appsflyer|adjust|branch|posthog|firebase|facebook|tracking-transparency|@sentry\/react-native|datadog|bugsnag/i, 'аналитик/tracker (NFR-06)'],
];

function allDeps(): string[] {
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
}

function walkFiles(dir: string, re: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walkFiles(p, re);
    return re.test(e.name) ? [p] : [];
  });
}

/** Хэрэглэгчид харагдах бичвэр: i18n, агуулгын сан, store metadata, бодлого, app.json. */
function userFacingFiles(): string[] {
  return [
    ...walkFiles(path.join(MOBILE, 'src/i18n'), /\.json$/),
    ...walkFiles(path.join(MOBILE, 'src/content'), /\.json$/),
    ...walkFiles(path.join(REPO, 'docs/store'), /\.(md|json|txt)$/),
    ...['docs/PRIVACY.md', 'docs/TERMS.md'].map((f) => path.join(REPO, f)).filter((f) => fs.existsSync(f)),
    path.join(MOBILE, 'app.json'),
  ];
}

const FALSE_SECURITY = /end[\s-]?to[\s-]?end|\bE2EE?\b|encrypted locally|encrypted end|төгсгөлөөс төгсгөл|шифрлэгдсэн/i;
/** Тоглоомын оноо («Keep score» — санааны тоглоом) зөвшөөрөгдөнө; харилцааг үнэлэх оноо үгүй. */
const BLAME_SCORE = /\bstreaks?\b|тасарлаа|харилцааны оноо|хайрын оноо|(relationship|love|couple) score/i;

export function findMatches(files: string[], re: RegExp): string[] {
  return files.flatMap((f) =>
    fs
      .readFileSync(f, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => re.test(line))
      .map(({ i, line }) => `${path.relative(REPO, f)}:${i + 1}: ${line.trim().slice(0, 120)}`),
  );
}

describe('AC-208 / INV-13 native модуль зөвхөн Expo Go SDK 58-ийнх', () => {
  it('native хамаарал бүр expo/bundledNativeModules.json-д', () => {
    expect(nativeDepsOutsideExpoGo(pkg.dependencies, isNativePackage)).toEqual([]);
  });

  it('шалгагч Expo Go-д байхгүй native санг барина', () => {
    expect(nativeDepsOutsideExpoGo({ 'react-native-mmkv': '1', zustand: '5' }, (n) => n === 'react-native-mmkv')).toEqual([
      'react-native-mmkv',
    ]);
  });

  it('Skia, Rive хамаарал 0', () => {
    expect(allDeps().filter((d) => FORBIDDEN_DEPS.slice(0, 2).some(([re]) => re.test(d)))).toEqual([]);
  });
});

describe('AC-212 / AC-196 төлбөр ба аналитик/tracker хамаарал 0', () => {
  it('package.json-д төлбөр, аналитик, tracker SDK байхгүй', () => {
    const offenders = allDeps().flatMap((d) => FORBIDDEN_DEPS.filter(([re]) => re.test(d)).map(([, why]) => `${d}: ${why}`));
    expect(offenders).toEqual([]);
  });

  it('шалгагч tracker-ыг барина', () => {
    expect(FORBIDDEN_DEPS.some(([re]) => re.test('@react-native-firebase/analytics'))).toBe(true);
    expect(FORBIDDEN_DEPS.some(([re]) => re.test('react-native-purchases'))).toBe(true);
  });
});

describe('AC-193 / INV-09 шифрлэлтийн худал мэдэгдэл 0', () => {
  it('хэрэглэгчид харагдах бичвэрт «end-to-end», «E2E», «encrypted locally» г.м. 0', () => {
    expect(findMatches(userFacingFiles(), FALSE_SECURITY)).toEqual([]);
  });
  it('шалгагч барина', () => {
    expect(FALSE_SECURITY.test('Messages are end-to-end encrypted')).toBe(true);
    expect(FALSE_SECURITY.test('ENCRYPTED END-TO-END')).toBe(true);
    expect(FALSE_SECURITY.test('Мессеж шифрлэгдсэн')).toBe(true);
  });
});

describe('AC-194 / INV-15 streak, оноо, буруутгах бичвэр 0', () => {
  it('хэрэглэгчид харагдах бичвэрт streak/оноо/«тасарлаа» 0', () => {
    expect(findMatches(userFacingFiles(), BLAME_SCORE)).toEqual([]);
  });
});

describe('AC-216 нөгөөгийн агуулгыг нуух/хаах сонголт байхгүй', () => {
  it('гэрээнд хамтрагчийн агуулгыг нуух/хаах operation 0', () => {
    const spec = yaml.load(fs.readFileSync(path.join(REPO, 'contracts/openapi.yaml'), 'utf8')) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    const ops = Object.entries(spec.paths).flatMap(([p, methods]) =>
      Object.values(methods)
        .filter((m) => typeof m === 'object' && m && 'operationId' in m)
        .map((m) => `${p} ${m.operationId}`),
    );
    expect(ops.length).toBeGreaterThan(100);
    expect(ops.filter((o) => /(hide|block|mute|restrict)\w*(partner|content)/i.test(o))).toEqual([]);
  });

  it('UI бичвэрт «нуух/хаах» хамтрагчийн агуулгын сонголт 0', () => {
    const re = /(hide|block|mute) (your )?partner|хамтрагчаа (хаах|блок)|(түүний|нөгөөгийн) агуулгыг нуух/i;
    expect(findMatches(userFacingFiles(), re)).toEqual([]);
  });
});
