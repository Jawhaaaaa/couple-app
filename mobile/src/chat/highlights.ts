/** Тодруулгын `[start, end]` мужуудаар текстийг хэсэглэнэ (AC-89). */
export function splitHighlights(text: string, ranges: number[][]): { text: string; hit: boolean }[] {
  const sorted = [...ranges].filter((r) => r.length === 2 && r[0] < r[1]).sort((a, b) => a[0] - b[0]);
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [start, end] of sorted) {
    const s = Math.max(start, at);
    if (s >= end || s >= text.length) continue;
    if (s > at) parts.push({ text: text.slice(at, s), hit: false });
    parts.push({ text: text.slice(s, Math.min(end, text.length)), hit: true });
    at = Math.min(end, text.length);
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

const LINK_RE = /https?:\/\/[^\s]+/i;

/** Мессежийн эхний холбоос (S-44 «Холбоос» таб). */
export function firstLink(text: string | null | undefined): string | null {
  return text?.match(LINK_RE)?.[0] ?? null;
}
