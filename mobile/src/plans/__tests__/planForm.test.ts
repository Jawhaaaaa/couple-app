import type { DatePlan } from '@/api/queries/plans';
import { rsvpState } from '@/api/queries/plans';
import {
  applyPlanDraft,
  buildPlanCreate,
  buildPlanUpdate,
  counterOptions,
  emptyPlanForm,
  parsePlanDraft,
  planFormFrom,
  validatePlanForm,
} from '@/plans/planForm';

const TZ = 'Asia/Ulaanbaatar';
const city = { name: 'Тэрэлж', countryCode: 'MN', lat: 47.98, lon: 107.45, timezone: TZ };

describe('S-54 болзооны маягт', () => {
  it('гарчиггүй, буруу огноо/цаг, хотгүй газар — талбарын алдаа', () => {
    const form = { ...emptyPlanForm('2026-11-14'), date: '2026-13-01', time: '25:00', venue: 'Кемп' };
    expect(validatePlanForm(form)).toEqual(['TITLE', 'DATE', 'TIME', 'PLACE']);
  });

  it('бүтэн маягт → `POST /plans` (газар, төсөв, сануулга, давталт, checklist)', () => {
    const form = {
      ...emptyPlanForm('2026-11-14'),
      title: '  Од харах  ',
      time: '19:30',
      venue: 'Terelj Camp',
      city,
      budget: '200 000',
      recurrence: 'WEEKLY' as const,
      until: '2026-12-31',
      checklist: ['Хөнжил', ' ', 'Термос'],
    };
    expect(validatePlanForm(form)).toEqual([]);
    expect(buildPlanCreate(form, TZ, 'cid')).toEqual({
      clientId: 'cid',
      title: 'Од харах',
      startsAt: '2026-11-14T11:30:00Z',
      timezone: TZ,
      place: { name: 'Terelj Camp', lat: 47.98, lon: 107.45, city: 'Тэрэлж', countryCode: 'MN' },
      plannedBudgetMnt: 200000,
      reminderOffsets: [1440, 60],
      recurrence: 'WEEKLY',
      recurrenceUntil: '2026-12-31',
      checklist: [{ text: 'Хөнжил' }, { text: 'Термос' }],
    });
  });

  it('засвар: нэг удаагийн өөрчлөлтөд давталтын талбар илгээхгүй (AC-37)', () => {
    const plan = { title: 'Кино', startsAt: '2026-11-14T11:30:00Z', recurrence: 'WEEKLY', reminderOffsets: [60], place: null, checklist: [] } as unknown as DatePlan;
    const form = planFormFrom(plan, TZ);
    expect(form.date).toBe('2026-11-14');
    expect(form.time).toBe('19:30');
    const body = buildPlanUpdate({ ...form, time: '20:00' }, TZ, 4, 'OCCURRENCE', '2026-11-14');
    expect(body).toMatchObject({ startsAt: '2026-11-14T12:00:00Z', version: 4, scope: 'OCCURRENCE', occurrenceOn: '2026-11-14' });
    expect(body).not.toHaveProperty('recurrence');
  });

  it('`?draft=` санаанаас бөглөнө (AC-110); эвдэрсэн бол null', () => {
    const draft = parsePlanDraft(JSON.stringify({ title: 'Кино үзэх', category: 'CULTURE', ideaId: 'i1', budgetMnt: 50000, bogus: 1 }));
    const form = applyPlanDraft(emptyPlanForm('2026-11-14'), draft);
    expect(form).toMatchObject({ title: 'Кино үзэх', category: 'CULTURE', ideaId: 'i1', budget: '50000' });
    expect(parsePlanDraft('{эвдэрсэн')).toBeNull();
  });

  it('AC-33 S-55: 1–3 цагийг UTC болгоно; 4 эсвэл буруу мөр бол null', () => {
    expect(counterOptions([{ date: '2026-11-15', time: '18:00' }, { date: '2026-11-16', time: '12:00' }], TZ)).toEqual([
      '2026-11-15T10:00:00Z',
      '2026-11-16T04:00:00Z',
    ]);
    expect(counterOptions([], TZ)).toBeNull();
    expect(counterOptions(Array(4).fill({ date: '2026-11-15', time: '18:00' }), TZ)).toBeNull();
    expect(counterOptions([{ date: '2026-11-15', time: '8' }], TZ)).toBeNull();
  });

  it('AC-33 RSVP ээлж: B хариулна, A хүлээнэ; B-гийн санал болгосон цагийг A сонгоно', () => {
    const base = { proposer: { id: 'A', displayName: 'A' }, counterOptions: [] };
    expect(rsvpState({ ...base, status: 'PENDING' }, 'B')).toEqual({ kind: 'respond' });
    expect(rsvpState({ ...base, status: 'PENDING' }, 'A')).toEqual({ kind: 'waiting' });
    const options = [
      { id: 'o1', startsAt: '2026-11-15T10:00:00Z', proposerId: 'B', chosen: false },
      { id: 'o2', startsAt: '2026-11-16T10:00:00Z', proposerId: 'B', chosen: false },
    ];
    expect(rsvpState({ ...base, status: 'COUNTER_PROPOSED', counterOptions: options }, 'A')).toEqual({ kind: 'choose', options });
    expect(rsvpState({ ...base, status: 'COUNTER_PROPOSED', counterOptions: options }, 'B')).toEqual({ kind: 'waiting' });
    expect(rsvpState({ ...base, status: 'CONFIRMED' }, 'B')).toEqual({ kind: 'confirmed' });
  });
});
