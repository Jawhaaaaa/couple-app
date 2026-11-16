#!/usr/bin/env node
/**
 * `mobile/dist`-ийг (expo export --platform web) SPA хэлбэрээр үйлчилнэ —
 * nginx-ийн `try_files $uri /index.html`-тэй ижил. Урьдчилж:
 *   cd mobile && npm run export:web
 * (`npx expo export` дангаараа `sw.js`-гүй — service worker бүртгэл index.html авч console error өгнө)
 *
 * Прод (deploy/Caddyfile `encode zstd gzip`)-той адил текст файлыг gzip-ээр шахна — эхний ачааллын
 * JS-ийн хэмжээ, LCP-г (AC-152, AC-160) прод-той ижил нөхцөлд хэмжинэ.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// `E2E_DIST_DIR` — өөр хавтсын export (жишээ нь өөр API портоор угсарсан хуулбар); анхдагч `mobile/dist`
const DIST = process.env.E2E_DIST_DIR
  ? resolve(process.env.E2E_DIST_DIR) + sep
  : fileURLToPath(new URL('../../mobile/dist/', import.meta.url));
const PORT = Number(process.env.PORT ?? 8091);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json',
};

/** Шахах төрөл (Caddy-ийн `encode`-тэй адил — зураг, дуу аль хэдийн шахагдсан тул шахахгүй). */
const COMPRESSIBLE = new Set(['.html', '.js', '.json', '.css', '.svg', '.ttf', '.webmanifest', '.map']);
const ACCEPTS_GZIP = /(^|[\s,])gzip([\s;,]|$)/;
/** Шахсан агуулгын кэш (файл → mtime + gzip) — нэг файлыг дахин дахин шахахгүй. */
const gzipCache = new Map();

function gzipped(file) {
  const { mtimeMs } = statSync(file);
  const hit = gzipCache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.body;
  const body = gzipSync(readFileSync(file), { level: 6 });
  gzipCache.set(file, { mtimeMs, body });
  return body;
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('mobile/dist алга — эхлээд `cd mobile && npm run export:web`');
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') return res.end('ok');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  if (COMPRESSIBLE.has(extname(file))) {
    res.setHeader('Vary', 'Accept-Encoding');
    if (ACCEPTS_GZIP.test(String(req.headers['accept-encoding'] ?? ''))) {
      res.setHeader('Content-Encoding', 'gzip');
      return res.end(gzipped(file));
    }
  }
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`mobile/dist → http://localhost:${PORT}`));
