import fs from 'fs';
import path from 'path';

/**
 * UI бичвэр i18n түлхүүрээр л (шаардлага §3.6, AC-135). JSX доторх шууд текст ба
 * хүнд харагдах prop-ын шууд мөрийг хайна. Код доторх техникийн мөр (testID,
 * route) хамаарахгүй.
 */
const SRC = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components'].map((d) => path.join(SRC, d));

const LETTER = '[A-Za-zА-Яа-яЁёӨөҮү]';
const JSX_TEXT = new RegExp(`>\\s*[^<>{}\\s]*${LETTER}[^<>{}]*<\\/`);
const PROP_TEXT = new RegExp(
  `\\b(accessibilityLabel|accessibilityHint|placeholder|title|label|alt|aria-label)=["']([^"']*${LETTER}[^"']*)["']`,
);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return /\.tsx$/.test(e.name) ? [p] : [];
  });
}

export function rawStrings(source: string): string[] {
  return source
    .split('\n')
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .filter(({ line }) => JSX_TEXT.test(line) || PROP_TEXT.test(line))
    .map(({ line, i }) => `${i + 1}: ${line.trim()}`);
}

describe('AC-135 i18n-гүй UI бичвэр байхгүй', () => {
  it('src/app ба src/components доторх .tsx-д шууд бичвэр 0', () => {
    const offenders = DIRS.flatMap(walk).flatMap((f) =>
      rawStrings(fs.readFileSync(f, 'utf8')).map((l) => `${path.relative(SRC, f)}:${l}`),
    );
    expect(offenders).toEqual([]);
  });

  it('шалгагч шууд бичвэрийг барьдаг', () => {
    expect(rawStrings('<Text>Сайн уу</Text>')).toHaveLength(1);
    expect(rawStrings('<AppText variant="h1">Hello</AppText>')).toHaveLength(1);
    expect(rawStrings('<Button accessibilityLabel="Илгээх" />')).toHaveLength(1);
    expect(rawStrings("<Text>{t('tabs.home')}</Text>")).toHaveLength(0);
    expect(rawStrings('<View testID="home-root" />')).toHaveLength(0);
  });
});
