import { planDay, utcToZoned, zonedToUtc } from '@/domain/planTime';
import { formatTime } from '@/i18n/format';
import { buildPlanCreate, emptyPlanForm } from '@/plans/planForm';

describe('AC-34 болзооны цаг — UTC хадгалж хүн бүрийн бүсээр', () => {
  it('2026-11-14 19:30 Asia/Ulaanbaatar → UTC 11:30; A-д 19:30, B (Asia/Tokyo)-д 20:30', () => {
    const utc = zonedToUtc('2026-11-14', '19:30', 'Asia/Ulaanbaatar');
    expect(utc).toBe('2026-11-14T11:30:00Z');
    expect(formatTime(new Date(utc), 'mn', 'Asia/Ulaanbaatar')).toBe('19:30');
    expect(formatTime(new Date(utc), 'mn', 'Asia/Tokyo')).toBe('20:30');
  });

  it('маягт `startsAt`-ийг UTC-ээр, `timezone`-ийг оруулсан бүсээр илгээнэ', () => {
    const body = buildPlanCreate({ ...emptyPlanForm('2026-11-14'), title: 'Тэрэлж', time: '19:30' }, 'Asia/Ulaanbaatar', 'c1');
    expect(body.startsAt).toBe('2026-11-14T11:30:00Z');
    expect(body.timezone).toBe('Asia/Ulaanbaatar');
  });

  it('DST-тэй бүс (America/New_York): өвөл ба зун зөв зөрүүтэй', () => {
    expect(zonedToUtc('2026-01-10', '09:00', 'America/New_York')).toBe('2026-01-10T14:00:00Z');
    expect(zonedToUtc('2026-07-10', '09:00', 'America/New_York')).toBe('2026-07-10T13:00:00Z');
  });

  it('UTC агшныг бүсийн огноо/цаг болгоно — шөнө дунд өдөр шилжинэ', () => {
    expect(utcToZoned('2026-11-14T15:30:00Z', 'Asia/Tokyo')).toEqual({ date: '2026-11-15', time: '00:30' });
    expect(planDay('2026-11-14T15:30:00Z', 'Asia/Ulaanbaatar')).toBe('2026-11-14');
  });
});
