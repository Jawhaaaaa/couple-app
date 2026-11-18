#!/usr/bin/env node
// `npm audit --audit-level=high`-ийн орлуулга: high/critical advisory бүр унагана,
// зөвхөн `compliance.yaml → waivers`-д бүртгэлтэй, хугацаа нь дуусаагүй, засвартай хувилбаргүй
// advisory-г чөлөөлнө.
//
//   node scripts/audit-gate.mjs <npm-төслийн-хавтас> [compliance.yaml]
//
// Засвартай хувилбарыг GitHub Advisory API-аас шалгана (`GITHUB_TOKEN` байвал ашиглана).
// API хариу өгөхгүй бол чөлөөлөлт хүчингүй (fail closed).
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKING = new Set(['high', 'critical']);
const REQUIRED_FIELDS = ['id', 'reason', 'owner', 'expires'];

/** `compliance.yaml`-ийн `waivers:` жагсаалтыг уншина. Танихгүй бүтэц бол алдаа шиднэ. */
export function parseWaivers(text) {
  const waivers = [];
  let inWaivers = false;
  let current = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trimEnd();
    if (!line.trim()) return;
    if (/^\S/.test(line)) {
      inWaivers = line === 'waivers:';
      current = null;
      return;
    }
    if (!inWaivers) return;
    const m = line.match(/^\s+(-\s+)?([A-Za-z_]+):\s*(.*)$/);
    if (!m) throw new Error(`compliance.yaml:${i + 1}: танихгүй мөр: ${raw}`);
    if (m[1]) {
      current = {};
      waivers.push(current);
    } else if (!current) {
      throw new Error(`compliance.yaml:${i + 1}: «- id:»-гүй талбар`);
    }
    current[m[2]] = m[3].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  });
  for (const w of waivers) {
    for (const f of REQUIRED_FIELDS) {
      if (!w[f]) throw new Error(`compliance.yaml: ${w.id ?? '?'} чөлөөлөлтөд «${f}» талбар алга`);
    }
    if (!/^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/.test(w.id)) {
      throw new Error(`compliance.yaml: «${w.id}» нь GHSA id биш`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.expires) || Number.isNaN(Date.parse(`${w.expires}T00:00:00Z`))) {
      throw new Error(`compliance.yaml: ${w.id}-ийн expires «${w.expires}» нь YYYY-MM-DD биш`);
    }
  }
  return waivers;
}

/** `npm audit --json`-оос high/critical advisory-уудыг (GHSA id-аар) цуглуулна. */
export function blockingAdvisories(audit) {
  if (!audit || typeof audit.vulnerabilities !== 'object') {
    throw new Error(`npm audit-ийн хариу танигдсангүй: ${JSON.stringify(audit)?.slice(0, 300)}`);
  }
  const advisories = new Map();
  let blockingPackages = 0;
  for (const vuln of Object.values(audit.vulnerabilities)) {
    if (BLOCKING.has(vuln.severity)) blockingPackages += 1;
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const id = String(via.url ?? '').match(/GHSA(-[a-z0-9]{4}){3}/i)?.[0] ?? `npm-${via.source}`;
      const entry = advisories.get(id) ?? { id, severity: via.severity, packages: new Set(), title: via.title, range: via.range };
      entry.packages.add(via.name);
      advisories.set(id, entry);
    }
  }
  return { advisories: [...advisories.values()], blockingPackages };
}

function daysLeft(expires, today) {
  const end = Date.parse(`${expires}T00:00:00Z`) + 86_400_000; // тухайн өдрийг оруулаад
  return Math.ceil((end - today.getTime()) / 86_400_000);
}

/**
 * Шийдвэр гаргана. `patched(id)` нь засвартай хувилбарын жагсаалт (хоосон = засвар алга)
 * эсвэл алдаа шидэх (тодорхойгүй = чөлөөлөхгүй) функц.
 */
