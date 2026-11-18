// node --test scripts/audit-gate.test.mjs
// Чөлөөлөлт зөвхөн бүртгэлтэй ганц advisory-д, хугацаа дуусаагүй ба засваргүй үед л хүчинтэйг шалгана.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate, parseWaivers, githubPatchedVersions } from './audit-gate.mjs';

const PICO = 'GHSA-fc5q-39xc-vjpf';
const compliance = readFileSync(fileURLToPath(new URL('../compliance.yaml', import.meta.url)), 'utf8');
const waivers = parseWaivers(compliance);
const noFix = async () => [];

function advisory(name, ghsa, severity) {
  return { source: 1, name, title: `${name} bug`, url: `https://github.com/advisories/${ghsa}`, severity, range: '<=1.0.0' };
}

// npm audit --json-ийн бүтэц: шууд advisory (object) ба шууд бус хамаарал (string)
function audit(...advs) {
  const vulnerabilities = {};
  for (const a of advs) {
    vulnerabilities[a.name] = { name: a.name, severity: a.severity, via: [a] };
    vulnerabilities[`${a.name}-parent`] = { name: `${a.name}-parent`, severity: a.severity, via: [a.name] };
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: {} } };
}

const pico = advisory('picomatch', PICO, 'high');
const before = new Date('2026-11-18T12:00:00Z');

test('compliance.yaml: зөвхөн picomatch-ийн GHSA, эзэн ба хугацаатай', () => {
  assert.equal(waivers.length, 1);
  const [w] = waivers;
  assert.equal(w.id, PICO);
  assert.equal(w.owner, 'Jawhaaaaa');
  assert.equal(w.expires, '2026-12-18');
  assert.match(w.reason, /засвартай хувилбар алга/i);
  assert.match(w.reason, /355c35c/);
});

test('зөвхөн чөлөөлөгдсөн advisory байвал давна', async () => {
  const r = await evaluate({ audit: audit(pico), waivers, today: before, patched: noFix });
  assert.equal(r.ok, true, r.failures.join('\n'));
  assert.equal(r.waived.length, 1);
  assert.match(r.waived[0], /2026-12-18/);
});

test('өөр high advisory чөлөөлөгдсөнтэй хамт байвал унана', async () => {
  const other = advisory('lodash', 'GHSA-xxxx-yyyy-zzzz', 'high');
  const r = await evaluate({ audit: audit(pico, other), waivers, today: before, patched: noFix });
  assert.equal(r.ok, false);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /GHSA-xxxx-yyyy-zzzz/);
});

test('critical advisory унагана', async () => {
  const crit = advisory('tar', 'GHSA-aaaa-bbbb-cccc', 'critical');
  const r = await evaluate({ audit: audit(crit), waivers, today: before, patched: noFix });
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /CRITICAL/);
});

test('moderate advisory унагахгүй (--audit-level=high-тэй адил)', async () => {
  const mod = advisory('glob', 'GHSA-3g3m-2fjr-6pw4', 'moderate');
  const r = await evaluate({ audit: audit(mod), waivers, today: before, patched: noFix });
  assert.equal(r.ok, true);
});

test('дуусах өдөр (2026-12-18) хүртэл хүчинтэй, 12-19-нд унана', async () => {
  const last = await evaluate({ audit: audit(pico), waivers, today: new Date('2026-12-18T23:59:00Z'), patched: noFix });
  assert.equal(last.ok, true);
  const after = await evaluate({ audit: audit(pico), waivers, today: new Date('2026-12-19T00:00:00Z'), patched: noFix });
  assert.equal(after.ok, false);
  assert.match(after.failures[0], /хугацаа 2026-12-18-нд дууссан/);
});

test('засвартай хувилбар гармагц унана', async () => {
  const r = await evaluate({ audit: audit(pico), waivers, today: before, patched: async () => ['picomatch@4.0.8'] });
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /засвартай хувилбар гарсан \(picomatch@4\.0\.8\)/);
});

test('засварыг шалгаж чадахгүй бол чөлөөлөхгүй (fail closed)', async () => {
  const r = await evaluate({ audit: audit(pico), waivers, today: before, patched: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /шалгаж чадсангүй/);
});

test('танигдаагүй npm audit хариу алдаа шиднэ', async () => {
  await assert.rejects(evaluate({ audit: { error: { code: 'ENOLOCK' } }, waivers, today: before, patched: noFix }));
});

test('GitHub Advisory API: first_patched_version-ийг уншина', async () => {
  const fake = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });
  const none = { vulnerabilities: [{ package: { ecosystem: 'npm', name: 'picomatch' }, first_patched_version: null }] };
  assert.deepEqual(await githubPatchedVersions(PICO, { fetchImpl: fake(none), token: '' }), []);
  const fixed = { vulnerabilities: [{ package: { ecosystem: 'npm', name: 'picomatch' }, first_patched_version: '4.0.8' }] };
  assert.deepEqual(await githubPatchedVersions(PICO, { fetchImpl: fake(fixed), token: '' }), ['picomatch@4.0.8']);
  await assert.rejects(githubPatchedVersions(PICO, { fetchImpl: fake({}, false, 403), token: '' }), /403/);
});

test('parseWaivers: талбар дутуу эсвэл буруу огноо бол алдаа', () => {
  assert.throws(() => parseWaivers(`waivers:\n  - id: ${PICO}\n    owner: x\n    expires: 2026-12-18\n`), /reason/);
  assert.throws(() => parseWaivers(`waivers:\n  - id: ${PICO}\n    reason: r\n    owner: x\n    expires: 18/12/2026\n`), /YYYY-MM-DD/);
  assert.throws(() => parseWaivers(`waivers:\n  - id: CVE-2026-1\n    reason: r\n    owner: x\n    expires: 2026-12-18\n`), /GHSA/);
});
