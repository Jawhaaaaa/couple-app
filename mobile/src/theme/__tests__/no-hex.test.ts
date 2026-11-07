import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const ALLOWED = new Set([path.join(SRC, 'theme', 'tokens.ts')]);
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z-])/;
const CODE = /\.(tsx?|jsx?|css)$/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'content' ? [] : walk(p);
    return CODE.test(e.name) ? [p] : [];
  });
}

describe('AC-DS-02 / AC-144 hex өнгө зөвхөн tokens.ts-д', () => {
  it('src/ доторх кодонд tokens.ts-ээс бусад файлд #RRGGBB = 0', () => {
    const offenders = walk(SRC)
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        fs
          .readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, line, i }))
          .filter(({ line }) => HEX.test(line))
          .map(({ f, i, line }) => `${path.relative(SRC, f)}:${i + 1}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it('шалгагч hex-ийг барьдаг (өөрийгөө шалгах)', () => {
    expect(HEX.test("color: '#E2847A'")).toBe(true);
    expect(HEX.test('#fff')).toBe(true);
    expect(HEX.test('id="#main-nav"')).toBe(false);
  });
});
