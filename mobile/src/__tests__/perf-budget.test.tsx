import { transformSync } from '@babel/core';
import { act, render, screen } from '@testing-library/react-native';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Text } from 'react-native';

import { mediaPlaceholder } from '@/api/queries/memories';
import { loadLottie, type LottieLoader, useLottieSource } from '@/motion/lottieSource';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const SCRIPT = path.join(ROOT, 'scripts/check-bundle-size.mjs');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(d.name) ? [full] : [];
  });
}
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');

function fakeDist(entryBytes: number) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-size-'));
  const put = (file: string, body: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
    fs.writeFileSync(path.join(dist, file), body);
  };
  put(
    'index.html',
    '<html><head><link rel="preload" href="/_expo/static/css/a.css" as="style"></head><body>' +
      '<script src="/_expo/static/js/web/__expo-metro-runtime-1.js" defer></script>' +
      '<script src="/_expo/static/js/web/entry-2.js" defer></script>' +
      '<script src="https://cdn.example/x.js"></script></body></html>',
  );
  put('_expo/static/js/web/__expo-metro-runtime-1.js', 'runtime();');
  // Шахагддаггүй (санамсаргүй) өгөгдөл — gzip хэмжээ ≈ түүхий хэмжээ
  put('_expo/static/js/web/entry-2.js', randomBytes(entryBytes));
  put('_expo/static/js/web/_layout-abc123.js', 'layout();');
  put('_expo/static/js/web/LeafletMap-def456.js', 'x'.repeat(10_000));
  put('_expo/static/js/web/index-0a1b2c.js', 'lottie();');
  return dist;
}

function runCheck(dist: string, ...args: string[]) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [SCRIPT, dist, '--json', ...args], { encoding: 'utf8' }) };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { code: e.status, out: e.stdout };
  }
}

describe('T-87 scripts/check-bundle-size.mjs (FR-19.10)', () => {
  it('AC-160 эхний ачаалал = index.html-ийн script + layout chunk; lazy chunk (маршрут, Leaflet, Lottie) тоонд орохгүй', () => {
    const { code, out } = runCheck(fakeDist(2000));
    const result = JSON.parse(out) as { entries: { file: string; gzip: number }[]; gzip: number; budget: number; ok: boolean };
    expect(code).toBe(0);
    expect(result.entries.map((e) => e.file).sort()).toEqual([
      '_expo/static/js/web/__expo-metro-runtime-1.js',
      '_expo/static/js/web/_layout-abc123.js',
      '_expo/static/js/web/entry-2.js',
    ]);
    expect(result.budget).toBe(1.5 * 1024 * 1024);
    expect(result.ok).toBe(true);
    expect(result.gzip).toBe(result.entries.reduce((s, e) => s + e.gzip, 0));
  });

  it('AC-160 gzip хэмжээ төсвөөс их бол exit 1 (build унана)', () => {
    const { code, out } = runCheck(fakeDist(50_000), '--budget', '20000');
    expect(code).toBe(1);
    expect((JSON.parse(out) as { ok: boolean }).ok).toBe(false);
  });

  it('npm run check:size ба Docker build-д холбогдсон', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:size']).toBe('node scripts/check-bundle-size.mjs');
    expect(pkg.scripts['export:web']).toContain('check-bundle-size.mjs');
    expect(fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')).toContain('node scripts/check-bundle-size.mjs');
  });
});

