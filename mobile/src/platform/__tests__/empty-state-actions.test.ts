import fs from 'fs';
import path from 'path';

/**
 * Шинэ хосын хоосон төлөвийн товч зөв ҮҮСГЭХ дэлгэц рүү хөтөлдөг эсэх (FR-16.3, AC-57): дурсамж → S-32,
 * чат → S-40-ийн input (focus), төлөвлөгөө → S-54, хамтдаа → S-60-ийн үүсгэх товчнууд. Мөн S-12-ийн
 * «Эхний дурсамжаа нэмье» → S-32 (AC-188). Эх кодоос шалгана — товч бүрийн бодит даралт нь тухайн дэлгэцийн
 * тестэд (memories, plans, home).
 */
const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** `<ScreenState kind="empty" … onAction={X} />` мөрүүдийн `X`. */
function emptyActions(source: string): string[] {
  return source
    .split('\n')
    .filter((l) => l.includes('kind="empty"'))
    .map((l) => /onAction=\{(.+?)\}\s*\/>/.exec(l)?.[1] ?? '');
}

describe('AC-57 хоосон төлөвийн товч → үүсгэх дэлгэц', () => {
  it('AC-57 дурсамж (S-30) → S-32 memory-editor', () => {
    const src = read('app/(tabs)/memories/index.tsx');
    expect(src).toMatch(/const openEditor = \(\) => router\.push\('\/memory-editor'\)/);
    expect(emptyActions(src)).toContain('openEditor');
  });

  it('AC-57 чат (S-40) → мессежийн input-ийг focus (зүрх автоматаар илгээхгүй)', () => {
    const src = read('components/chat/ChatScreenView.tsx');
    expect(emptyActions(src)).toEqual(['() => inputRef.current?.focus()']);
    expect(src).toMatch(/inputRef=\{inputRef\}/);
    expect(read('components/chat/ChatComposer.tsx')).toMatch(/<TextInput\s+ref=\{inputRef\}/);
  });

  it('AC-57 төлөвлөгөө (S-50) → S-54 plans/new', () => {
    expect(emptyActions(read('components/plans/UpcomingPane.tsx'))).toEqual(["() => router.push('/plans/new')"]);
    expect(emptyActions(read('components/plans/CalendarView.tsx'))).toEqual(["() => router.push('/plans/new')"]);
  });

  it('AC-57 хамтдаа (S-60) хоосон үед үүсгэх дэлгэц рүү (захидал бичих, зорилго нэмэх)', () => {
    const hub = read('components/together/HubCards.tsx');
    expect(hub).toMatch(/router\.push\('\/together\/letters\/compose'\)/);
    expect(hub).toMatch(/router\.push\('\/together\/goals\/new'\)/);
  });

  it('AC-188 S-12 «Эхний дурсамжаа нэмье» → S-32 (дурсамжийн таб дээр)', () => {
    const src = read('app/(setup)/linked.tsx');
    expect(src).toMatch(/router\.replace\('\/memories'\);\s*router\.push\('\/memory-editor'\);/);
    expect(src).toMatch(/onPress=\{openFirstMemory\} testID="linked-first-memory"/);
  });
});
