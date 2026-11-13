#!/usr/bin/env node
/**
 * S-99 татах хуудас (T-89, AC-58): `index.html` загварыг бөглөж, QR-ыг build үед SVG болгон шигтгэнэ.
 * Гадаад QR API ашиглахгүй (нууцлал) — `qrcode` сан (mobile-ийн `react-native-qrcode-svg`-ийн хамаарал,
 * 1.5.x) mobile/ эсвэл e2e/-ийн node_modules-аас.
 *
 *   node deploy/dev/download/render.mjs --out <хавтас> [--apk <app-release.apk>]
 *
 * Орчин: LAN_IP (заавал), METRO_PORT (8081), DOWNLOAD_PORT (8099), MOBILE_HOST_PORT (8090),
 *        PWA_URL (http://<LAN_IP>:<MOBILE_HOST_PORT>), APP_VERSION (mobile/app.json), BUILD, COMMIT_SHA.
 * Гаралт: <out>/index.html, <out>/version.json, (--apk өгвөл) <out>/aura-<хувилбар>.apk
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function loadQrcode() {
  const bases = [process.env.QRCODE_FROM, join(ROOT, 'mobile', 'package.json'), join(ROOT, 'e2e', 'package.json'), import.meta.url];
  for (const base of bases.filter(Boolean)) {
    try {
      return createRequire(base)('qrcode');
    } catch {
      /* дараагийнхыг оролдоно */
    }
  }
  throw new Error('`qrcode` сан олдсонгүй — `cd mobile && npm ci` (эсвэл e2e-д `npm i --no-save qrcode@1.5.4`)');
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function appVersion() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'mobile', 'app.json'), 'utf8')).expo.version;
  } catch {
    return '0.0.0';
  }
}

function humanSize(bytes) {
  return bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

async function main() {
  const out = resolve(arg('out') ?? process.env.DOWNLOAD_OUT ?? join(HERE, 'out'));
  const lanIp = process.env.LAN_IP;
  if (!lanIp) throw new Error('LAN_IP тохируулаагүй (утас хүрэх DEV машины IP, жишээ 192.168.1.20)');
  const metroPort = process.env.METRO_PORT || '8081';
  const downloadPort = process.env.DOWNLOAD_PORT || '8099';
  const pwaUrl = process.env.PWA_URL || `http://${lanIp}:${process.env.MOBILE_HOST_PORT || '8090'}`;
  const version = process.env.APP_VERSION || appVersion();
  const build = process.env.BUILD || process.env.EXPO_PUBLIC_BUILD || 'dev';
  const commit = process.env.COMMIT_SHA || process.env.EXPO_PUBLIC_COMMIT_SHA || 'local';
  mkdirSync(out, { recursive: true });

  // APK: --apk өгвөл хуулна, үгүй бол хавтас дахь хамгийн сүүлийн aura-*.apk
  let apkFile;
  const apkSrc = arg('apk');
  if (apkSrc) {
    apkFile = `aura-${version}.apk`;
    copyFileSync(apkSrc, join(out, apkFile));
  } else {
    apkFile = readdirSync(out)
      .filter((f) => /^aura-.*\.apk$/.test(f))
      .sort((a, b) => statSync(join(out, b)).mtimeMs - statSync(join(out, a)).mtimeMs)[0];
  }
  const base = `http://${lanIp}:${downloadPort}`;
  const apkUrl = apkFile ? `${base}/${apkFile}` : '';
  const expoUrl = `exp://${lanIp}:${metroPort}`;

  const QRCode = loadQrcode();
  const qr = (text) => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 220 });

  let html = readFileSync(join(HERE, 'index.html'), 'utf8');
  // Нөхцөлт блок: <!-- apk:ready -->…<!-- /apk:ready --> ба apk:missing
  const keep = apkFile ? 'ready' : 'missing';
  const drop = apkFile ? 'missing' : 'ready';
  html = html
    .replace(new RegExp(`<!-- apk:${drop} -->[\\s\\S]*?<!-- /apk:${drop} -->`, 'g'), '')
    .replace(new RegExp(`<!-- /?apk:${keep} -->`, 'g'), '');

  const values = {
    VERSION: esc(version),
    BUILD: esc(build),
    COMMIT: esc(commit),
    BUILT_AT: esc(new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'),
    APK_FILE: esc(apkFile ?? ''),
    APK_URL: esc(apkUrl),
    APK_SIZE: apkFile ? esc(humanSize(statSync(join(out, apkFile)).size)) : '',
    EXPO_URL: esc(expoUrl),
    PWA_URL: esc(pwaUrl),
    QR_APK: apkFile ? await qr(apkUrl) : '',
    QR_EXPO: await qr(expoUrl),
    QR_PWA: await qr(pwaUrl),
  };
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));
  const left = html.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error(`Бөглөөгүй placeholder: ${left.join(', ')}`);

  writeFileSync(join(out, 'index.html'), html);
  writeFileSync(
    join(out, 'version.json'),
    JSON.stringify({ version, build, commitSha: commit, apk: apkFile ?? null, apkUrl: apkUrl || null, expoUrl, pwaUrl, builtAt: new Date().toISOString() }, null, 2),
  );
  console.log(`S-99 → ${join(out, 'index.html')} (APK: ${apkFile ?? 'алга'}, Expo Go: ${expoUrl}, PWA: ${pwaUrl})`);
  if (!existsSync(join(out, 'index.html'))) process.exit(1);
}

main().catch((e) => {
  console.error(`render.mjs: ${e.message}`);
  process.exit(1);
});
