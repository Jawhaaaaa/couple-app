import { FORECAST_DAYS, inForecastWindow, visibleForecast } from '@/domain/planTime';

const NOW = Date.parse('2026-11-07T04:00:00Z');
const TZ = 'Asia/Ulaanbaatar';
const weather = { date: '2026-11-17', tempMinC: -12, tempMaxC: -3, code: 3, icon: 'cloud', attribution: 'Open-Meteo' };

describe('AC-100 цаг агаарын таамаг ≤ 14 хоногт', () => {
  it('10 хоногийн дараах болзоонд таамаг харагдана', () => {
    const plan = { startsAt: '2026-11-17T11:30:00Z', weather };
    expect(inForecastWindow(plan.startsAt, NOW, TZ)).toBe(true);
    expect(visibleForecast(plan, NOW, TZ)).toEqual(weather);
  });

  it('20 хоногийн дараах болзоонд цаг агаар байхгүй (сервер буцаасан ч)', () => {
    const plan = { startsAt: '2026-11-27T11:30:00Z', weather };
    expect(inForecastWindow(plan.startsAt, NOW, TZ)).toBe(false);
    expect(visibleForecast(plan, NOW, TZ)).toBeNull();
  });

  it('хил: 14 хоног багтана, 15 хоног багтахгүй; өнгөрсөн болзоонд таамаг 0', () => {
    expect(FORECAST_DAYS).toBe(14);
    expect(inForecastWindow('2026-11-21T11:30:00Z', NOW, TZ)).toBe(true);
    expect(inForecastWindow('2026-11-22T11:30:00Z', NOW, TZ)).toBe(false);
    expect(inForecastWindow('2026-11-05T11:30:00Z', NOW, TZ)).toBe(false);
    expect(visibleForecast({ startsAt: '2026-11-10T11:30:00Z', weather: null }, NOW, TZ)).toBeNull();
  });
});
