#!/usr/bin/env node
/**
 * `docs/ASSETS.md` → `mobile/src/content/licenses.json` (S-89 «Лиценз ба талархал», AC-AS-02).
 *
 *   node mobile/scripts/generate-licenses.cjs
 *
 * `licenses.test.ts` нь энэ функцээр дахин үүсгэж json-той тулгана — ASSETS.md өөрчлөгдөөд json
 * шинэчлэгдээгүй бол тест унана.
 */
/* global __dirname */
const fs = require('fs');
const path = require('path');

const MOBILE = path.resolve(__dirname, '..');
const ASSETS_MD = path.resolve(MOBILE, '../docs/ASSETS.md');
const OUT = path.join(MOBILE, 'src/content/licenses.json');

/** Олон файлтай asset-ийг гэр бүлээр нь нэгтгэнэ (нэг лиценз, нэг эх). */
const FAMILIES = [
  { test: (r) => /^Animated Noto Emoji/.test(r.name), name: 'Animated Noto Emoji', url: 'https://googlefonts.github.io/noto-emoji-animation/' },
  { test: (r) => /^Fluent Emoji/.test(r.name), name: 'Fluent Emoji 3D', url: 'https://github.com/microsoft/fluentui-emoji' },
  { test: (r) => r.source.includes('generate-sounds'), name: 'Aura UI sounds', url: null },
  { test: (r) => r.source.includes('generate-pwa-icons'), name: 'Aura app icon & splash', url: null },
  { test: (r) => r.source.includes('create-expo-app'), name: 'create-expo-app template', url: 'https://github.com/expo/expo/tree/main/templates' },
];

const cells = (line) =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

/** `## Гарчиг` → тэр хэсгийн хүснэгтийн мөрүүд (толгой ба `---`-гүй). */
function sections(md) {
  const out = {};
  let current = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      current = line.slice(3).trim();
      out[current] = [];
    } else if (current && line.startsWith('|') && !/^\|\s*-/.test(line)) {
      out[current].push(cells(line));
    }
  }
  // Эхний мөр нь толгой
  for (const key of Object.keys(out)) out[key] = out[key].slice(1);
  return out;
}

const clean = (s) => s.replace(/`/g, '');
const firstUrl = (s) => (s.match(/https?:\/\/[^\s·]+/) || [null])[0];

/** «CC BY 4.0 © Google» → { license: 'CC BY 4.0', holder: 'Google' }. */
function splitLicense(text) {
  const [license, holder] = text.split('©').map((s) => s.trim());
  return { license, holder: holder || null };
}

function item(name, licenseText, url, extra = {}) {
  const { license, holder } = splitLicense(licenseText);
  const notice = holder ? `${name} © ${holder}, ${license}` : `${name} — ${license}`;
  return { name, license, holder, notice, url, ...extra };
}

function buildLicenses(md) {
  const s = sections(md);
  const assetRows = (s['Файл тус бүр'] || []).map(([file, name, source, license]) => ({ file, name, source, license }));
  const families = new Map();
  for (const row of assetRows) {
    const family = FAMILIES.find((f) => f.test(row));
    const key = family ? family.name : row.name;
    const prev = families.get(key);
    if (prev) {
      if (prev.licenseText !== row.license) throw new Error(`${key}: лиценз зөрж байна (${prev.licenseText} ≠ ${row.license})`);
      prev.files += 1;
    } else {
      families.set(key, { name: key, licenseText: row.license, url: family ? family.url : firstUrl(row.source), files: 1 });
    }
  }
  const assets = [...families.values()].map((f) => item(f.name, f.licenseText, f.url, { files: f.files }));
  const table = (title) => (s[title] || []).map(([name, source, license]) => item(clean(name), license, firstUrl(source)));
  return {
    source: 'docs/ASSETS.md',
    groups: [
      { id: 'assets', items: assets },
      { id: 'libraries', items: table('Фонт ба нээлттэй эхийн сан') },
      { id: 'data', items: table('Газрын зураг ба цаг агаарын өгөгдөл') },
    ],
  };
}

function render(md) {
  return `${JSON.stringify(buildLicenses(md), null, 2)}\n`;
}

module.exports = { buildLicenses, render, ASSETS_MD, OUT };

if (require.main === module) {
  fs.writeFileSync(OUT, render(fs.readFileSync(ASSETS_MD, 'utf8')));
  console.log(`✓ ${path.relative(process.cwd(), OUT)}`);
}
