import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * AC-211: автомат (UT · IT · E2E) AC бүр ID-аараа ≥ 1 тесттэй. Спекийн AC
 * хүснэгтийн сүүлийн багана нь шалгах арга.
 */
export interface SpecAc {
  id: string;
  method: string;
  automated: boolean;
}

export function parseSpecAcs(specMd: string): SpecAc[] {
  return specMd
    .split('\n')
    .filter((l) => /^\| AC-[A-Z0-9-]+ \|/.test(l))
    .map((l) => {
      const cells = l.split('|').map((c) => c.trim());
      const id = cells[1];
      const method = cells[cells.length - 2];
      return { id, method, automated: /\b(UT|IT|E2E)\b/.test(method) };
    });
}

/** Тестийн файл: jest, Playwright, JUnit, deploy-ийн shell тест (`*.test.sh`), k6-ийн ачааллын скрипт (`*.k6.js`). */
const TEST_FILE = /(\.test\.(ts|tsx|sh)|\.spec\.ts|IT\.java|Test\.java|\.k6\.js)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '.git', 'playwright-report', 'test-results']);

export function listTestFiles(root: string, dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (TEST_FILE.test(name)) out.push(p);
    }
  };
  dirs.forEach((d) => walk(join(root, d)));
  return out;
}

/** AC ID → түүнийг нэрлэсэн тестийн файлууд. `AC-1` нь `AC-10`-тай андуурагдахгүй. */
export function coverage(acs: SpecAc[], files: string[], root: string): Map<string, string[]> {
  const sources = files.map((f) => ({ f: relative(root, f), text: readFileSync(f, 'utf8') }));
  const map = new Map<string, string[]>();
  for (const ac of acs) {
    const re = new RegExp(`${ac.id.replace(/-/g, '\\-')}(?![0-9A-Za-z])`);
    map.set(
      ac.id,
      sources.filter((s) => re.test(s.text)).map((s) => s.f),
    );
  }
  return map;
}

/** Шалгах арга (spec-ийн сүүлийн багана дахь UT · IT · E2E) бүрийг аль хавтасны тест хангах вэ. */
export const METHOD_DIRS: Record<'UT' | 'IT' | 'E2E', string[]> = {
  // jest (mobile), JUnit-ийн unit тест, deploy-ийн shell тест
  UT: ['mobile/src', 'backend/src/test', 'deploy/tests'],
  // Testcontainers IT, deploy-ийн compose/backup тест, k6
  IT: ['backend/src/test', 'deploy/tests', 'load'],
  // Playwright — зөвхөн e2e/tests (UT/IT файл E2E-г орлохгүй)
  E2E: ['e2e/tests'],
};

/** Spec-ийн арга баганаас автомат аргууд: `IT + E2E` → `['IT', 'E2E']`; `ГАР`, `CR` орохгүй. */
export function methodsOf(method: string): Array<keyof typeof METHOD_DIRS> {
  return (['UT', 'IT', 'E2E'] as const).filter((m) => new RegExp(`\\b${m}\\b`).test(method));
}

/**
 * AC бүрийн арга тус бүр өөрийн хавтсанд ID-аараа тесттэй эсэх. Жишээ нь `IT + E2E` AC нь backend-ийн IT-д
 * ба `e2e/tests`-д хоёуланд нэрлэгдэх ёстой. Буцаах нь дутуу хос (`AC-33 (E2E)`).
 */
export function missingByMethod(acs: SpecAc[], filesByMethod: Record<string, string[]>, root: string): string[] {
  const missing: string[] = [];
  for (const m of Object.keys(filesByMethod)) {
    const subset = acs.filter((a) => (methodsOf(a.method) as string[]).includes(m));
    const map = coverage(subset, filesByMethod[m], root);
    for (const a of subset) if ((map.get(a.id) ?? []).length === 0) missing.push(`${a.id} (${m})`);
  }
  return missing;
}
