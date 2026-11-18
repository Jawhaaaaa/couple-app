#!/usr/bin/env node
/**
 * PWA-ийн дүрс ба iOS splash зургийг (FR-19.1, AC-152) кодоор үүсгэнэ — хамааралгүй (node:zlib-ээр
 * PNG бичнэ), гуравдагч этгээдийн зураг ашиглахгүй («өөрийн бүтээсэн»). Өнгө нь `src/theme/tokens.ts`-ийн
 * бараан палитрын `bg` ба Коралл `primary` — manifest-ийн `theme_color`-той ижил эх.
 *   node scripts/generate-pwa-icons.mjs
 * Гаралт: public/icons/*.png, public/splash/*.png (commit хийнэ; `public/index.html` эдгээрийг заана),
 * мөн native апп-ын дүрс ба splash — assets/images/*.png (`app.config.ts` заана, T-88).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/** tokens.ts-ээс `darkBase.bg` ба бараан Коралл `primary`-г уншина (өнгөний цорын ганц эх). */
function readTokens() {
  const src = readFileSync(join(ROOT, 'src/theme/tokens.ts'), 'utf8');
  const bg = src.match(/const darkBase = \{[^}]*?bg: '(#[0-9A-Fa-f]{6})'/s)?.[1];
  const primary = src.match(/basePalette[^=]*=\s*\{\s*dark:\s*\{[^}]*?primary: '(#[0-9A-Fa-f]{6})'/s)?.[1];
  if (!bg || !primary) throw new Error('tokens.ts-ээс bg/primary олдсонгүй');
  return { bg: hex(bg), primary: hex(primary) };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Зүрхний далд тэгшитгэл: (x² + y² − 1)³ − x²y³ ≤ 0 (y дээшээ). */
const inHeart = (x, y) => {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
};

/**
 * Дэвсгэр дээр төвд зүрх зурна. `scale` — зүрхний өргөн / зургийн богино тал.
 * Ирмэгийг 4×4 дэд цэгээр зөөллөнө.
 */
function render(width, height, scale, { bg, primary }) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) rgb.set(bg, i * 3);
  const unit = (Math.min(width, height) * scale) / 2.3; // зүрхний өргөн ≈ 2.3 нэгж
  const cx = width / 2;
  const cy = height / 2 + unit * 0.12; // харагдах төвийг тэнцүүлнэ
  const x0 = Math.max(0, Math.floor(cx - 1.2 * unit));
  const x1 = Math.min(width, Math.ceil(cx + 1.2 * unit));
  const y0 = Math.max(0, Math.floor(cy - 1.3 * unit));
  const y1 = Math.min(height, Math.ceil(cy + 1.1 * unit));
  const S = 4;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S - cx) / unit;
          const y = -(py + (sy + 0.5) / S - cy) / unit;
          if (inHeart(x, y)) hit++;
        }
      }
      if (!hit) continue;
      const a = hit / (S * S);
      const o = (py * width + px) * 3;
      for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(bg[c] * (1 - a) + primary[c] * a);
    }
  }
  return encodePng(width, height, rgb);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 8 бит RGB (color type 2), мөр бүрийн шүүлтүүр 0. */
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Дүрс: `any` — зүрх 62%; `maskable` — аюулгүй бүс (төвийн 80% тойрог) дотор 46%. */
const ICONS = [
  { file: 'icons/icon-192.png', size: 192, scale: 0.62 },
  { file: 'icons/icon-512.png', size: 512, scale: 0.62 },
  { file: 'icons/maskable-512.png', size: 512, scale: 0.46 },
  { file: 'icons/apple-touch-icon-180.png', size: 180, scale: 0.56 },
];

/** iPhone-ийн босоо splash (`apple-touch-startup-image`) — public/index.html-ийн media query-тэй тэнцүү. */
export const SPLASH = [
  [1320, 2868],
  [1206, 2622],
  [1290, 2796],
  [1179, 2556],
  [1284, 2778],
  [1170, 2532],
  [1125, 2436],
  [1242, 2688],
  [828, 1792],
  [1242, 2208],
  [750, 1334],
  [640, 1136],
];

/**
 * Native апп-ын дүрс (app.config.ts). `adaptive-icon` — Android adaptive icon-ий урд давхарга: системийн
 * маск 108 dp-ээс төвийн 66 dp-ийг л үлдээдэг тул зүрх 36%. Splash зураг `backgroundColor`-той ижил дэвсгэртэй.
 */
export const NATIVE = [
  { file: 'assets/images/icon.png', size: 1024, scale: 0.56 },
  { file: 'assets/images/adaptive-icon.png', size: 1024, scale: 0.36 },
  { file: 'assets/images/splash-icon.png', size: 512, scale: 0.9 },
  { file: 'assets/images/favicon.png', size: 48, scale: 0.7 },
];

const tokens = readTokens();
for (const { file, size, scale } of NATIVE) {
  mkdirSync(dirname(join(ROOT, file)), { recursive: true });
  writeFileSync(join(ROOT, file), render(size, size, scale, tokens));
  console.log(file);
}
mkdirSync(join(PUBLIC, 'icons'), { recursive: true });
mkdirSync(join(PUBLIC, 'splash'), { recursive: true });
for (const { file, size, scale } of ICONS) {
  writeFileSync(join(PUBLIC, file), render(size, size, scale, tokens));
  console.log(file);
}
for (const [w, h] of SPLASH) {
  const file = `splash/apple-splash-${w}-${h}.png`;
  writeFileSync(join(PUBLIC, file), render(w, h, 0.34, tokens));
  console.log(file);
}
