import { basePalette, type ColorTokens, palettes, type ThemeMode } from '../tokens';

/** WCAG 2.x харьцангуй гэрэлтэлт. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Энгийн бичгийн хос — ≥ 4.5:1. */
const TEXT_PAIRS: [keyof ColorTokens, keyof ColorTokens][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surfaceRaised'],
  ['textMuted', 'bg'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceRaised'],
  ['onPrimary', 'primary'],
  ['onSecondary', 'secondary'],
];
/** Том гарчиг (Playfair Display 40, тоолуур) ба дүрс — ≥ 3:1. */
const LARGE_PAIRS: [keyof ColorTokens, keyof ColorTokens][] = [
  ['primary', 'bg'],
  ['primary', 'surface'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['danger', 'surface'],
];

const all: [string, Record<ThemeMode, ColorTokens>][] = [
  ['анхдагч', basePalette],
  ...Object.entries(palettes),
];

describe('AC-DS-01 палитрын contrast', () => {
  it('5 палитр (анхдагч + Коралл, Лаванда, Ой, Далай) × бараан/цайвар', () => {
    expect(all.map(([n]) => n)).toEqual(['анхдагч', 'CORAL', 'LAVENDER', 'FOREST', 'OCEAN']);
  });

  for (const [name, palette] of all) {
    for (const mode of ['dark', 'light'] as const) {
      const c = palette[mode];
      it.each(TEXT_PAIRS)(`${name}/${mode}: %s дээр %s ≥ 4.5:1`, (fg, bg) => {
        expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
      });
      it.each(LARGE_PAIRS)(`${name}/${mode}: том гарчиг/дүрс %s / %s ≥ 3:1`, (fg, bg) => {
        expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('бараан коралл дээр цагаан бичиг хориотой (3.0:1)', () => {
    expect(contrast('#FFFFFF', basePalette.dark.primary)).toBeLessThan(4.5);
    expect(basePalette.dark.onPrimary).not.toBe('#FFFFFF');
  });
});
