import fs from 'fs';
import path from 'path';

import { parseInline, parseMarkdown } from '../markdown';

const DOCS = path.resolve(__dirname, '../../../../docs');

/** Backend `PolicyVersionService.split`-ийн адил: «lang:xx» тэмдгээс дараагийнх хүртэл. */
function section(file: string, lang: 'mn' | 'en'): string {
  const src = fs.readFileSync(path.join(DOCS, file), 'utf8');
  const parts = src.split(/<!--\s*lang:(mn|en)\s*-->/);
  const i = parts.indexOf(lang);
  return parts[i + 1];
}

describe('markdown задлалт (S-90, AC-63, AC-130)', () => {
  it('гарчиг, догол мөр, жагсаалт, ишлэл, зураас', () => {
    const md = [
      '<!-- тайлбар -->',
      '# Гарчиг 1',
      '',
      'Эхний мөр',
      'хоёр дахь мөр.',
      '',
      '## Дэд гарчиг',
      '- **Акаунт:** имэйл,',
      '  нууц үгийн hash',
      '* хоёр дахь',
      '1. дугаартай',
      '',
      '> **Ноорог.** Анхаар',
      '> үргэлжлэл',
      '',
      '---',
      '#### Гүн гарчиг',
    ].join('\n');
    expect(parseMarkdown(md)).toEqual([
      { kind: 'heading', level: 1, spans: [{ text: 'Гарчиг 1', bold: false }] },
      { kind: 'paragraph', spans: [{ text: 'Эхний мөр хоёр дахь мөр.', bold: false }] },
      { kind: 'heading', level: 2, spans: [{ text: 'Дэд гарчиг', bold: false }] },
      {
        kind: 'listItem',
        marker: '•',
        spans: [
          { text: 'Акаунт:', bold: true },
          { text: ' имэйл, нууц үгийн hash', bold: false },
        ],
      },
      { kind: 'listItem', marker: '•', spans: [{ text: 'хоёр дахь', bold: false }] },
      { kind: 'listItem', marker: '1.', spans: [{ text: 'дугаартай', bold: false }] },
      {
        kind: 'quote',
        spans: [
          { text: 'Ноорог.', bold: true },
          { text: ' Анхаар үргэлжлэл', bold: false },
        ],
      },
      { kind: 'rule' },
      { kind: 'heading', level: 3, spans: [{ text: 'Гүн гарчиг', bold: false }] },
    ]);
  });

  it('холбоос → текст, `код` → код, *налуу* тэмдэггүй', () => {
    expect(parseInline('[Leaflet](https://leafletjs.com) ба `HTTPS`, *чухал*')).toEqual([
      { text: 'Leaflet ба HTTPS, чухал', bold: false },
    ]);
  });

  it.each([
    ['PRIVACY.md', 'mn'],
    ['PRIVACY.md', 'en'],
    ['TERMS.md', 'mn'],
    ['TERMS.md', 'en'],
  ] as const)('AC-130 бодит %s (%s) — нэг H1, хэсгийн гарчигууд, markdown тэмдэгт үлдэхгүй', (file, lang) => {
    const blocks = parseMarkdown(section(file, lang));
    expect(blocks.filter((b) => b.kind === 'heading' && b.level === 1)).toHaveLength(1);
    expect(blocks.filter((b) => b.kind === 'heading' && b.level === 2).length).toBeGreaterThanOrEqual(5);
    const text = blocks.flatMap((b) => ('spans' in b ? b.spans.map((s) => s.text) : [])).join('\n');
    expect(text).not.toMatch(/\*\*|^#|<!--|\]\(/m);
  });
});
