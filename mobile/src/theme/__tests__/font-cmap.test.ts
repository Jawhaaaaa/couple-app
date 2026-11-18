import fs from 'fs';
import path from 'path';

import { fontAssets, fontFamily } from '../typography';

/** TrueType `cmap`-ын format 4 ба 12 хүснэгтээс тэмдэгт байгаа эсэхийг уншина. */
function codepoints(file: string): Set<number> {
  const buf = fs.readFileSync(file);
  const numTables = buf.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmapOffset = buf.readUInt32BE(rec + 8);
  }
  if (cmapOffset < 0) throw new Error(`${file}: cmap алга`);
  const out = new Set<number>();
  const n = buf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < n; i++) {
    const sub = cmapOffset + buf.readUInt32BE(cmapOffset + 4 + i * 8 + 4);
    const format = buf.readUInt16BE(sub);
    if (format === 4) {
      const segX2 = buf.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = buf.readUInt16BE(ends + s * 2);
        const start = buf.readUInt16BE(starts + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) out.add(c);
      }
    } else if (format === 12) {
      const groups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const start = buf.readUInt32BE(sub + 16 + g * 12);
        const end = buf.readUInt32BE(sub + 20 + g * 12);
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return out;
}

const FONTS_DIR = path.resolve(__dirname, '../../../node_modules/@expo-google-fonts');
const files: Record<string, string> = {
  PlayfairDisplay_400Regular: 'playfair-display/400Regular/PlayfairDisplay_400Regular.ttf',
  PlayfairDisplay_400Regular_Italic: 'playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf',
  Nunito_400Regular: 'nunito/400Regular/Nunito_400Regular.ttf',
  Nunito_600SemiBold: 'nunito/600SemiBold/Nunito_600SemiBold.ttf',
  Nunito_700Bold: 'nunito/700Bold/Nunito_700Bold.ttf',
};

const SAMPLE = 'Өнөөдөр Үүрийн гэгээ';
const CYRILLIC_MN = 'АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмноөпрстуүфхцчшщъыьэюя';

describe('AC-DS-04 фонтод монгол кирилл бүрэн', () => {
  it('ашигласан бүх жин багцлагдсан бөгөөд шалгагдана', () => {
    expect(Object.keys(fontAssets).sort()).toEqual(Object.values(fontFamily).sort());
    expect(Object.keys(files).sort()).toEqual(Object.keys(fontAssets).sort());
  });

  it.each(Object.entries(files))('%s: «Өнөөдөр Үүрийн гэгээ» fallback-гүй', (_name, rel) => {
    const cmap = codepoints(path.join(FONTS_DIR, rel));
    const missing = [...SAMPLE, ...CYRILLIC_MN].filter((ch) => ch !== ' ' && !cmap.has(ch.codePointAt(0)!));
    expect(missing).toEqual([]);
  });
});
