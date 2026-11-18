import type { Locale } from '@/stores/prefsStore';

const VOWELS = 'аэиоуөүыеёяюАЭИОУӨҮЫЕЁЯЮ';
const BACK = /[аоуыяёюАОУЫЯЁЮ]/;
const FRONT_ENDINGS = 'жчшгкьиЖЧШГКЬИ';

/**
 * Нэрийн харьяалах тийн ялгал (AC-174 «Анугийн 2 сэтгэгдэл»): эгшиг ба «н»-ээр төгссөн нэр
 * «-гийн»; бусад гийгүүлэгч — арын эгшигтэй бол «-ын», урдын бол «-ийн». Кирилл бус нэрт
 * «-ийн» зураастай. Англиар «Anu's».
 */
export function possessive(name: string, locale: Locale): string {
  const trimmed = name.trim();
  if (locale === 'en') return `${trimmed}'s`;
  const last = trimmed.slice(-1);
  if (!last) return trimmed;
  if (!/[А-Яа-яЁёӨөҮү]/.test(last)) return `${trimmed}-ийн`;
  if (VOWELS.includes(last) || last === 'н' || last === 'Н') return `${trimmed}гийн`;
  if (FRONT_ENDINGS.includes(last)) return `${trimmed}ийн`;
  return BACK.test(trimmed) ? `${trimmed}ын` : `${trimmed}ийн`;
}
