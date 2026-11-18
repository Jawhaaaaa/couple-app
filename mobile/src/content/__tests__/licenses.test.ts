import fs from 'fs';

import licenses from '@/content/licenses.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildLicenses, ASSETS_MD } = require('../../../scripts/generate-licenses.cjs') as {
  buildLicenses: (md: string) => typeof licenses;
  ASSETS_MD: string;
};

type Item = (typeof licenses.groups)[number]['items'][number];
const all = (): Item[] => licenses.groups.flatMap((g) => g.items as Item[]);

describe('AC-AS-02 S-89 licenses.json нь docs/ASSETS.md-ээс үүссэн', () => {
  it('ASSETS.md-ээс дахин үүсгэхэд json яг таарна (`node mobile/scripts/generate-licenses.cjs`)', () => {
    expect(buildLicenses(fs.readFileSync(ASSETS_MD, 'utf8'))).toEqual(licenses);
  });

  it('шаардлагын attribution бүгд бий', () => {
    const notices = all().map((i) => i.notice);
    expect(notices).toContain('Animated Noto Emoji © Google, CC BY 4.0');
    expect(notices).toContain('Fluent Emoji 3D © Microsoft, MIT');
    expect(all().filter((i) => i.license === 'SIL OFL 1.1').length).toBeGreaterThanOrEqual(2);
    expect(notices.some((n) => n.includes('OpenStreetMap'))).toBe(true);
    expect(notices.some((n) => n.startsWith('Open-Meteo'))).toBe(true);
  });

  it('файлын тоо ASSETS.md-ийн asset мөрүүдтэй тэнцүү', () => {
    const md = fs.readFileSync(ASSETS_MD, 'utf8');
    const rows = md.split('\n').filter((l) => l.startsWith('| `')).length;
    const files = licenses.groups.find((g) => g.id === 'assets')!.items.reduce((n, i) => n + ((i as { files?: number }).files ?? 0), 0);
    expect(files).toBe(rows);
  });

  it('шалгагч ASSETS.md өөрчлөгдсөнийг барина', () => {
    const md = fs.readFileSync(ASSETS_MD, 'utf8').replace('| Open-Meteo |', '| Open-Meteo API |');
    expect(buildLicenses(md)).not.toEqual(licenses);
  });
});
