import { i18n } from '@/i18n';

import { countdownTo, formatCountdown, formatOffset, localClock, offsetParts } from '../partnerTime';

const mn = i18n.getFixedT('mn');
const en = i18n.getFixedT('en');

describe('AC-14 хамтрагчийн орон нутгийн цаг ба бүсийн зөрүү', () => {
  const now = Date.parse('2026-11-07T12:30:00Z');

  it('AC-14 Токио (UTC+9) — 21:30, Улаанбаатараас «+1 цаг»', () => {
    expect(localClock(540, now, 'mn')).toBe('21:30');
    expect(formatOffset(60, mn)).toBe('+1 цаг');
  });

  it('AC-14 Нью-Йорк (UTC−5) — 07:30 (en: 7:30 AM), «−13 цаг»', () => {
    expect(localClock(-300, now, 'mn')).toMatch(/^0?7:30$/);
    expect(localClock(-300, now, 'en')).toMatch(/^7:30\sAM$/);
    expect(formatOffset(-13 * 60, mn)).toBe('−13 цаг');
  });

  it('«−2 цаг», «ижил цаг», хагас цагийн бүс', () => {
    expect(formatOffset(-120, mn)).toBe('−2 цаг');
    expect(formatOffset(0, mn)).toBe('ижил цаг');
    expect(formatOffset(0, en)).toBe('same time');
    expect(formatOffset(-150, mn)).toBe('−2 цаг 30 мин');
    expect(formatOffset(30, mn)).toBe('+30 мин');
    expect(offsetParts(-150)).toEqual({ sign: '−', hours: 2, minutes: 30 });
  });

  it('төхөөрөмжийн бүсээс хамаарахгүй (UTC-ээр шилжүүлнэ)', () => {
    expect(localClock(480, Date.parse('2026-11-07T16:05:00Z'), 'mn')).toMatch(/^0?0:05$/);
  });
});

describe('AC-74 уулзалт хүртэлх хугацаа', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');

  it('AC-74 3 хоног 5 цагийн дараа → «3 өдөр 5 цаг»', () => {
    const c = countdownTo('2026-11-10T17:00:00Z', now);
    expect(c).toEqual({ days: 3, hours: 5, minutes: 0 });
    expect(formatCountdown(c!, mn)).toBe('3 өдөр 5 цаг');
  });

  it('өдөр хүрэхгүй бол цаг, минут; өнгөрсөн бол null', () => {
    expect(formatCountdown(countdownTo('2026-11-07T17:12:00Z', now)!, mn)).toBe('5 цаг 12 мин');
    expect(formatCountdown(countdownTo('2026-11-07T12:12:30Z', now)!, mn)).toBe('12 мин');
    expect(countdownTo('2026-11-07T11:00:00Z', now)).toBeNull();
  });
});
