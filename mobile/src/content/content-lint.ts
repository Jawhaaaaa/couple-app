/**
 * Агуулгын сангийн шалгалтын туслах функцууд (AC-145, AC-146, AC-147).
 * Зөвхөн тестэд ашиглагдана — апп-ын bundle-д орохгүй.
 */
import fs from 'fs';
import path from 'path';

export const CONTENT_DIR = __dirname;

export type Lang = 'mn' | 'en';
export const LANGS: Lang[] = ['mn', 'en'];

export type FileKind =
  | 'questions'
  | 'dateIdeas'
  | 'notifications'
  | 'greetings'
  | 'emptyStates'
  | 'firstWeek'
  | 'onboarding'
  | 'errors';

/** Файл бүр ба түүнд харгалзах schema-ийн `$defs` түлхүүр. */
export const CONTENT_FILES: { file: string; kind: FileKind }[] = [
  { file: 'questions.json', kind: 'questions' },
  { file: 'date-ideas.json', kind: 'dateIdeas' },
  { file: 'notifications.json', kind: 'notifications' },
  { file: 'greetings.json', kind: 'greetings' },
  { file: 'empty-states.json', kind: 'emptyStates' },
  { file: 'first-week.json', kind: 'firstWeek' },
  { file: 'onboarding.json', kind: 'onboarding' },
  { file: 'errors.json', kind: 'errors' },
];

export type Item = { id: string; [k: string]: unknown };
export type ContentFile = { version: number; items: Item[] };

export function readContent(file: string): ContentFile {
  const p = path.join(CONTENT_DIR, file);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ContentFile;
}

/** Нэг item-ийн тухайн хэлний бүх бичвэр талбар (string эсвэл объект доторх string). */
export function textsOf(item: Item, lang: Lang): string[] {
  const out: string[] = [];
  const v = item[lang];
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) if (typeof x === 'string') out.push(x);
  }
  const safety = item.safety as Record<string, unknown> | undefined;
  if (safety && typeof safety[lang] === 'string') out.push(safety[lang] as string);
  return out;
}

/** Давхардал хайхад ашиглах item-ийн нэгдсэн бичвэр. */
export function combinedText(item: Item, lang: Lang): string {
  const v = item[lang];
  if (typeof v === 'string') return v;
  const o = (v ?? {}) as Record<string, unknown>;
  const parts = ['title', 'text', 'body', 'description', 'action']
    .map((k) => o[k])
    .filter((x): x is string => typeof x === 'string');
  return parts.join(' ');
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function placeholders(s: string): string[] {
  return [...s.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

export function stripPlaceholders(s: string): string {
  return s.replace(PLACEHOLDER, ' ');
}

/** Жижиг үсэг, цэг таслал/тэмдэгтгүй, нэг зайтай. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Өгүүлбэр төгсгөх тэмдэгтийн бүлгийн тоо (`?!`, `...` нэг гэж тоологдоно). */
export function sentenceCount(s: string): number {
  return (s.match(/[.!?…]+/g) ?? []).length;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      cur[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export type NearDuplicate = { a: string; b: string; similarity: number; textA: string; textB: string };

/**
 * Нормчилсон бичвэрүүдийн дотроос ижил эсвэл similarity ≥ threshold хосыг олно.
 * similarity ≥ t нь dist ≤ (1−t)·maxLen, dist ≥ |lenA − lenB| тул зөвхөн
 * min/max ≥ t урттай хосыг харьцуулна.
 */
export function findNearDuplicates(entries: { id: string; text: string }[], threshold = 0.85): NearDuplicate[] {
  const norm = entries
    .map((e) => ({ id: e.id, raw: e.text, n: normalize(e.text) }))
    .sort((x, y) => x.n.length - y.n.length);
  const found: NearDuplicate[] = [];
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      if (norm[i].n.length < threshold * norm[j].n.length) break;
      const sim = norm[i].n === norm[j].n ? 1 : similarity(norm[i].n, norm[j].n);
      if (sim >= threshold) {
        found.push({ a: norm[i].id, b: norm[j].id, similarity: Number(sim.toFixed(3)), textA: norm[i].raw, textB: norm[j].raw });
      }
    }
  }
  return found;
}

export type StopTerm = { term: string; prefix: boolean; raw: string };

/** `stoplist.<lang>.txt`: мөр бүрд нэг нэр томьёо; `*` төгсгөлтэй бол үгийн эхлэлээр тааруулна. */
export function loadStoplist(lang: Lang): StopTerm[] {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, `stoplist.${lang}.txt`), 'utf8');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const prefix = l.endsWith('*');
      return { term: normalize(prefix ? l.slice(0, -1) : l), prefix, raw: l };
    })
    .filter((t) => t.term.length > 0);
}

export function stoplistHits(text: string, list: StopTerm[]): string[] {
  const hay = ` ${normalize(stripPlaceholders(text))} `;
  return list.filter((t) => (t.prefix ? hay.includes(` ${t.term}`) : hay.includes(` ${t.term} `))).map((t) => t.raw);
}

/** Тодорхой үнэ — зөвхөн төсвийн бүс зөвшөөрөгдөнө (Б.2). */
const PRICE_PATTERNS: RegExp[] = [
  /\d[\d\s.,]*(?:(?:мянга|мянган|сая|k)\s*)?(?:₮|төг|mnt\b|tugrik|tögrög|usd\b|доллар|dollar)/iu,
  /[₮$€]\s?\d/u,
];

export function hasPrice(text: string): boolean {
  return PRICE_PATTERNS.some((re) => re.test(text));
}

/** Шифрлэлтийн тухай худал амлалт (spec §3.6, нууцлал). */
export const ENCRYPTION_CLAIM = /end[\s-]*to[\s-]*end|\be2e\b|encrypt|шифрл/iu;
