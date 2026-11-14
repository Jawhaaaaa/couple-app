import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { coverage, listTestFiles, parseSpecAcs } from '../support/acCoverage';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/**
 * AC-211: автомат AC бүр ≥ 1 тесттэй. Хөгжүүлэлтийн явцад тайлан
 * (`test-results/ac-coverage.json`) гаргана; `AC_COVERAGE_STRICT=1` (эцсийн
 * шалгалт, T-94) үед дутуу AC байвал унана.
 */
test('AC-211 автомат AC бүр ID-аараа тесттэй', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-pixel7', 'Хөтчөөс хамаарахгүй — нэг л project-д');
  const acs = parseSpecAcs(readFileSync(`${REPO}docs/LAB-2/spec.md`, 'utf8'));
  expect(acs.length).toBeGreaterThan(200);
  const automated = acs.filter((a) => a.automated);
  const files = listTestFiles(REPO, ['backend/src/test', 'mobile/src', 'e2e/tests', 'deploy/tests', 'load']);
  const map = coverage(automated, files, REPO);
  const missing = automated.filter((a) => (map.get(a.id) ?? []).length === 0).map((a) => `${a.id} (${a.method})`);
  const report = {
    automated: automated.length,
    covered: automated.length - missing.length,
    missing,
  };
  writeFileSync(testInfo.outputPath('ac-coverage.json'), JSON.stringify(report, null, 2));
  console.log(`AC-211: ${report.covered}/${report.automated} автомат AC тесттэй`);
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
