import { buildMemoryQuery, hasActiveFilters, searchFilters, trashDaysLeft } from '@/api/queries/memories';
import { i18n, possessive } from '@/i18n';
import { addTag, applyExif, applyPrefill, buildCreateBody, buildUpdateBody, draftPlace, parseDraftParam, validateDraft } from '@/memories/editorModel';
import { exifCoordinate, exifDate, readExif, suggestFromAssets } from '@/memories/exif';
import { admitPicks, MEDIA_MAX, resizeTarget, VIDEO_MAX_MS } from '@/memories/limits';
import { applyReaction, nextReaction } from '@/memories/reactions';
import { groupByMonth, monthLabel } from '@/memories/timeline';
import { emptyDraft } from '@/stores/draftStore';

import { summary } from '../../../test/memoryFixtures';

describe('AC-80 timeline сараар бүлэглэх', () => {
  it('серверийн эрэмбээр сар бүрд нэг хэсэг, толгойн тоо /memories/months-оос', () => {
    const items = [
      summary('a', { occurredOn: '2026-11-07' }),
      summary('b', { occurredOn: '2026-11-01' }),
      summary('c', { occurredOn: '2026-10-20' }),
    ];
    const sections = groupByMonth(items, [
      { year: 2026, month: 11, count: 2 },
      { year: 2026, month: 10, count: 14 },
    ]);
    expect(sections.map((s) => [s.key, s.count, s.data.map((m) => m.id)])).toEqual([
      ['2026-11', 2, ['a', 'b']],
      ['2026-10', 14, ['c']],
    ]);
  });

  it('months байхгүй бол ачаалсан тоо', () => {
    expect(groupByMonth([summary('a'), summary('b')], undefined)[0].count).toBe(2);
  });

  it('толгойн бичвэр «2026 оны 11 сар · 2 дурсамж»', () => {
    const mn = i18n.getFixedT('mn');
    const en = i18n.getFixedT('en');
    expect(mn('memories.timeline.month', { year: 2026, month: monthLabel(11, 'mn'), count: 2 })).toBe('2026 оны 11 сар · 2 дурсамж');
    expect(en('memories.timeline.month', { year: 2026, month: monthLabel(11, 'en'), count: 1 })).toBe('November 2026 · 1 memory');
  });
});

describe('AC-175 хайлтын шүүлтүүр → query', () => {
  it('хоосон, false, буруу огноог хасаж, хослуулсан шүүлтийг үлдээнэ', () => {
    expect(
      searchFilters({ q: '  аялал ', from: '2025-01-01', to: '2025-1', tag: 'уул', groupId: 'g1', author: 'partner', favorite: true, hasLocation: false, place: '' }),
    ).toEqual({ q: 'аялал', from: '2025-01-01', tag: 'уул', groupId: 'g1', author: 'partner', favorite: true });
  });

  it('нэг нэгээр', () => {
    expect(buildMemoryQuery({ scope: 'private' })).toEqual({ scope: 'private' });
    expect(buildMemoryQuery({ place: 'Хустай' })).toEqual({ place: 'Хустай' });
    expect(hasActiveFilters({ q: '   ' })).toBe(false);
    expect(hasActiveFilters({ favorite: true })).toBe(true);
  });
});

