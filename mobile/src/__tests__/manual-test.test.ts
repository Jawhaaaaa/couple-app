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
