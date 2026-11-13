/** Дуут мессежийн дээд урт (FR-6.1, AC-32): 5 минут — хүрмэгц автоматаар зогсож илгээнэ. */
export const VOICE_MAX_MS = 5 * 60 * 1000;
/** Хэт богино (санамсаргүй товшилт) бичлэгийг илгээхгүй. */
export const VOICE_MIN_MS = 700;
/** ANIM-23-ын амьд долгионы баганын тоо. */
export const LIVE_BARS = 32;
/** Гулсуулж цуцлах / дээш түлхэж түгжих босго (px). */
export const CANCEL_DX = -100;
export const LOCK_DY = -70;

/** `m:ss` (AC-32-ын урт). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** expo-audio-гийн metering (dBFS, ≈ −160…0) → 0…1. Ихэнх яриа −50…−10 dB-д байдаг. */
export function meteringToLevel(db: number | undefined | null): number {
  if (db === undefined || db === null || !Number.isFinite(db)) return 0.05;
  return Math.min(1, Math.max(0.05, (db + 55) / 50));
}

export function pushLevel(levels: number[], level: number, max = LIVE_BARS): number[] {
  const next = [...levels, level];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Бичлэгийн MIME → өргөтгөл (сервер нэг формат руу хөрвүүлнэ — AudioTranscodeJob). */
export function voiceFileName(mime: string, at: Date = new Date()): string {
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'm4a';
  return `voice-${at.toISOString().replace(/[:.]/g, '-')}.${ext}`;
}

/** Тоглуулах явц (0…1) — долгионы аль баганыг өнгөлөхийг. */
export function playedBars(total: number, currentSec: number, durationSec: number): number {
  if (!durationSec || durationSec <= 0) return 0;
  return Math.min(total, Math.round((currentSec / durationSec) * total));
}

/** Сервер долгион өгөөгүй бол (хөрвүүлэлт дуусаагүй) тэгш тэнцүү намхан баганууд. */
export function waveformOrFlat(waveform: number[] | null | undefined, bars = 40): number[] {
  return waveform && waveform.length > 0 ? waveform : Array.from({ length: bars }, () => 0.2);
}