describe('AC-79 EXIF-ийн санал', () => {
  const android = { DateTimeOriginal: '2025:07:12 14:30:00', GPSLatitude: 47.918, GPSLatitudeRef: 'N', GPSLongitude: 106.917, GPSLongitudeRef: 'E' };
  const ios = {
    '{Exif}': { DateTimeOriginal: '2025:07:12 14:30:00' },
    '{GPS}': { Latitude: '47/1,55/1,48/1', LatitudeRef: 'N', Longitude: [106, 55, 1], LongitudeRef: 'E' },
  };

  it('Android (хавтгай) ба iOS (дэд объект) хоёуланг уншина', () => {
    expect(readExif(android)).toEqual({ occurredOn: '2025-07-12', location: { lat: 47.918, lon: 106.917 } });
    const fromIos = readExif(ios);
    expect(fromIos.occurredOn).toBe('2025-07-12');
    expect(fromIos.location?.lat).toBeCloseTo(47.93, 2);
    expect(fromIos.location?.lon).toBeCloseTo(106.9169, 3);
  });

  it('S/W тэмдэг сөрөг; 0,0 ба буруу утга хасагдана', () => {
    expect(readExif({ GPSLatitude: 33.9, GPSLatitudeRef: 'S', GPSLongitude: 18.4, GPSLongitudeRef: 'W' }).location).toEqual({ lat: -33.9, lon: -18.4 });
    expect(readExif({ GPSLatitude: 0, GPSLongitude: 0 }).location).toBeNull();
    expect(exifDate('0000:00:00 00:00:00')).toBeNull();
    expect(exifCoordinate('abc')).toBeNull();
    expect(readExif(null)).toEqual({ occurredOn: null, location: null });
  });

  it('олон зурагнаас эхний огноо ба эхний байршил', () => {
    expect(suggestFromAssets([{ exif: null }, { exif: { DateTimeOriginal: '2024:01:02 00:00:00' } }, { exif: android }])).toEqual({
      occurredOn: '2024-01-02',
      location: { lat: 47.918, lon: 106.917 },
    });
  });

  it('гараар засаагүй талбарыг л бөглөж «EXIF» эх тэмдэглэнэ', () => {
    const draft = emptyDraft('2026-11-07');
    const filled = applyExif(draft, readExif(android));
    expect(filled).toMatchObject({ occurredOn: '2025-07-12', dateSource: 'EXIF', lat: '47.918', lon: '106.917', locationSource: 'EXIF' });
    expect(filled.placeName).toBe('47.91800, 106.91700');
    const touched = applyExif({ ...draft, occurredOn: '2026-01-01', dateTouched: true }, readExif(android));
    expect(touched).toMatchObject({ occurredOn: '2026-01-01', dateSource: 'MANUAL' });
  });
});

describe('AC-172 S-32-ийн хязгаар', () => {
  const photo = (name: string) => ({ name, kind: 'image' as const });
  it('61 с ба 201 MB видео, 21 дэх файл шалтгаантай татгалзана', () => {
    const picks = [
      { name: 'long.mp4', kind: 'video' as const, durationMs: VIDEO_MAX_MS + 1000, sizeBytes: 10 },
      { name: 'big.mp4', kind: 'video' as const, durationMs: 10_000, sizeBytes: 201 * 1024 * 1024 },
      { name: 'ok.mp4', kind: 'video' as const, durationMs: 59_000, sizeBytes: 50 * 1024 * 1024 },
      photo('a.jpg'),
      photo('b.jpg'),
      { name: 'doc.pdf', kind: null },
    ];
    const { accepted, rejected } = admitPicks(MEDIA_MAX - 2, picks);
    expect(accepted.map((p) => p.name)).toEqual(['ok.mp4', 'a.jpg']);
    expect(rejected).toEqual([
      { name: 'long.mp4', reason: 'VIDEO_TOO_LONG' },
      { name: 'big.mp4', reason: 'VIDEO_TOO_LARGE' },
      { name: 'b.jpg', reason: 'TOO_MANY' },
      { name: 'doc.pdf', reason: 'TYPE' },
    ]);
  });

  it('4000 px зураг урт тал 2560 болно; багтаж байвал хэвээр', () => {
    expect(resizeTarget(4000, 3000)).toEqual({ width: 2560, height: 1920 });
    expect(resizeTarget(3000, 4000)).toEqual({ width: 1920, height: 2560 });
    expect(resizeTarget(2560, 1000)).toBeNull();
  });
});

