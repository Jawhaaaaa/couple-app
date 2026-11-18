import fs from 'fs';
import path from 'path';

const MOBILE = path.resolve(__dirname, '../../..');
const ASSETS_MD = path.resolve(MOBILE, '../docs/ASSETS.md');
const ALLOWED_LICENSES = /CC BY 4\.0|MIT|SIL OFL|ISC|Apache-2\.0|CC0|Өөрийн бүтээсэн/;
const FORBIDDEN_BRANDS = /sanrio|hello ?kitty|disney|line friends|pok[eé]mon|kakao|my ?melody|kuromi|snoopy|pixar|marvel/i;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [path.relative(MOBILE, p).split(path.sep).join('/')];
  });
}

interface Row {
  file: string;
  name: string;
  source: string;
  license: string;
  where: string;
}

export function parseRegistry(md: string): Row[] {
  return md
    .split('\n')
    .filter((l) => l.startsWith('| `'))
    .map((l) => l.split('|').map((c) => c.trim()))
    .map(([, file, name, source, license, where]) => ({ file: file.replace(/`/g, ''), name, source, license, where }));
}

const rows = parseRegistry(fs.readFileSync(ASSETS_MD, 'utf8'));

describe('AC-AS-01 гуравдагч этгээдийн бүх asset docs/ASSETS.md-д бүртгэлтэй', () => {
  it('mobile/assets доторх файл бүр бүртгэлтэй', () => {
    const registered = new Set(rows.map((r) => r.file));
    const unregistered = walk(path.join(MOBILE, 'assets')).filter((f) => !registered.has(f));
    expect(unregistered).toEqual([]);
  });

  it('бүртгэлийн мөр бүр нэр · эх · лиценз · хаана талбартай, лиценз зөвшөөрөгдсөн', () => {
    const bad = rows.filter((r) => !r.name || !r.source || !r.where || !ALLOWED_LICENSES.test(r.license));
    expect(bad).toEqual([]);
  });

  it('бүртгэлд байгаа файл бодитоор байгаа', () => {
    const missing = rows.filter((r) => !fs.existsSync(path.join(MOBILE, r.file))).map((r) => r.file);
    expect(missing).toEqual([]);
  });

  it('fetch-assets.mjs-ийн бүх эх бүртгэлтэй', async () => {
    const src = fs.readFileSync(path.join(MOBILE, 'scripts/fetch-assets.mjs'), 'utf8');
    const names = [...src.matchAll(/^\s+'?([a-z0-9-]+)'?: '([^']+)',$/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(29);
    const files = new Set(rows.map((r) => r.file));
    const notRegistered = names.filter((n) => !files.has(`assets/lottie/noto/${n}.json`) && !files.has(`assets/fluent/${n}.png`));
    expect(notRegistered).toEqual([]);
  });

  it('шалгагч бүртгэлгүй файлыг барина', () => {
    const registered = new Set(parseRegistry('| `assets/a.png` | A | url | MIT | x |').map((r) => r.file));
    expect(['assets/a.png', 'assets/b.png'].filter((f) => !registered.has(f))).toEqual(['assets/b.png']);
  });
});

describe('AC-AS-03 брэнд/зохиогчийн эрхтэй дүр байхгүй', () => {
  it('asset-ийн нэр, эх URL-д брэнд дүр 0', () => {
    expect(rows.filter((r) => FORBIDDEN_BRANDS.test(`${r.file} ${r.name} ${r.source}`))).toEqual([]);
  });
});
