import fs from 'fs';
import path from 'path';

/**
 * Хоосон төлөвийн товч бүр хаа нэг тийш хөтөлнө (AC-72): `onAction={() => {}}`,
 * `onPress={() => {}}` зэрэг юу ч хийдэггүй үйлдэл UI-д 0.
 */
const SRC = path.resolve(__dirname, '../..');
const NOOP = /\bon[A-Z]\w*=\{\s*\(\)\s*=>\s*(\{\s*\}|undefined|null)\s*\}/;

/**
 * Агуулга нь хараахан хийгдээгүй табын placeholder (S-40) — тухайн
 * нэгж дэлгэцээ хийхэд энэ жагсаалтаас хасна. Шинэ файл энд нэмэгдэхгүй.
 */
const PLACEHOLDERS = new Set(
  ['chat'].map((tab) => path.join('app', '(tabs)', tab, 'index.tsx')),
);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return /\.tsx$/.test(e.name) ? [p] : [];
  });
}

describe('AC-72 хоосон (no-op) үйлдлийн товч 0', () => {
  it('src/app ба src/components-д `onX={() => {}}` байхгүй', () => {
    const offenders = ['app', 'components']
      .flatMap((d) => walk(path.join(SRC, d)))
      .filter((f) => !PLACEHOLDERS.has(path.relative(SRC, f)))
      .flatMap((f) =>
        fs
          .readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => NOOP.test(line))
          .map(({ line, i }) => `${path.relative(SRC, f)}:${i + 1}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it('шалгагч барина', () => {
    expect(NOOP.test('<ScreenState kind="empty" onAction={() => {}} />')).toBe(true);
    expect(NOOP.test('<AppButton onPress={() => undefined} />')).toBe(true);
    expect(NOOP.test("<AppButton onPress={() => router.push('/plans')} />")).toBe(false);
  });
});