describe('S-32 ноорог → гэрээний бие', () => {
  const base = { ...emptyDraft('2026-11-07'), clientId: 'c-1', title: '  Анхны аялал ', tags: ['аялал'], groupIds: ['g1'] };
  const withMedia = { ...base, media: [{ key: 'k', localId: 'l', mediaId: null, previewUri: null, kind: 'image' as const, name: 'a.jpg', altText: ' Нуур ' }] };

  it('POST /memories: clientId, тайрсан гарчиг, alt, байршилгүй бол NONE', () => {
    expect(buildCreateBody(withMedia, ['m1'])).toEqual({
      clientId: 'c-1',
      title: 'Анхны аялал',
      occurredOn: '2026-11-07',
      dateSource: 'MANUAL',
      locationSource: 'NONE',
      tags: ['аялал'],
      groupIds: ['g1'],
      media: [{ mediaId: 'm1', altText: 'Нуур' }],
    });
  });

  it('PATCH: version ба байршил null-аар арилна', () => {
    expect(buildUpdateBody(withMedia, ['m1'], 4)).toMatchObject({ version: 4, location: null, description: null, locationSource: 'NONE' });
  });

  it('шалгалт: гарчиг, огноо, медиа, дутуу байршил', () => {
    expect(validateDraft({ ...base, title: ' ', occurredOn: '2026-13-01', placeName: 'Хустай' })).toEqual(['TITLE', 'DATE', 'MEDIA', 'LOCATION']);
    expect(draftPlace({ ...base, placeName: 'Хустай', lat: '47,8', lon: '106' })).toEqual({ name: 'Хустай', lat: 47.8, lon: 106 });
  });

  it('?draft= чат/болзооноос бөглөнө (AC-91, AC-95); эвдэрсэн бол үл тооно', () => {
    const prefill = parseDraftParam(JSON.stringify({ title: 'Кино', occurredOn: '2026-10-03', place: { name: 'Өргөө', lat: 47.9, lon: 106.9 }, description: 'Шөнийн кино' }));
    expect(applyPrefill(emptyDraft('2026-11-07'), prefill)).toMatchObject({ title: 'Кино', occurredOn: '2026-10-03', placeName: 'Өргөө', lat: '47.9', description: 'Шөнийн кино' });
    expect(parseDraftParam('{bad')).toBeNull();
  });

  it('шошго давхардахгүй, # хасна', () => {
    expect(addTag(addTag([], '#Аялал'), 'аялал')).toEqual(['Аялал']);
  });
});

describe('AC-23 хогийн савны үлдсэн хоног', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  it('серверийн daysLeft эсвэл purgeAfter-аас', () => {
    expect(trashDaysLeft({ daysLeft: 29, purgeAfter: '2026-12-06T12:00:00Z' }, now)).toBe(29);
    expect(trashDaysLeft({ purgeAfter: '2026-11-09T11:00:00Z' }, now)).toBe(2);
    expect(trashDaysLeft({ purgeAfter: '2026-11-01T00:00:00Z' }, now)).toBe(0);
  });
});

describe('AC-174 нэрийн харьяалах тийн', () => {
  it('«Анугийн», «Батын», «Доржийн», «Сүхийн»; англиар «Anu’s»', () => {
    expect(possessive('Ану', 'mn')).toBe('Анугийн');
    expect(possessive('Бат', 'mn')).toBe('Батын');
    expect(possessive('Дорж', 'mn')).toBe('Доржийн');
    expect(possessive('Сүх', 'mn')).toBe('Сүхийн');
    expect(possessive('Тэмүүлэн', 'mn')).toBe('Тэмүүлэнгийн');
    expect(possessive('Anu', 'en')).toBe("Anu's");
  });

  it('бичвэр «Анугийн 2 сэтгэгдэл хамт устна»', () => {
    expect(i18n.getFixedT('mn')('memories.delete.partnerComments', { owner: possessive('Ану', 'mn'), count: 2 })).toBe('Анугийн 2 сэтгэгдэл хамт устна');
  });
});

describe('AC-173 реакц', () => {
  it('товшилт ❤️ тавих/болих; ижлийг дахин сонговол болино', () => {
    expect(nextReaction(null, 'TOGGLE')).toBe('LOVE');
    expect(nextReaction('HUG', 'TOGGLE')).toBeNull();
    expect(nextReaction('HUG', 'HUG')).toBeNull();
    expect(nextReaction('HUG', 'KISS')).toBe('KISS');
  });

  it('optimistic тоолуур', () => {
    const before = [{ emoji: 'LOVE' as const, count: 2, userIds: ['me', 'p'], mine: true }];
    expect(applyReaction(before, 'me', 'KISS')).toEqual([
      { emoji: 'LOVE', count: 1, userIds: ['p'], mine: false },
      { emoji: 'KISS', count: 1, userIds: ['me'], mine: true },
    ]);
    expect(applyReaction(before, 'me', null)).toEqual([{ emoji: 'LOVE', count: 1, userIds: ['p'], mine: false }]);
  });
});
