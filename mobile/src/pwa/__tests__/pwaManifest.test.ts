import fs from 'fs';
import path from 'path';

import { basePalette } from '@/theme/tokens';

/**
 * PWA manifest ба HTML толгой (FR-19.1, AC-140, AC-152). `output: single` горимд Expo нь
 * `public/index.html`-ийг загвар болгодог тул энэ файл ба `public/manifest.json`-ыг шалгана;
 * `expo export --platform web` хийсэн бол `dist/index.html`-ийг ч мөн.
 */
const MOBILE = path.resolve(__dirname, '../../..');
const PUBLIC = path.join(MOBILE, 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8'));
const template = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const DIST_HTML = path.join(MOBILE, 'dist', 'index.html');

/** PNG-ийн IHDR-ээс өргөн/өндөр. */
function pngSize(file: string): [number, number] {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const publicFile = (href: string) => path.join(PUBLIC, href.replace(/^\//, ''));
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const tags = (html: string, re: RegExp) => html.match(re) ?? [];

function expectHead(html: string) {
  expect(html).toMatch(/<link rel="manifest" href="\/manifest.json"/);
  expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
  expect(html).toMatch(/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  expect(html).toMatch(/<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon-180.png"/);
  expect(attr(tags(html, /<meta name="theme-color"[^>]*>/g)[0] ?? '', 'content')).toBe(basePalette.dark.bg);
  expect(tags(html, /<link rel="apple-touch-startup-image"[^>]*>/g).length).toBeGreaterThanOrEqual(10);
}

describe('AC-152 manifest.json', () => {
  it('нэр «Aura», display standalone, start_url, scope', () => {
    expect(manifest).toMatchObject({ name: 'Aura', short_name: 'Aura', display: 'standalone', start_url: '/', scope: '/' });
  });

  it('theme_color ба background_color = tokens-ийн бараан bg', () => {
    expect(manifest.theme_color).toBe(basePalette.dark.bg);
    expect(manifest.background_color).toBe(basePalette.dark.bg);
  });

  it('AC-140 192, 512 ба maskable дүрс бодит хэмжээтэй файл', () => {
    const icons = manifest.icons as { src: string; sizes: string; purpose: string; type: string }[];
    const want = [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ];
    for (const [sizes, purpose] of want) {
      const icon = icons.find((i) => i.sizes === sizes && i.purpose === purpose);
      expect(icon).toBeDefined();
      expect(icon!.type).toBe('image/png');
      const [w, h] = pngSize(publicFile(icon!.src));
      expect(`${w}x${h}`).toBe(sizes);
    }
  });
});

describe('AC-152 HTML толгой (public/index.html)', () => {
  it('manifest холбоос, iOS meta, apple-touch-icon 180, theme-color', () => {
    expectHead(template);
    expect(pngSize(publicFile('/icons/apple-touch-icon-180.png'))).toEqual([180, 180]);
  });

  it('iOS splash бүр файлтай ба media query-ийн хэмжээ × pixel ratio = зургийн хэмжээ', () => {
    for (const tag of tags(template, /<link rel="apple-touch-startup-image"[^>]*>/g)) {
      const media = attr(tag, 'media')!;
      const [, dw, dh, ratio] = media.match(/device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)/)!;
      expect(pngSize(publicFile(attr(tag, 'href')!))).toEqual([+dw * +ratio, +dh * +ratio]);
    }
  });

  it('Expo-гийн загварын орлуулга (%LANG_ISO_CODE%, %WEB_TITLE%) ба #root хадгалагдсан', () => {
    expect(template).toContain('%LANG_ISO_CODE%');
    expect(template).toContain('%WEB_TITLE%');
    expect(template).toContain('<div id="root">');
    // S-01 static splash (AC-160 LCP): JS-ийг хүлээхгүй эхний будалт — апп рендэрлэхэд солигдоно
    expect(template).toMatch(/<div id="root"><div id="aura-splash"[^>]*><img src="\/icons\/icon-512\.png"[^>]*width="224" height="224"/);
  });

  it('app.json web.output = single (SPA — static горимд Lottie SSR унадаг)', () => {
    const app = JSON.parse(fs.readFileSync(path.join(MOBILE, 'app.json'), 'utf8'));
    expect(app.expo.web.output).toBe('single');
  });

  (fs.existsSync(DIST_HTML) ? it : it.skip)('AC-140 export хийсэн dist/index.html-д manifest ба iOS meta', () => {
    const html = fs.readFileSync(DIST_HTML, 'utf8');
    expectHead(html);
    expect(fs.existsSync(path.join(MOBILE, 'dist', 'manifest.json'))).toBe(true);
  });
});
