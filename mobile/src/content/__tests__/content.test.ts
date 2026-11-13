/**
 * Агуулгын сан — Хавсралт Б (AC-145 schema ба тоо, AC-146 давхардал, AC-147 stoplist).
 * date-ideas.json-ийг өөр ажил бичдэг; байхгүй бол тест унах ёстой (алгасахгүй).
 */
import fs from 'fs';
import path from 'path';
import Ajv2020 from 'ajv/dist/2020';

import {
  CONTENT_DIR,
  CONTENT_FILES,
  ContentFile,
  ENCRYPTION_CLAIM,
  Item,
  LANGS,
  combinedText,
  findNearDuplicates,
  hasPrice,
  loadStoplist,
  normalize,
  placeholders,
  sentenceCount,
  stoplistHits,
  stripPlaceholders,
  textsOf,
} from '../content-lint';

const schema = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'content.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(schema);

const cache = new Map<string, ContentFile>();
function load(file: string): ContentFile {
  if (!cache.has(file)) {
    const p = path.join(CONTENT_DIR, file);
    if (!fs.existsSync(p)) throw new Error(`${file} олдсонгүй (${p})`);
    cache.set(file, JSON.parse(fs.readFileSync(p, 'utf8')) as ContentFile);
  }
  return cache.get(file)!;
}
const items = (file: string) => load(file).items;
const countBy = <T,>(xs: T[], f: (x: T) => string) =>
  xs.reduce<Record<string, number>>((acc, x) => ((acc[f(x)] = (acc[f(x)] ?? 0) + 1), acc), {});

const ALLOWED_PLACEHOLDERS = new Set(['partner', 'title', 'days']);

