#!/usr/bin/env node
/**
 * `expo export --platform web`-ийн дараа service worker-ийг угсарна (FR-19.5, AC-140, AC-156):
 * `dist/`-ээс precache жагсаалт (shell, эхний JS/CSS, фонт, manifest, дүрс) ба агуулгын hash-аас
 * хувилбар гаргаж `sw/sw.js` загварын толгойд нэмээд `dist/sw.js` болгоно.
 *
 *   npx expo export --platform web && node scripts/build-sw.cjs     (= npm run export:web)
 *
 * Workbox-ын оронд жижиг гараар бичсэн SW: шинэ npm хамааралгүй, Expo Go-гийн дүрэмд нөлөөгүй.
 */
/* global __dirname */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MOBILE = path.resolve(__dirname, '..');
const TEMPLATE = path.join(MOBILE, 'sw', 'sw.js');

const FONT = /\.(ttf|otf|woff2?)$/i;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const toUrl = (dist, file) => '/' + path.relative(dist, file).split(path.sep).join('/');

/** index.html-ийн `<script src>` ба stylesheet `href` (зөвхөн өөрийн origin-ийн зам). */
function shellAssets(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<script[^>]+src="(\/[^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/[^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="(\/[^"]+\.css)"[^>]+rel="stylesheet"/g)) urls.add(m[1]);
  return [...urls];
}

/**
 * Precache-ийн жагсаалт: `{url, revision}` (revision = агуулгын md5-ийн эхний 12 тэмдэгт).
 * Splash зураг (iOS суулгахад нэг удаа татна) ба дуу (хэрэгтэй үед) runtime кэшэд үлдэнэ.
 */
function precacheList(dist) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const files = new Set(['/index.html', '/manifest.json', '/favicon.ico', ...shellAssets(html)]);
  for (const f of walk(path.join(dist, 'assets'))) if (FONT.test(f)) files.add(toUrl(dist, f));
  for (const f of walk(path.join(dist, 'icons'))) files.add(toUrl(dist, f));
  return [...files]
    .filter((url) => fs.existsSync(path.join(dist, url.slice(1))))
    .sort()
    .map((url) => ({ url, revision: md5(fs.readFileSync(path.join(dist, url.slice(1)))).slice(0, 12) }));
}

const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

/** `dist/sw.js`-ийн агуулга: precache + хувилбар + загвар. */
function buildServiceWorker(dist, template = fs.readFileSync(TEMPLATE, 'utf8')) {
  const list = precacheList(dist);
  const version = md5(JSON.stringify(list) + template).slice(0, 12);
  const header =
    '/* Үүсгэсэн: scripts/build-sw.cjs — гараар бүү засаарай (эх нь sw/sw.js). */\n' +
    `self.__AURA_VERSION__ = ${JSON.stringify(version)};\n` +
    `self.__AURA_PRECACHE__ = ${JSON.stringify(list)};\n`;
  return { source: header + template, version, list };
}

module.exports = { precacheList, buildServiceWorker, shellAssets };

if (require.main === module) {
  const dist = path.resolve(process.argv[2] || path.join(MOBILE, 'dist'));
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error(`build-sw: ${dist}/index.html алга — эхлээд \`npx expo export --platform web\``);
    process.exit(1);
  }
  const { source, version, list } = buildServiceWorker(dist);
  fs.writeFileSync(path.join(dist, 'sw.js'), source);
  console.log(`build-sw: dist/sw.js — хувилбар ${version}, precache ${list.length} файл`);
}
