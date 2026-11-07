#!/usr/bin/env node
/**
 * Гуравдагч этгээдийн asset-ийг build үед татна (шаардлага §3.5): апп runtime-д
 * сүлжээнээс татахгүй. Татсан файл `assets/`-д commit хийгдэнэ — build сүлжээгүй ч
 * давтагдана. Шинэ asset нэмбэл `docs/ASSETS.md`-д бүртгэнэ (AC-AS-01).
 *
 *   node scripts/fetch-assets.mjs          # байхгүйг татна
 *   node scripts/fetch-assets.mjs --force  # бүгдийг дахин татна
 *   node scripts/fetch-assets.mjs --check  # бүгд байгаа эсэхийг шалгана (татахгүй)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NOTO = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
const FLUENT = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';

/** Google Noto Animated Emoji (CC BY 4.0). */
export const NOTO_LOTTIE = {
  'red-heart': '2764',
  'growing-heart': '1f497',
  'smiling-hearts': '1f970',
  'heart-eyes': '1f60d',
  'kiss': '1f618',
  'hug': '1f917',
  'sparkles': '2728',
  'love-letter': '1f48c',
  'joy': '1f602',
  'wow': '1f62e',
  'sad': '1f622',
  'mood-1': '1f622',
  'mood-2': '1f615',
  'mood-3': '1f610',
  'mood-4': '1f642',
  'mood-5': '1f604',
};

/**
 * Microsoft Fluent Emoji 3D (MIT). 🌙 ба ☀️-ийн Noto animated хувилбар байхгүй
 * (2026-11-07-нд 404) тул статик Fluent дүрсээр орлуулав.
 */
export const FLUENT_3D = {
  bear: 'Bear/3D/bear_3d.png',
  'birthday-cake': 'Birthday cake/3D/birthday_cake_3d.png',
  ring: 'Ring/3D/ring_3d.png',
  airplane: 'Airplane/3D/airplane_3d.png',
  house: 'House/3D/house_3d.png',
  gift: 'Wrapped gift/3D/wrapped_gift_3d.png',
  'cherry-blossom': 'Cherry blossom/3D/cherry_blossom_3d.png',
  'fork-knife-plate': 'Fork and knife with plate/3D/fork_and_knife_with_plate_3d.png',
  'clapper-board': 'Clapper board/3D/clapper_board_3d.png',
  books: 'Books/3D/books_3d.png',
  mountain: 'Snow-capped mountain/3D/snow-capped_mountain_3d.png',
  moon: 'Crescent moon/3D/crescent_moon_3d.png',
  sun: 'Sun/3D/sun_3d.png',
};

export function plan() {
  return [
    ...Object.entries(NOTO_LOTTIE).map(([name, cp]) => ({
      url: `${NOTO}/${cp}/lottie.json`,
      file: `assets/lottie/noto/${name}.json`,
    })),
    ...Object.entries(FLUENT_3D).map(([name, path]) => ({
      url: `${FLUENT}/${encodeURI(path)}`,
      file: `assets/fluent/${name}.png`,
    })),
  ];
}

async function main() {
  const force = process.argv.includes('--force');
  const check = process.argv.includes('--check');
  const missing = [];
  for (const { url, file } of plan()) {
    const target = join(ROOT, file);
    if (existsSync(target) && !force) continue;
    if (check) {
      missing.push(file);
      continue;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (file.endsWith('.json')) JSON.parse(body.toString('utf8'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    console.log(`татав: ${file} (${body.length} байт)`);
  }
  if (missing.length) {
    console.error(`дутуу asset:\n${missing.join('\n')}\n→ node scripts/fetch-assets.mjs`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