export async function evaluate({ audit, waivers, today = new Date(), patched }) {
  const { advisories, blockingPackages } = blockingAdvisories(audit);
  const byId = new Map(waivers.map((w) => [w.id.toLowerCase(), w]));
  const failures = [];
  const waived = [];
  for (const adv of advisories) {
    const pkgs = [...adv.packages].join(', ');
    const w = byId.get(adv.id.toLowerCase());
    if (!w) {
      failures.push(`${adv.severity.toUpperCase()} ${adv.id} (${pkgs}) — чөлөөлөлтгүй`);
      continue;
    }
    const left = daysLeft(w.expires, today);
    if (left <= 0) {
      failures.push(`${adv.severity.toUpperCase()} ${adv.id} (${pkgs}) — чөлөөлөлтийн хугацаа ${w.expires}-нд дууссан`);
      continue;
    }
    let fixes;
    try {
      fixes = await patched(adv.id);
    } catch (e) {
      failures.push(`${adv.severity.toUpperCase()} ${adv.id} (${pkgs}) — засвартай хувилбарыг шалгаж чадсангүй (${e.message}); чөлөөлөхгүй`);
      continue;
    }
    if (fixes.length > 0) {
      failures.push(`${adv.severity.toUpperCase()} ${adv.id} (${pkgs}) — засвартай хувилбар гарсан (${fixes.join(', ')}); чөлөөлөлт хүчингүй, хамаарлыг шинэчил`);
      continue;
    }
    waived.push(`${adv.id} (${pkgs}) — чөлөөлөгдсөн: эзэн ${w.owner}, дуусах ${w.expires} (${left} хоног үлдсэн), засвартай хувилбар алга`);
  }
  if (blockingPackages > 0 && advisories.length === 0) {
    failures.push(`${blockingPackages} багц high/critical боловч advisory нь танигдсангүй — npm audit-ийн хариуг шалга`);
  }
  const present = new Set(advisories.map((a) => a.id.toLowerCase()));
  const unused = waivers.filter((w) => !present.has(w.id.toLowerCase())).map((w) => w.id);
  return { ok: failures.length === 0, failures, waived, unused, blockingPackages };
}

/** GitHub Advisory API-аас npm-ийн засвартай хувилбаруудыг авна. */
export async function githubPatchedVersions(id, { token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'aura-audit-gate' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(`https://api.github.com/advisories/${id}`, { headers });
  if (!res.ok) throw new Error(`GitHub Advisory API ${res.status}`);
  const body = await res.json();
  return (body.vulnerabilities ?? [])
    .filter((v) => v.package?.ecosystem === 'npm' && v.first_patched_version)
    .map((v) => `${v.package.name}@${v.first_patched_version}`);
}

function runNpmAudit(dir) {
  try {
    const opts = { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] };
    // Windows-д npm нь .cmd тул shell-ээр (аргументгүй тогтмол команд)
    return process.platform === 'win32'
      ? execSync('npm audit --json', opts)
      : execFileSync('npm', ['audit', '--json'], opts);
  } catch (e) {
    // Эмзэг байдал олдвол npm audit 1-ээр гарна — stdout-ыг уншина
    if (e.stdout) return e.stdout;
    throw e;
  }
}

async function main() {
  const [dir, complianceArg] = process.argv.slice(2);
  if (!dir) {
    console.error('Хэрэглээ: node scripts/audit-gate.mjs <хавтас> [compliance.yaml]');
    process.exit(2);
  }
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const compliance = resolve(complianceArg ?? resolve(root, 'compliance.yaml'));
  const waivers = parseWaivers(readFileSync(compliance, 'utf8'));
  const audit = JSON.parse(runNpmAudit(resolve(dir)));
  const result = await evaluate({ audit, waivers, patched: (id) => githubPatchedVersions(id) });

  console.log(`npm audit (${dir}): ${JSON.stringify(audit.metadata?.vulnerabilities ?? {})}`);
  for (const line of result.waived) console.log(`::warning::ЧӨЛӨӨЛӨЛТ ${line}`);
  for (const id of result.unused) console.log(`::notice::${id} чөлөөлөлт ${dir}-д хэрэглэгдсэнгүй`);
  for (const line of result.failures) console.log(`::error::${line}`);
  console.log(result.ok
    ? `OK — ${dir}: чөлөөлөгдөөгүй high/critical advisory 0`
    : `УНАВ — ${dir}: ${result.failures.length} high/critical advisory`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`::error::audit-gate: ${e.message}`);
    process.exitCode = 1;
  });
}
