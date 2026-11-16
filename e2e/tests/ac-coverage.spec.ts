import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { METHOD_DIRS, listTestFiles, missingByMethod, parseSpecAcs } from '../support/acCoverage';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/**
 * AC-211: автомат AC бүр spec-д заасан арга тус бүрээр ≥ 1 тесттэй — `E2E` AC нь `e2e/tests`-д,
 * `IT` нь backend/deploy/load-ийн тестэд, `UT` нь jest/JUnit-д ID-аараа (`METHOD_DIRS`). Нэг аргын
 * тест нөгөөг орлохгүй (жишээ нь RNTL тест E2E-г хангахгүй). Тайлан `test-results/ac-coverage.json`;
 * `AC_COVERAGE_STRICT=1` (CI) үед дутуу хос байвал унана.
 */
test('AC-211 автомат AC бүр ID-аараа тесттэй', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-pixel7', 'Хөтчөөс хамаарахгүй — нэг л project-д');
  const acs = parseSpecAcs(readFileSync(`${REPO}docs/LAB-2/spec.md`, 'utf8'));
  expect(acs.length).toBeGreaterThan(200);
  const automated = acs.filter((a) => a.automated);
  const filesByMethod = Object.fromEntries(
    Object.entries(METHOD_DIRS).map(([m, dirs]) => [m, listTestFiles(REPO, dirs)]),
  );
  const missing = missingByMethod(automated, filesByMethod, REPO);
  const incomplete = new Set(missing.map((m) => m.split(' ')[0]));
  const report = {
    automated: automated.length,
    covered: automated.length - incomplete.size,
    missing,
  };
  writeFileSync(testInfo.outputPath('ac-coverage.json'), JSON.stringify(report, null, 2));
  console.log(`AC-211: ${report.covered}/${report.automated} автомат AC арга бүрээрээ тесттэй`);
  if (process.env.AC_COVERAGE_STRICT === '1') expect(missing).toEqual([]);
  else expect(report.covered).toBeGreaterThan(0);
});

test('AC-211 шалгагч AC-1-ийг AC-10-тай андуурахгүй', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-pixel7', 'Нэг л project-д');
  const acs = parseSpecAcs('| AC-1 | x | y | UT |\n| AC-10 | x | y | ГАР |');
  expect(acs).toEqual([
    { id: 'AC-1', method: 'UT', automated: true },
    { id: 'AC-10', method: 'ГАР', automated: false },
  ]);
});

test('AC-211 E2E AC-ийг зөвхөн jest/IT файл хангахгүй', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-pixel7', 'Нэг л project-д');
  const dir = testInfo.outputPath('fake');
  mkdirSync(`${dir}/mobile/src`, { recursive: true });
  mkdirSync(`${dir}/e2e/tests`, { recursive: true });
  writeFileSync(`${dir}/mobile/src/x.test.tsx`, "it('AC-7 AC-8', () => {});");
  writeFileSync(`${dir}/e2e/tests/y.spec.ts`, "test('AC-8', () => {});");
  const acs = parseSpecAcs(['| AC-7 | x | y | UT + E2E |', '| AC-8 | x | y | UT + E2E |', '| AC-9 | x | y | ГАР |'].join('\n'));
  const files = Object.fromEntries(Object.entries(METHOD_DIRS).map(([m, dirs]) => [m, listTestFiles(dir, dirs)]));
  expect(missingByMethod(acs.filter((a) => a.automated), files, dir)).toEqual(['AC-7 (E2E)']);
});