describe('T-87 lazy ачаалал (AC-160)', () => {
  const files = sourceFiles(SRC);
  const read = (f: string) => fs.readFileSync(f, 'utf8');

  it('AC-160 маршрут бүр lazy: expo-router asyncRoutes.web, web.output = single (SPA) хэвээр', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')) as { expo: { web: { output: string }; plugins: unknown[] } };
    expect(app.expo.web.output).toBe('single');
    expect(app.expo.plugins).toContainEqual(['expo-router', { asyncRoutes: { web: true } }]);
  });

  it('AC-160 Lottie тоглуулагч (dotLottie) ба Leaflet зөвхөн динамик import-оор', () => {
    const staticImport = /^import [^;]*from '(@lottiefiles\/dotlottie-react|leaflet)'/m;
    // LeafletMap.tsx нь өөрөө lazy chunk-ийн эх (MapView.web.tsx-ээс import()-оор л)
    expect(files.filter((f) => staticImport.test(read(f))).map(rel)).toEqual(['components/map/LeafletMap.tsx']);
    expect(read(path.join(SRC, 'motion/SizedLottie.web.tsx'))).toContain("import('@lottiefiles/dotlottie-react')");
    expect(read(path.join(SRC, 'components/map/MapView.web.tsx'))).toContain("import('./LeafletMap')");
    const importsLeaflet = files.filter((f) => /['"]\.\/LeafletMap['"]|components\/map\/LeafletMap/.test(read(f))).map(rel);
    expect(importsLeaflet).toEqual(['components/map/MapView.web.tsx']);
  });

  it('AC-160 Lottie JSON-ийг static require/import хийхгүй — loader (`() => import(…)`)', () => {
    const offenders = files.filter((f) => /require\([^)]*lottie[^)]*\.json'\)|^import [^;]*from '[^']*lottie[^']*\.json'/m.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('AC-160 loader нэг л удаа дуудагдана; хөдөлгөөн унтраастай бол огт татахгүй', async () => {
    const anim = { v: '5.7.0', fr: 30, ip: 0, op: 30, w: 10, h: 10, layers: [] };
    const loader = jest.fn(async () => ({ default: anim })) as unknown as LottieLoader & jest.Mock;
    function Probe({ enabled }: { enabled: boolean }) {
      const source = useLottieSource(loader, enabled);
      return <Text testID="probe">{source ? 'ready' : 'fallback'}</Text>;
    }
    const view = await render(<Probe enabled={false} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('fallback');
    expect(loader).not.toHaveBeenCalled();
    await act(async () => {
      await view.rerender(<Probe enabled />);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('ready');
    await expect(loadLottie(loader)).resolves.toBe(anim);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('T-87 lucide дүрсийг файл тус бүрээр (babel plugin)', () => {
  it('AC-160 barrel import → icons/<нэр>; төрөл ба createLucideIcon эх import-д үлдэнэ', () => {
    const out = transformSync(
      "import { Heart, Image as ImageIcon, type LucideIcon, createLucideIcon } from 'lucide-react-native';\nexport const x: LucideIcon[] = [Heart, ImageIcon, createLucideIcon as never];",
      {
        filename: 'x.tsx',
        babelrc: false,
        configFile: false,
        plugins: [path.join(ROOT, 'scripts/babel-plugin-lucide-icons.cjs')],
        presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
      },
    )?.code;
    expect(out).toContain('import Heart from "lucide-react-native/icons/heart"');
    expect(out).toContain('import ImageIcon from "lucide-react-native/icons/image"');
    expect(out).toContain("import { createLucideIcon } from 'lucide-react-native'");
  });

  it('babel.config.js нь production/dev-д plugin-тэй, jest-д plugin-гүй', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../babel.config.js') as (api: { env: (n: string) => boolean }) => { presets: string[]; plugins: string[] };
    expect(config({ env: (n) => n === 'production' }).plugins).toHaveLength(1);
    expect(config({ env: (n) => n === 'test' }).plugins).toEqual([]);
    expect(config({ env: () => false }).presets).toEqual(['babel-preset-expo']);
  });
});

describe('T-87 зураг — blurhash/thumbnail эхэлж', () => {
  const urls = { original: 'https://s3/o', sm: 'https://s3/sm', md: 'https://s3/md', lg: 'https://s3/lg' };
  it('AC-160 blurhash байвал түүгээр, үгүй бол жижиг thumbnail; sm-ийг өөрийг нь харуулахад орлуулгагүй', () => {
    expect(mediaPlaceholder({ blurhash: 'LEHV6n', urls }, 'lg')).toEqual({ blurhash: 'LEHV6n' });
    expect(mediaPlaceholder({ blurhash: null, urls }, 'lg')).toEqual({ uri: 'https://s3/sm' });
    expect(mediaPlaceholder({ blurhash: null, urls }, 'sm')).toBeUndefined();
    expect(mediaPlaceholder({ blurhash: null, urls: { original: 'https://s3/o' } }, 'md')).toBeUndefined();
    expect(mediaPlaceholder(null)).toBeUndefined();
  });
});
