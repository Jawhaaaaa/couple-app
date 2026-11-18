/**
 * Бодлого, нөхцөлийн (`docs/PRIVACY.md`, `docs/TERMS.md`) markdown-ыг энгийн блок болгон задлана —
 * native сан нэмэхгүйгээр (Expo Go, `policy-guards.test.ts`). Дэмжих зүйл: `#`…`###` гарчиг, догол мөр,
 * `-`/`*`/`1.` жагсаалт, `>` ишлэл, `---` зураас; мөр доторх `**тод**`, `[текст](url)` → текст, `` `код` ``.
 * HTML тайлбар (`<!-- -->`) хасагдана. Хүснэгт, зураг зэрэг бусад нь энгийн догол мөр болно.
 */

export type InlineSpan = { text: string; bold: boolean };

export type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { kind: 'paragraph'; spans: InlineSpan[] }
  | { kind: 'listItem'; marker: string; spans: InlineSpan[] }
  | { kind: 'quote'; spans: InlineSpan[] }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Мөр доторх тэмдэглэгээ: холбоос → текст, `код` → код, `**тод**`/`__тод__` → тод хэсэг. */
export function parseInline(raw: string): InlineSpan[] {
  const text = raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const spans: InlineSpan[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index), bold: false });
    spans.push({ text: m[1] ?? m[2] ?? '', bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false });
  // Ганц `*налуу*` тэмдгийг арилгана (налуу фонт ашиглахгүй)
  return spans.map((s) => ({ ...s, text: s.text.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?=[^*\w]|$)/g, '$1$2') }));
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  // Олон мөрт догол мөр, жагсаалтын мөр, ишлэлийг нэгтгэнэ
  let pending: { kind: 'paragraph' | 'quote' | 'listItem'; marker: string; parts: string[] } | null = null;
  const flush = () => {
    if (!pending) return;
    const spans = parseInline(pending.parts.join(' '));
    if (pending.kind === 'listItem') blocks.push({ kind: 'listItem', marker: pending.marker, spans });
    else if (spans.length > 0) blocks.push({ kind: pending.kind, spans });
    pending = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, spans: parseInline(heading[2].replace(/\s#+\s*$/, '')) });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      if (pending?.kind !== 'quote') flush();
      pending ??= { kind: 'quote', marker: '', parts: [] };
      pending.parts.push(quote[1]);
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flush();
      pending = { kind: 'listItem', marker: ordered ? `${ordered[1]}.` : '•', parts: [bullet ? bullet[1] : ordered![2]] };
      continue;
    }
    // Жагсаалт/ишлэлийн үргэлжлэл мөр (догол зайтай) эсвэл догол мөрийн дараагийн мөр
    if (pending && (pending.kind === 'paragraph' || /^\s{2,}/.test(line))) {
      pending.parts.push(line.trim());
      continue;
    }
    flush();
    pending = { kind: 'paragraph', marker: '', parts: [line.trim()] };
  }
  flush();
  return blocks;
}
