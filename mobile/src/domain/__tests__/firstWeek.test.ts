import fs from 'fs';
import path from 'path';

import data from '@/content/first-week.json';

import { FIRST_WEEK_DAYS, firstWeekAction, firstWeekContent } from '../firstWeek';

const APP = path.resolve(__dirname, '../../app');

/** Expo Router-ийн href → файл (бүлэг `(tabs)` г.м.-ийг тооцно): `/plans/library` → `(tabs)/plans/library.tsx`. */
function routeExists(href: string): boolean {
  const rel = href.replace(/^\//, '');
  const candidates = ['', '(tabs)', '(setup)', '(auth)', '(onboarding)'].flatMap((g) => [
    path.join(APP, g, `${rel}.tsx`),
    path.join(APP, g, rel, 'index.tsx'),
  ]);
  return candidates.some((f) => fs.existsSync(f));
}

describe('эхний 7 хоногийн даалгавар (FR-16.4)', () => {
  it('AC-134 өдөр бүрд (1–7) яг нэг даалгавар — mn ба en бичвэртэй', () => {
    const days = data.items.map((i) => i.day).sort((a, b) => a - b);
    expect(days).toEqual(Array.from({ length: FIRST_WEEK_DAYS }, (_, i) => i + 1));
    for (const item of data.items) {
      for (const locale of ['mn', 'en'] as const) {
        const c = firstWeekContent(item.id, locale, 'Ану');
        expect(c?.title).toBeTruthy();
        expect(c?.body).toBeTruthy();
      }
    }
  });

  it('AC-134 `{partner}` хамтрагчийн нэрээр (хоч) орлоно', () => {
    expect(firstWeekContent('fw-3', 'mn', 'Ану')?.body).toBe('Гэнэтхэн нэг зүрх илгээгээд Ану чинь хэрхэн баярлахыг хараарай.');
    expect(firstWeekContent('fw-3', 'en', 'Anu')?.body).toBe('Send a surprise heart and watch Anu light up.');
  });

  it('AC-134 даалгавар бүрийн товч бодит үүсгэх дэлгэц рүү (эсвэл зүрх) — хоосон үйлдэл 0', () => {
    for (const item of data.items) {
      const action = firstWeekAction(item.id);
      expect(action).not.toBeNull();
      if (action?.kind === 'route') expect([item.id, routeExists(String(action.href))]).toEqual([item.id, true]);
    }
    expect(firstWeekAction('fw-1')).toEqual({ kind: 'route', href: '/memory-editor' });
    expect(firstWeekAction('fw-3')).toEqual({ kind: 'heart' });
  });

  it('агуулгад байхгүй түлхүүрт хуурамч бичвэр/товч гаргахгүй', () => {
    expect(firstWeekContent('fw-99', 'mn', 'Ану')).toBeNull();
    expect(firstWeekAction('fw-99')).toBeNull();
  });
});
