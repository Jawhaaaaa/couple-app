import fs from 'fs';
import os from 'os';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildServiceWorker, precacheList } = require('../../../scripts/build-sw.cjs') as {
  buildServiceWorker: (dist: string, template?: string) => { source: string; version: string; list: { url: string; revision: string }[] };
  precacheList: (dist: string) => { url: string; revision: string }[];
};

function fakeDist(entry = 'console.log(1)') {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-dist-'));
  const put = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    fs.writeFileSync(path.join(dist, rel), body);
  };
  put(
    'index.html',
    '<html><head><link rel="manifest" href="/manifest.json" /><link rel="preload" href="/_expo/static/css/a.css" as="style">' +
      '<link rel="stylesheet" href="/_expo/static/css/a.css"></head><body><script src="/_expo/static/js/web/entry-1.js" defer></script></body></html>',
  );
  put('manifest.json', '{}');
  put('_expo/static/css/a.css', 'body{}');
  put('_expo/static/js/web/entry-1.js', entry);
  put('_expo/static/js/web/chat-2.js', 'lazy');
  put('assets/node_modules/nunito/Nunito.abc.ttf', 'font');
  put('assets/assets/sounds/heart.wav', 'wav');
  put('icons/icon-192.png', 'png');
  put('splash/apple-splash-640-1136.png', 'png');
  return dist;
}

describe('T-83 scripts/build-sw.cjs', () => {
  it('AC-140 precache: shell (index.html, эхний JS/CSS), фонт, manifest, дүрс — lazy chunk, дуу, splash биш', () => {
    expect(precacheList(fakeDist()).map((e) => e.url)).toEqual([
      '/_expo/static/css/a.css',
      '/_expo/static/js/web/entry-1.js',
      '/assets/node_modules/nunito/Nunito.abc.ttf',
      '/icons/icon-192.png',
      '/index.html',
      '/manifest.json',
    ]);
  });

  it('агуулга өөрчлөгдөхөд хувилбар солигдоно (хөтөч шинэ SW суулгана) — ижил бол тогтмол', () => {
    const a = buildServiceWorker(fakeDist(), 'T');
    const b = buildServiceWorker(fakeDist(), 'T');
    const c = buildServiceWorker(fakeDist('console.log(2)'), 'T');
    expect(a.version).toBe(b.version);
    expect(c.version).not.toBe(a.version);
    expect(a.source).toContain(`self.__AURA_VERSION__ = "${a.version}";`);
    expect(a.source.endsWith('T')).toBe(true);
  });
});
