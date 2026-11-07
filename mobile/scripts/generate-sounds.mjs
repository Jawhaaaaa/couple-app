#!/usr/bin/env node
/**
 * Апп-ын зөөлөн дуунуудыг (FR-19.7) кодоор үүсгэнэ — гуравдагч этгээдийн дуу
 * ашиглахгүй тул лицензийн асуудалгүй («өөрийн бүтээсэн», docs/ASSETS.md).
 *   node scripts/generate-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
const RATE = 22050;

/** Нот: [эхлэх с, давтамж Гц, үргэлжлэх с, хүч]. */
const SOUNDS = {
  // Зүрхний «lub-dub» — хоёр намуухан цохилт
  heart: [
    [0, 110, 0.12, 0.9],
    [0.18, 98, 0.14, 0.7],
  ],
  // Хүлээн авах — хоёр нотын зөөлөн хонх
  chime: [
    [0, 880, 0.35, 0.5],
    [0.12, 1318.5, 0.45, 0.4],
  ],
  // Сонголт — богино «поп»
  pop: [[0, 660, 0.08, 0.5]],
  // Баяр — өсөх гурван нот
  success: [
    [0, 523.25, 0.25, 0.45],
    [0.1, 659.25, 0.25, 0.45],
    [0.2, 783.99, 0.4, 0.45],
  ],
};

function render(notes) {
  const length = Math.ceil(Math.max(...notes.map(([s, , d]) => s + d)) * RATE) + 1;
  const pcm = new Float32Array(length);
  for (const [start, freq, dur, amp] of notes) {
    const from = Math.floor(start * RATE);
    const n = Math.floor(dur * RATE);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const env = Math.min(1, i / (0.005 * RATE)) * Math.exp((-5 * t) / dur);
      pcm[from + i] += amp * env * Math.sin(2 * Math.PI * freq * t);
    }
  }
  const data = Buffer.alloc(length * 2);
  for (let i = 0; i < length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i] * 0.6)) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, notes] of Object.entries(SOUNDS)) {
  const wav = render(notes);
  writeFileSync(join(OUT, `${name}.wav`), wav);
  console.log(`үүсгэв: assets/sounds/${name}.wav (${wav.length} байт)`);
}