// ---------------------------------------------------------------------------
describe('AC-145 агуулгын файлууд: schema, id, хоёр хэл', () => {
  describe.each(CONTENT_FILES)('$file', ({ file, kind }) => {
    it(`schema #/$defs/${kind}-д тохирно`, () => {
      const validate = ajv.getSchema(`${schema.$id}#/$defs/${kind}`);
      expect(validate).toBeDefined();
      const ok = validate!(load(file));
      expect(ok ? [] : validate!.errors!.slice(0, 10)).toEqual([]);
    });

    it('id давтагдахгүй', () => {
      const ids = items(file).map((i) => i.id);
      const dups = ids.filter((id, n) => ids.indexOf(id) !== n);
      expect(dups).toEqual([]);
    });

    it('mn ба en бичвэр бүр хоосон биш', () => {
      const bad: string[] = [];
      for (const it of items(file)) {
        for (const lang of LANGS) {
          const texts = textsOf(it, lang);
          if (!texts.length || texts.some((t) => !t.trim())) bad.push(`${it.id}.${lang}`);
        }
      }
      expect(bad).toEqual([]);
    });

    it('placeholder нь mn, en-д ижил бөгөөд зөвшөөрөгдсөн', () => {
      const bad: string[] = [];
      for (const it of items(file)) {
        const mn = new Set(textsOf(it, 'mn').flatMap(placeholders));
        const en = new Set(textsOf(it, 'en').flatMap(placeholders));
        const same = mn.size === en.size && [...mn].every((p) => en.has(p));
        const allowed = [...mn, ...en].every((p) => ALLOWED_PLACEHOLDERS.has(p));
        if (!same || !allowed) bad.push(`${it.id}: mn{${[...mn]}} en{${[...en]}}`);
      }
      expect(bad).toEqual([]);
    });

    it('монгол бичвэрт латин үг холилдохгүй', () => {
      const bad = items(file)
        .flatMap((it) => textsOf(it, 'mn').map((t) => [it.id, t] as const))
        .filter(([, t]) => /[A-Za-z]/.test(stripPlaceholders(t).replace(/\bAura\b/g, '')))
        .map(([id, t]) => `${id}: ${t}`);
      expect(bad).toEqual([]);
    });

    it('шифрлэлтийн тухай амлалт байхгүй', () => {
      const bad = items(file)
        .flatMap((it) => LANGS.flatMap((l) => textsOf(it, l).map((t) => [it.id, t] as const)))
        .filter(([, t]) => ENCRYPTION_CLAIM.test(t))
        .map(([id, t]) => `${id}: ${t}`);
      expect(bad).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
describe('AC-145 тоо ба тархалт', () => {
  it('Б.1 асуулт ≥ 365, ангиллын хувь 25/25/20/20/10 ±3%', () => {
    const qs = items('questions.json');
    expect(qs.length).toBeGreaterThanOrEqual(365);
    const by = countBy(qs, (q) => q.category as string);
    const target: Record<string, number> = { MEMORY: 25, KNOWING: 25, FUTURE: 20, FUN: 20, DEEP: 10 };
    for (const [cat, pct] of Object.entries(target)) {
      const share = ((by[cat] ?? 0) / qs.length) * 100;
      expect({ cat, ok: Math.abs(share - pct) <= 3, share: share.toFixed(1) }).toEqual(
        expect.objectContaining({ cat, ok: true }),
      );
    }
  });

  it('Б.1 depth 1–3; эхний 30-д 1-р түвшин ≥ 70%, нийтэд 1-р түвшин давамгай', () => {
    const qs = items('questions.json');
    const first30 = qs.slice(0, 30).filter((q) => q.depth === 1).length;
    expect(first30).toBeGreaterThanOrEqual(21);
    const d1 = qs.filter((q) => q.depth === 1).length;
    expect(d1 / qs.length).toBeGreaterThanOrEqual(0.5);
    for (const d of [1, 2, 3]) expect(qs.some((q) => q.depth === d)).toBe(true);
  });

  it('Б.1 асуулт ≤ 120 тэмдэгт, асуултын тэмдэгээр төгсөнө, «чи»-гээр хандана, тийм/үгүй биш', () => {
    const bad: string[] = [];
    const formalMn = /(^|[^\p{L}])(та|таны|танд|таныг|тантай|танаас)(?=[^\p{L}]|$)/iu;
    const yesNoEn = /^(do|did|does|are|is|was|were|have|has|can|could|will|would|should)\b/i;
    for (const q of items('questions.json')) {
      const mn = q.mn as string;
      const en = q.en as string;
      if ([...mn].length > 120 || [...en].length > 120) bad.push(`${q.id}: урт`);
      if (!mn.trim().endsWith('?') || !en.trim().endsWith('?')) bad.push(`${q.id}: «?» алга`);
      if (formalMn.test(mn)) bad.push(`${q.id}: «та» хэлбэр`);
      if (yesNoEn.test(en.trim())) bad.push(`${q.id}: yes/no асуулт`);
    }
    expect(bad).toEqual([]);
  });

  it('Б.2 санаа ≥ 150; үнэгүй ≥ 30, гэртээ ≥ 25, алс зайн ≥ 20, улирал бүрд ≥ 25, Монгол ≥ 40', () => {
    const ideas = items('date-ideas.json');
    expect(ideas.length).toBeGreaterThanOrEqual(150);
    expect(ideas.filter((i) => i.budgetBand === 'FREE').length).toBeGreaterThanOrEqual(30);
    expect(ideas.filter((i) => i.setting === 'HOME').length).toBeGreaterThanOrEqual(25);
    expect(ideas.filter((i) => i.longDistance === true).length).toBeGreaterThanOrEqual(20);
    expect(ideas.filter((i) => i.mongolia === true).length).toBeGreaterThanOrEqual(40);
    for (const s of ['WINTER', 'SPRING', 'SUMMER', 'AUTUMN']) {
      const n = ideas.filter((i) => (i.seasons as string[]).includes(s)).length;
      expect({ season: s, enough: n >= 25 }).toEqual({ season: s, enough: true });
    }
  });

  it('Б.2 гарчиг ≤ 40, тайлбар 1–3 өгүүлбэр, гарчиг давтагдахгүй', () => {
    const bad: string[] = [];
    for (const lang of LANGS) {
      const seen = new Map<string, string>();
      for (const it of items('date-ideas.json')) {
        const t = it[lang] as { title: string; description: string };
        if ([...t.title].length > 40) bad.push(`${it.id}.${lang}: гарчиг урт`);
        const n = sentenceCount(t.description);
        if (n < 1 || n > 3) bad.push(`${it.id}.${lang}: ${n} өгүүлбэр`);
        const key = normalize(t.title);
        if (seen.has(key)) bad.push(`${it.id}.${lang}: гарчиг ${seen.get(key)}-тэй ижил`);
        seen.set(key, it.id);
      }
    }
    expect(bad).toEqual([]);
  });

  it('Б.2 тодорхой үнэ байхгүй (зөвхөн төсвийн бүс)', () => {
    const bad: string[] = [];
    for (const { file } of CONTENT_FILES) {
      for (const it of items(file)) {
        for (const lang of LANGS) for (const t of textsOf(it, lang)) if (hasPrice(t)) bad.push(`${file} ${it.id}: ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('Б.3 мэдэгдлийн төрөл бүрд ≥ 3 хувилбар', () => {
    const types = [
      'MESSAGE_NEW', 'MEMORY_CREATED', 'MEMORY_COMMENT', 'HEART_RECEIVED', 'HUG_RECEIVED', 'THINKING_OF_YOU',
      'DATE_PROPOSED', 'DATE_RESPONDED', 'DATE_REMINDER', 'ANNIVERSARY_REMINDER', 'LETTER_DELIVERED', 'CAPSULE_OPENED',
      'QUESTION_PARTNER_ANSWERED', 'INVITE_USED', 'PAIRING_CANCELLED', 'THEME_PROPOSED', 'THEME_DECLINED', 'PROMISE_PROPOSED',
      'EXPORT_READY', 'BREAKUP_STARTED', 'QUIET_MODE_ON', 'STORAGE_WARNING', 'INACTIVITY_NUDGE', 'SCREENSHOT_TAKEN',
      'GREETING_MORNING', 'GREETING_EVENING',
    ];
    const by = countBy(items('notifications.json'), (n) => n.type as string);
    const short = types.filter((t) => (by[t] ?? 0) < 3);
    expect(short).toEqual([]);
  });

  it('Б.3 мэндчилгээ: өглөө ≥ 20, орой ≥ 20, 7 хоногийн сануулга ≥ 5, ой бүрд', () => {
    const gs = items('greetings.json');
    const by = countBy(gs, (g) => g.kind as string);
    expect(by.MORNING ?? 0).toBeGreaterThanOrEqual(20);
    expect(by.EVENING ?? 0).toBeGreaterThanOrEqual(20);
    expect(by.INACTIVITY ?? 0).toBeGreaterThanOrEqual(5);
    const ms = new Set(gs.filter((g) => g.kind === 'MILESTONE').map((g) => g.milestone));
    const required = ['D100', 'D200', 'D300', 'D365', 'D500', 'D1000', 'Y1', 'Y2', 'Y3', 'Y5', 'Y10', 'BIRTHDAY'];
    expect(required.filter((m) => !ms.has(m))).toEqual([]);
  });

  it('Б.3 хоосон төлөвтэй S-ID бүрд нэг өгүүлбэр бичвэр ба товчны нэр', () => {
    const required = [
      'S-13', 'S-20', 'S-23', 'S-24', 'S-30', 'S-34', 'S-35', 'S-36', 'S-37', 'S-40', 'S-42', 'S-43', 'S-44', 'S-47',
      'S-50', 'S-51', 'S-52', 'S-56', 'S-57', 'S-58', 'S-59', 'S-60', 'S-61', 'S-63', 'S-64', 'S-65', 'S-68', 'S-69',
      'S-70', 'S-72',
    ];
    const es = items('empty-states.json');
    const ids = new Set(es.map((e) => e.id));
    expect(required.filter((id) => !ids.has(id))).toEqual([]);
    const bad: string[] = [];
    for (const e of es) {
      for (const lang of LANGS) {
        const t = e[lang] as { text: string; action: string };
        if (sentenceCount(t.text) > 1) bad.push(`${e.id}.${lang}: нэгээс олон өгүүлбэр`);
        if (t.action.split(/\s+/).length > 4) bad.push(`${e.id}.${lang}: товчны нэр урт`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('Б.3 эхний 7 хоногийн даалгавар яг 1..7 өдөр', () => {
    const days = items('first-week.json').map((i) => i.day as number).sort((a, b) => a - b);
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('Б.3 onboarding 3–4 слайд', () => {
    const n = items('onboarding.json').length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(4);
  });

  it('Б.3 алдааны мессеж бүр «юу болсон + юу хийх» (≥ 2 өгүүлбэр)', () => {
    const bad = items('errors.json')
      .flatMap((e) => LANGS.map((l) => [e.id, l, e[l] as string] as const))
      .filter(([, , t]) => sentenceCount(t) < 2)
      .map(([id, l]) => `${id}.${l}`);
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('AC-146 давхардал: ижил эсвэл Levenshtein ≥ 0.85 хос 0', () => {
  it('шалгагч өөрөө ажиллана (ижил, бараг ижил, өөр)', () => {
    const found = findNearDuplicates([
      { id: 'a', text: 'Чиний хамгийн дуртай кино юу вэ?' },
      { id: 'b', text: 'чиний хамгийн дуртай кино юу вэ' },
      { id: 'c', text: 'Чиний хамгийн дуртай дуу юу вэ?' },
      { id: 'd', text: 'Ирэх зун хаашаа аялах вэ?' },
    ]);
    const pairs = found.map((f) => [f.a, f.b].sort().join('-')).sort();
    expect(pairs).toEqual(['a-b', 'a-c', 'b-c']);
  });

  const cases = CONTENT_FILES.flatMap(({ file }) => LANGS.map((lang) => ({ file, lang })));
  it.each(cases)('$file ($lang)', ({ file, lang }) => {
    const entries = items(file).map((it: Item) => ({ id: it.id, text: combinedText(it, lang) }));
    expect(findNearDuplicates(entries, 0.85)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('AC-147 stoplist: тохирол 0', () => {
  const stop = { mn: loadStoplist('mn'), en: loadStoplist('en') };

  it('stoplist хоосон биш, Б.1/Б.2-ын сэдвийг хамарна', () => {
    expect(stop.mn.length).toBeGreaterThan(50);
    expect(stop.en.length).toBeGreaterThan(50);
    expect(stoplistHits('Хуучин найз охиныхоо тухай', stop.mn)).not.toEqual([]);
    expect(stoplistHits('Архи уух', stop.mn)).not.toEqual([]);
    expect(stoplistHits('Чойжин ламын сүм, Туул гол', stop.mn)).toEqual([]);
    expect(stoplistHits('Talk about your ex-girlfriend', stop.en)).not.toEqual([]);
    expect(stoplistHits('A winter walk', stop.en)).toEqual([]);
  });

  const cases = CONTENT_FILES.flatMap(({ file }) => LANGS.map((lang) => ({ file, lang })));
  it.each(cases)('$file ($lang)', ({ file, lang }) => {
    const hits: string[] = [];
    for (const it of items(file)) {
      for (const t of textsOf(it, lang)) {
        const h = stoplistHits(t, stop[lang]);
        if (h.length) hits.push(`${it.id}: [${h.join(', ')}] ${t}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
