import { formatDate, formatDateLong, formatMoney, formatNumber, formatTime } from '../format';

describe('AC-139 огнооны формат', () => {
  const d = '2026-11-07';
  it.each([
    ['YMD_DOT', '2026.11.07'],
    ['DMY_SLASH', '07/11/2026'],
    ['MDY_SLASH', '11/07/2026'],
  ] as const)('%s → %s', (pattern, expected) => {
    expect(formatDate(d, pattern)).toBe(expected);
  });

  it('цагтай агшинг тухайн хүний бүсээр', () => {
    const instant = new Date('2026-11-06T20:30:00Z');
    expect(formatDate(instant, 'YMD_DOT', 'Asia/Ulaanbaatar')).toBe('2026.11.07');
    expect(formatDate(instant, 'YMD_DOT', 'America/New_York')).toBe('2026.11.06');
  });
});

describe('AC-199 Монгол огноо ба тоо', () => {
  it('«2026 оны 11 сарын 7»', () => {
    expect(formatDateLong('2026-11-07', 'mn')).toBe('2026 оны 11 сарын 7');
  });
  it('Англи нь англи форматаар', () => {
    expect(formatDateLong('2026-11-07', 'en')).toBe('November 7, 2026');
  });
  it('«1 000» — мянгатыг зайгаар', () => {
    expect(formatNumber(1000, 'mn')).toBe('1 000');
    expect(formatNumber(1000, 'mn').replace(/ /g, ' ')).toBe('1 000');
    expect(formatNumber(230000, 'mn').replace(/ /g, ' ')).toBe('230 000');
    expect(formatNumber(999, 'mn')).toBe('999');
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    expect(formatNumber(-30000, 'mn').replace(/ /g, ' ')).toBe('−30 000');
  });
  it('мөнгөн дүн', () => {
    expect(formatMoney(200000, 'mn').replace(/ /g, ' ')).toBe('200 000₮');
  });
  it('цаг: mn 24 цаг, en 12 цаг', () => {
    const t = new Date('2026-11-07T13:05:00Z');
    expect(formatTime(t, 'mn', 'UTC')).toBe('13:05');
    expect(formatTime(t, 'en', 'UTC')).toMatch(/^1:05\sPM$/);
  });
});
