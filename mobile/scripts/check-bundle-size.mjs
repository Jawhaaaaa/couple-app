#!/usr/bin/env node
/**
 * Вэбийн эхний ачааллын JS-ийн төсөв (FR-19.10, AC-160): `expo export --platform web`-ийн дараа
 * `dist/index.html`-ийн `<script src>` (+ `modulepreload`) ба Expo Router-ийн layout chunk-уудыг
 * (`_layout-*.js` — апп нээгдэхэд маршрутын модыг угсрахад татагдана; дээд хязгаар) gzip-ээр
 * (zlib, түвшин 6 — nginx-ийн ердийн) хэмжиж, 1.5 MB-аас (1 572 864 байт) их бол exit 1.
 * Маршрут бүрийн дэлгэц, Lottie, Leaflet нь тусдаа lazy chunk тул тоонд орохгүй.
 *
 * Хэрэглээ: `npm run check:size` (export хийсэн `dist/`) · `node scripts/check-bundle-size.mjs <dist> [--json] [--budget <байт>]`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const BUDGET_BYTES = 1.5 * 1024 * 1024;
const JS_DIR = '_expo/static/js/web';

/** index.html-ээс эхний ачааллын script-уудын замыг (`/`-гүй) гаргана. */
export function initialScripts(html) {
  const out = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)) out.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel="(?:modulepreload|preload)"[^>]*>/g)) {
    const tag = m[0];
    if (!/\bas="script"/.test(tag) && !/modulepreload/.test(tag)) continue;
    const href = /\bhref="([^"]+\.js)"/.exec(tag);
    if (href) out.add(href[1]);
  }
  return [...out].filter((src) => !/^(https?:)?\/\//.test(src)).map((src) => src.replace(/^\//, ''));
}

/** Layout chunk-ууд (`_layout-<hash>.js`). */
export function layoutChunks(dist) {
  const dir = path.join(dist, JS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^_layout-[0-9a-f]+\.js$/.test(f))
    .map((f) => `${JS_DIR}/${f}`);
}

export function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: 6 }).length;
}

export function measure(dist, budget = BUDGET_BYTES) {
  const htmlPath = path.join(dist, 'index.html');
  if (!fs.existsSync(htmlPath)) throw new Error(`${htmlPath} алга — эхлээд \`npx expo export --platform web\``);
  const files = [...new Set([...initialScripts(fs.readFileSync(htmlPath, 'utf8')), ...layoutChunks(dist)])];
  const entries = files.map((file) => {
    const buf = fs.readFileSync(path.join(dist, file));
    return { file, raw: buf.length, gzip: gzipSize(buf) };
  });
  const gzip = entries.reduce((s, e) => s + e.gzip, 0);
  const raw = entries.reduce((s, e) => s + e.raw, 0);
  return { entries, raw, gzip, budget, ok: gzip <= budget };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const budgetIdx = args.indexOf('--budget');
  const budget = budgetIdx >= 0 ? Number(args[budgetIdx + 1]) : BUDGET_BYTES;
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--budget');
  const dist = path.resolve(positional[0] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
  const result = measure(dist, budget);
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    for (const e of [...result.entries].sort((a, b) => b.gzip - a.gzip)) console.log(`${kb(e.gzip).padStart(10)} gzip  ${kb(e.raw).padStart(10)} raw  ${e.file}`);
    console.log(`Эхний ачааллын JS: ${kb(result.gzip)} gzip (${kb(result.raw)} raw) / төсөв ${kb(result.budget)} — ${result.ok ? 'OK' : 'ХЭТЭРСЭН'}`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
