/**
 * AC-149 (§8.5): `docs/MANUAL-TEST.md` нь Spec-ийн шалгах арга нь «ГАР» агуулсан AC бүрийг
 * (AC ID · төхөөрөмж · урьдчилсан нөхцөл · алхам · хүлээгдэх үр дүн) нэг мөрөөр агуулна.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '../../..');

const cells = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());

/** Spec-ийн AC хүснэгтээс сүүлийн багана нь «ГАР» агуулсан мөрүүд. */
export function manualAcs(specMd: string): string[] {
  return specMd
    .split('\n')
    .filter((l) => /^\| AC-[A-Z0-9-]+ \|/.test(l))
    .map(cells)
    .filter((c) => /ГАР/.test(c[c.length - 1]))
    .map((c) => c[0]);
}

/** MANUAL-TEST.md-ийн мөр: AC ID → [төхөөрөмж, нөхцөл, алхам, үр дүн]. */
export function checklistRows(md: string): Map<string, string[]> {
  return new Map(
    md
      .split('\n')
      .filter((l) => /^\| AC-[A-Z0-9-]+ \|/.test(l))
      .map(cells)
      .map((c) => [c[0], c.slice(1, 5)] as const),
  );
}

describe('AC-149 docs/MANUAL-TEST.md', () => {
  const spec = fs.readFileSync(path.join(REPO, 'docs/LAB-2/spec.md'), 'utf8');
  const manual = fs.readFileSync(path.join(REPO, 'docs/MANUAL-TEST.md'), 'utf8');
  const required = manualAcs(spec);
  const rows = checklistRows(manual);

  it('Spec-д ГАР AC байгаа (задлагч ажилладаг)', () => {
    expect(required.length).toBeGreaterThan(15);
    expect(required).toEqual(expect.arrayContaining(['AC-12', 'AC-59', 'AC-60', 'AC-159']));
  });

  it('ГАР AC бүр жагсаалтад мөртэй', () => {
    expect(required.filter((id) => !rows.has(id))).toEqual([]);
  });

  it('мөр бүр төхөөрөмж, нөхцөл, алхам, хүлээгдэх үр дүнтэй; төхөөрөмж нь iPhone/Android/хөтөч', () => {
    const incomplete = required.filter((id) => {
      const r = rows.get(id);
      return !r || r.length < 4 || r.some((c) => c.length < 3);
    });
    expect(incomplete).toEqual([]);
    const noDevice = required.filter((id) => !/iPhone|Android|Desktop|хөтөч|Oracle/i.test(rows.get(id)?.[0] ?? ''));
    expect(noDevice).toEqual([]);
  });

  it('шалгагч дутуу AC-ийг барьдаг (өөрийгөө шалгах)', () => {
    const fake = manualAcs('| AC-1 | x | y | z | w | ГАР |\n| AC-2 | x | y | z | w | UT |\n| AC-3 | x | y | z | w | E2E + ГАР |');
    expect(fake).toEqual(['AC-1', 'AC-3']);
    const r = checklistRows('| AC-1 | iPhone | нөхцөл | алхам | үр дүн | |');
    expect(fake.filter((id) => !r.has(id))).toEqual(['AC-3']);
  });
});

/**
 * E2E-д «ГАР — docs/MANUAL-TEST.md» гэж алгассан хэсэг (жишээ ANIM-09) нь энэ жагсаалтад мөртэй байх ёстой —
 * үгүй бол автоматаар ч, гараар ч шалгагдахгүй үлдэнэ. Мөр нь `MANUAL-TEST.md`-г дурдсан e2e мөрийн ANIM/AC ID-ууд.
 */
export function manualReferences(sources: string[]): string[] {
  const ids = new Set<string>();
  for (const src of sources) {
    for (const line of src.split('\n')) {
      if (!line.includes('MANUAL-TEST.md')) continue;
      for (const m of line.matchAll(/\b(ANIM-\d{2}|AC-[A-Z0-9]+(?:-[0-9]+)?)\b/g)) ids.add(m[1]);
    }
  }
  return [...ids].sort();
}

/** Жагсаалтын мөрийн эхний нүдэнд ID байгаа эсэх (`| AC-214 · ANIM-09 |` г.м.). */
export function rowMentions(md: string, id: string): boolean {
  const re = new RegExp(`${id.replace(/-/g, '\-')}(?![0-9A-Za-z])`);
  return md.split('\n').some((l) => l.startsWith('| ') && re.test(l.split('|')[1] ?? ''));
}

describe('E2E-ийн гараар шалгах заалт docs/MANUAL-TEST.md-д мөртэй', () => {
  const dir = path.join(REPO, 'e2e/tests');
  const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const manual = fs.readFileSync(path.join(REPO, 'docs/MANUAL-TEST.md'), 'utf8');

  it('заасан ANIM/AC бүр жагсаалтын эхний нүдэнд', () => {
    const refs = manualReferences(sources);
    expect(refs).toEqual(expect.arrayContaining(['ANIM-09']));
    expect(refs.filter((id) => !rowMentions(manual, id))).toEqual([]);
  });

  it('шалгагч дутуу мөрийг барьдаг (өөрийгөө шалгах)', () => {
    const refs = manualReferences(["test.skip(true, 'ANIM-04: native-д ГАР — docs/MANUAL-TEST.md');"]);
    expect(refs).toEqual(['ANIM-04']);
    expect(rowMentions('| AC-214 · ANIM-09 | iPhone | a | b | c | |', 'ANIM-04')).toBe(false);
    expect(rowMentions('| AC-214 · ANIM-09 | iPhone | a | b | c | |', 'ANIM-09')).toBe(true);
  });
});
