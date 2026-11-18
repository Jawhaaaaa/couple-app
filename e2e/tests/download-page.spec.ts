import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * S-99 татах хуудас (T-89, AC-58): APK-ийн QR, Expo Go-гийн QR (`exp://<LAN_IP>:<порт>`), PWA хаяг,
 * суулгах заавар, хувилбар; APK URL 200.
 *
 * - `E2E_DOWNLOAD_URL` өгвөл (DEV_DEPLOY-ийн дараа, жишээ `http://<LAN_IP>:8099`) бодит хуудсыг шалгана.
 * - Өгөөгүй бол `deploy/dev/download/render.mjs`-ээр түр хавтсанд хуудас + туршилтын APK үүсгэж,
 *   тестийн дотор үйлчилнэ — QR build үед үүсдэг (гадаад QR API-гүй) гэдгийг ч батална.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RENDER = join(ROOT, 'deploy/dev/download/render.mjs');
const LAN_IP = '192.168.50.10';
const EXTERNAL = process.env.E2E_DOWNLOAD_URL?.replace(/\/$/, '');

let base = EXTERNAL ?? '';
let server: Server | undefined;
let outDir: string | undefined;

test.beforeAll(async () => {
  if (EXTERNAL) return;
  outDir = mkdtempSync(join(tmpdir(), 'aura-s99-'));
  const apk = join(outDir, '..', `aura-s99-${process.pid}.apk`);
  writeFileSync(apk, Buffer.from('PK\u0003\u0004aura-e2e-apk'));
  execFileSync(process.execPath, [RENDER, '--out', outDir, '--apk', apk], {
    env: { ...process.env, LAN_IP, METRO_PORT: '8081', DOWNLOAD_PORT: '8099', MOBILE_HOST_PORT: '8090', BUILD: 'e2e', COMMIT_SHA: 'e2e1234' },
    stdio: 'pipe',
  });
  rmSync(apk);
  const dir = outDir;
  server = createServer((req, res) => {
    const rel = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(dir, rel || 'index.html');
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end();
    }
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.json': 'application/json',
      '.apk': 'application/vnd.android.package-archive',
    };
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

test('AC-58 S-99: APK ба Expo Go-гийн QR, PWA хаяг, заавар, хувилбар', async ({ page }) => {
  await page.goto(`${base}/`);
  await expect(page.getByTestId('screen-S-99')).toBeVisible();

  const info = await (await page.request.get(`${base}/version.json`)).json();
  await expect(page.getByTestId('version')).toContainText(`Хувилбар ${info.version}`);

  // APK-ийн QR — SVG нь хуудсанд шигтгэгдсэн, агуулга нь APK-ийн бүтэн URL
  const apkQr = page.getByTestId('qr-apk');
  await expect(apkQr.locator('svg path').first()).toBeAttached();
  await expect(apkQr).toHaveAttribute('data-qr-text', /^http:\/\/.+\/aura-.+\.apk$/);
  expect(await apkQr.getAttribute('data-qr-text')).toBe(info.apkUrl);

  // Expo Go-гийн QR — exp://<LAN_IP>:<порт>
  const expoQr = page.getByTestId('qr-expo');
  await expect(expoQr.locator('svg path').first()).toBeAttached();
  await expect(expoQr).toHaveAttribute('data-qr-text', /^exp:\/\/[\d.]+:\d+$/);
  await expect(page.getByTestId('expo-url')).toHaveText(info.expoUrl);

  // PWA хаяг ба суулгах заавар (iPhone Safari, Android Chrome)
  await expect(page.getByTestId('pwa-link')).toHaveAttribute('href', info.pwaUrl);
  const pwa = page.getByTestId('section-pwa');
  await expect(pwa).toContainText('Нүүр дэлгэцэнд нэмэх');
  await expect(pwa).toContainText('Safari');
  await expect(pwa).toContainText('Chrome');
  await expect(page.getByTestId('section-expo')).toContainText('Expo Go');

  // QR нь гадаад үйлчилгээгүй (нууцлал): хуудас өөр origin-оос юу ч татахгүй
  const html = await page.content();
  expect(html).not.toMatch(/<(img|script)[^>]+src="https?:\/\//);

  if (!EXTERNAL) {
    expect(info.expoUrl).toBe(`exp://${LAN_IP}:8081`);
    expect(info.apkUrl).toBe(`http://${LAN_IP}:8099/${info.apk}`);
  }
});

test('AC-58 S-99: APK URL 200', async ({ page }) => {
  await page.goto(`${base}/`);
  const href = await page.getByTestId('apk-link').getAttribute('href');
  expect(href).toMatch(/^aura-.+\.apk$/);
  const res = await page.request.get(new URL(href!, `${base}/`).toString());
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/vnd.android.package-archive');
  expect((await res.body()).subarray(0, 2).toString()).toBe('PK'); // APK = zip
});
