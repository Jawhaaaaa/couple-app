import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as Calendar from 'expo-calendar/legacy';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { DatePlan, DatePlanSummary } from '@/api/queries/plans';
import PlanDetailScreen from '@/app/(tabs)/plans/[id]';
import CounterSheet from '@/app/(tabs)/plans/[id]/counter';
import PlansScreen from '@/app/(tabs)/plans/index';
import PlanFormScreen from '@/app/(tabs)/plans/new';
import { planDay, zonedToUtc } from '@/domain/planTime';
import { addDays, todayIn } from '@/i18n/calendarDate';
import { saveFile } from '@/media/saveFile';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event' },
  requestCalendarPermissionsAsync: jest.fn(),
  getDefaultCalendarAsync: jest.fn(async () => ({ id: 'cal-1', allowsModifications: true })),
  getCalendarsAsync: jest.fn(async () => []),
  createEventAsync: jest.fn(async () => 'ev-1'),
}));
jest.mock('@/auth/device', () => ({ deviceTimezone: () => 'Asia/Ulaanbaatar', deviceInfo: () => ({ name: 'test', platform: 'IOS' }) }));
jest.mock('@/media/saveFile', () => ({ saveFile: jest.fn(async () => 'shared') }));

// Дэлгэц том тул удаан машинд анхдагч 1 с хүрэлцэхгүй
configure({ asyncUtilTimeout: 5000 });

const TZ = 'Asia/Ulaanbaatar';
const DAY = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString().replace(/\.\d{3}Z$/, 'Z');

function summary(id: string, overrides: Partial<DatePlanSummary> = {}): DatePlanSummary {
  return {
    id,
    title: `Болзоо ${id}`,
    category: 'OUTDOOR',
    startsAt: inDays(7),
    timezone: TZ,
    status: 'CONFIRMED',
    place: { name: 'Тэрэлж', lat: 47.98, lon: 107.45, city: 'Тэрэлж' },
    recurrence: 'NONE',
    occurrenceOn: null,
    proposer: ME,
    ...overrides,
  };
}

function plan(id: string, overrides: Partial<DatePlan> = {}): DatePlan {
  return {
    ...summary(id),
    description: null,
    reminderOffsets: [1440, 60],
    counterOptions: [],
    checklist: [],
    checklistProgress: { done: 0, total: 0 },
    expenses: [],
    budget: { planId: id, title: `Болзоо ${id}`, plannedMnt: 200000, actualMnt: 0, overBy: 0 },
    weather: null,
    memoryId: null,
    version: 2,
    ...overrides,
  } as DatePlan;
}

let lists: Record<string, DatePlanSummary[]>;
let range: DatePlanSummary[];
let current: DatePlan;
let occasions: unknown[];
const spies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  lists = { upcoming: [], past: [] };
  range = [];
  current = plan('p1');
  occasions = [];
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string, init?: { params?: { query?: { view?: string } } }) => {
      if (path === '/me') return ok({ id: ME.id, displayName: ME.displayName, callName: null, timezone: TZ, avatar: null });
      if (path === '/couple') return ok({ partner: { id: PARTNER.id, displayName: PARTNER.displayName, callName: null, avatar: null }, myView: { partnerNickname: null, partnerAvatar: null } });
      if (path === '/plans') {
        const view = init?.params?.query?.view;
        return ok(view ? lists[view] ?? [] : range);
      }
      if (path === '/plans/{planId}') return ok(current);
      if (path === '/anniversaries') return ok(occasions);
      return ok({});
    }) as never),
  );
});

afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

function mockPost(handler: (path: string, init: { body?: Record<string, unknown> }) => unknown) {
  const post = jest.spyOn(api, 'POST').mockImplementation((async (path: string, init: { body?: Record<string, unknown> }) => handler(path, init)) as never);
  spies.push(post);
  return post;
}

describe('S-50 Төлөвлөгөө', () => {
  it('AC-94 «Удахгүй / Календарь» таб; болзоотой өдөр цэгтэй, өдөр товшвол тухайн өдрийн болзоо, долоо хоногоор харах', async () => {
    const today = todayIn(TZ);
    const atToday = summary('p-today', { title: 'Од харах', startsAt: zonedToUtc(today, '23:30', TZ) });
    lists.upcoming = [summary('p-next', { title: 'Тэрэлжийн оройн зоог' })];
    range = [atToday];
    await renderWithClient(<PlansScreen />);
    expect(await screen.findByTestId('plans-next')).toHaveTextContent(/Тэрэлжийн оройн зоог/);

    await fireEvent.press(screen.getByTestId('plans-tabs-calendar'));
    expect(await screen.findByTestId(`calendar-dot-${today}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`calendar-day-${today}`));
    expect(within(await screen.findByTestId('calendar-day-plans')).getByText('Од харах')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('calendar-mode-week'));
    expect(await screen.findByTestId(`calendar-dot-${today}`)).toBeTruthy();
    expect(screen.getAllByTestId(/^calendar-day-\d{4}/)).toHaveLength(7);
  });

  it('AC-33 хамтрагчийн санал болгосон болзоог S-50-аас зөвшөөрөхөд баталгаажиж ANIM-12', async () => {
    lists.upcoming = [summary('p2', { status: 'PENDING', proposer: PARTNER })];
    const post = mockPost(() => ok(plan('p2', { status: 'CONFIRMED', proposer: PARTNER })));
    await renderWithClient(<PlansScreen />);
    expect(await screen.findByTestId('plans-awaiting')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('rsvp-accept-p2'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/plans/{planId}/respond', { params: { path: { planId: 'p2' } }, body: { action: 'ACCEPT' } }),
    );
    expect(await screen.findByTestId('anim-ANIM-12')).toBeTruthy();
  });

  it('AC-33 миний санал — «Хариу хүлээгдэж байна»; «Өөр цаг» S-55 руу', async () => {
    lists.upcoming = [summary('mine', { status: 'PENDING', proposer: ME }), summary('theirs', { status: 'PENDING', proposer: PARTNER })];
    await renderWithClient(<PlansScreen />);
    expect(await screen.findByTestId('rsvp-waiting-mine')).toHaveTextContent('Хариу хүлээгдэж байна');
    await fireEvent.press(screen.getByTestId('rsvp-counter-theirs'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plans/[id]/counter', params: { id: 'theirs' } });
  });

  it('AC-103 S-50-ийн дээд хэсэгт Milestone Horizon — «18 хоног үлдлээ», товшвол S-61', async () => {
    lists.upcoming = [summary('p-next')];
    const nextOn = addDays(todayIn(TZ), 18);
    occasions = [{ occasionKey: 'auto:days:1000', source: 'AUTO_DAYS', title: '1000 хоног', kind: 'MILESTONE', date: nextOn, nextOn, daysUntil: 18, recurring: false, reminderDays: [7, 1, 0], memoryCount: 0 }];
    await renderWithClient(<PlansScreen />);
    expect(await screen.findByTestId('horizon-left-auto:days:1000')).toHaveTextContent('18 хоног үлдлээ');
    await fireEvent.press(screen.getByTestId('horizon-auto:days:1000'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/together/occasions/[key]', params: { key: 'auto:days:1000' } });
  });

  it('болзоо алга бол хоосон төлөв — «Болзоо төлөвлөх» S-54 руу', async () => {
    await renderWithClient(<PlansScreen />);
    await fireEvent.press(await screen.findByTestId('state-empty-action'));
    expect(router.push).toHaveBeenCalledWith('/plans/new');
  });
});

describe('S-54 болзооны дэлгэрэнгүй', () => {
  beforeEach(() => {
    mockParams = { id: 'p1' };
  });

  it('AC-96 checklist «2 / 4» — хэн тэмдэглэснийг аватараар; тэмдэглэхэд PATCH', async () => {
    current = plan('p1', {
      checklist: [
        { id: 'c1', text: 'Хөнжил', position: 0, done: true, doneBy: ME.id, version: 1 },
        { id: 'c2', text: 'Термос', position: 1, done: true, doneBy: PARTNER.id, version: 1 },
        { id: 'c3', text: 'Камер', position: 2, done: false, version: 3 },
        { id: 'c4', text: 'Дуран', position: 3, done: false, version: 1 },
      ],
      checklistProgress: { done: 2, total: 4 },
    });
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok({ id: 'c3', text: 'Камер', position: 2, done: true, doneBy: ME.id, version: 4 })) as never);
    spies.push(patch);
    await renderWithClient(<PlanDetailScreen />);
    expect(await screen.findByTestId('plan-checklist-progress')).toHaveTextContent('2 / 4 бэлэн');
    expect(await screen.findByLabelText('Ану тэмдэглэсэн')).toBeTruthy();
    expect(screen.getByTestId('checklist-done-by-c1')).toBeTruthy();
    expect(screen.queryByTestId('checklist-done-by-c3')).toBeNull();
    await fireEvent.press(screen.getByTestId('checklist-toggle-c3'));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/checklist-items/{itemId}', { params: { path: { itemId: 'c3' } }, body: { done: true, version: 3 } }),
    );
  });

  it('AC-33 A-д B-гийн санал болгосон 2 цаг; нэгийг сонгоход баталгаажиж ANIM-12', async () => {
    current = plan('p1', {
      status: 'COUNTER_PROPOSED',
      proposer: ME,
      counterOptions: [
        { id: 'o1', startsAt: inDays(8), proposerId: PARTNER.id, chosen: false },
        { id: 'o2', startsAt: inDays(9), proposerId: PARTNER.id, chosen: false },
      ],
    });
    const post = mockPost(() => ok(plan('p1', { status: 'CONFIRMED' })));
    await renderWithClient(<PlanDetailScreen />);
    expect(await screen.findByTestId('plan-option-o1')).toBeTruthy();
    expect(screen.getByTestId('plan-option-o2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-option-o2'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plans/{planId}/choose-option', { params: { path: { planId: 'p1' } }, body: { optionId: 'o2' } }));
    expect(await screen.findByTestId('anim-ANIM-12')).toBeTruthy();
  });

  it('AC-33 B хариулах: Зөвшөөрөх / Өөр цаг / Татгалзах', async () => {
    current = plan('p1', { status: 'PENDING', proposer: PARTNER });
    await renderWithClient(<PlanDetailScreen />);
    expect(await screen.findByTestId('plan-accept')).toBeTruthy();
    expect(screen.getByTestId('plan-decline')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-counter'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plans/[id]/counter', params: { id: 'p1' } });
  });

  it('AC-100 10 хоногийн дараах болзоонд цаг агаар харагдана', async () => {
    const weather = { date: '2026-11-17', tempMinC: -12.4, tempMaxC: -3.2, code: 3, icon: 'cloud', attribution: 'Open-Meteo' };
    current = plan('p1', { startsAt: inDays(10), weather });
    await renderWithClient(<PlanDetailScreen />);
    expect(await screen.findByTestId('plan-weather')).toHaveTextContent(/-12…-3°C/);
  });

  it('AC-100 20 хоногийн дараах болзоонд цаг агаар байхгүй', async () => {
    const weather = { date: '2026-11-27', tempMinC: -12, tempMaxC: -3, code: 3, icon: 'cloud', attribution: 'Open-Meteo' };
    current = plan('p1', { startsAt: inDays(20), weather });
    await renderWithClient(<PlanDetailScreen />);
    expect(await screen.findByTestId('plan-summary')).toBeTruthy();
    expect(screen.queryByTestId('plan-weather')).toBeNull();
  });

  it('AC-95 өнгөрсөн болзоо «Дурсамж болгох» → S-32 гарчиг, огноо, газраар бөглөгдсөн ноорог', async () => {
    current = plan('p1', { title: 'Jazz орой', startsAt: inDays(-3) });
    await renderWithClient(<PlanDetailScreen />);
    await fireEvent.press(await screen.findByTestId('plan-to-memory'));
    const call = (router.push as jest.Mock).mock.calls[0][0] as { pathname: string; params: { draft: string } };
    expect(call.pathname).toBe('/memory-editor');
    expect(JSON.parse(call.params.draft)).toEqual({
      title: 'Jazz орой',
      occurredOn: planDay(current.startsAt, TZ),
      place: current.place,
      datePlanId: 'p1',
    });
  });

  it('AC-95 холбогдсон дурсамжтай бол «Дурсамжийг үзэх»', async () => {
    current = plan('p1', { startsAt: inDays(-3), memoryId: 'm9' });
    await renderWithClient(<PlanDetailScreen />);
    await fireEvent.press(await screen.findByTestId('plan-open-memory'));
    expect(router.push).toHaveBeenCalledWith('/memories/m9');
  });

  it('AC-101 «Календарьт нэмэх»: зөвшөөрөлтэй бол зөв цаг, бүс, газартай үйл явдал', async () => {
    (Calendar.requestCalendarPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await renderWithClient(<PlanDetailScreen />);
    await fireEvent.press(await screen.findByTestId('plan-add-calendar'));
    await waitFor(() =>
      expect(Calendar.createEventAsync).toHaveBeenCalledWith(
        'cal-1',
        expect.objectContaining({ title: 'Болзоо p1', startDate: new Date(current.startsAt), timeZone: TZ, location: 'Тэрэлж' }),
      ),
    );
    expect(await screen.findByTestId('plan-calendar-done')).toHaveTextContent('Утасны календарьт нэмэгдлээ.');
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('AC-101 зөвшөөрөл татгалзвал .ics хуваалцана (AC-158 вэбийн замтай ижил файл)', async () => {
    (Calendar.requestCalendarPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await renderWithClient(<PlanDetailScreen />);
    await fireEvent.press(await screen.findByTestId('plan-add-calendar'));
    await waitFor(() =>
      expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringMatching(/\/api\/v1\/plans\/p1\/ics$/), mime: 'text/calendar', headers: { Authorization: 'Bearer at' } })),
    );
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
    expect(await screen.findByTestId('plan-calendar-done')).toHaveTextContent(/[.]ics/);
  });
});

describe('S-55 өөр цаг ба S-54 маягт', () => {
  it('AC-33 S-55: 2 цаг санал болгоход COUNTER (UTC)', async () => {
    mockParams = { id: 'p1' };
    const post = mockPost(() => ok(plan('p1', { status: 'COUNTER_PROPOSED' })));
    await renderWithClient(<CounterSheet />);
    await fireEvent.changeText(await screen.findByTestId('counter-date-0'), '2026-11-15');
    await fireEvent.changeText(screen.getByTestId('counter-time-0'), '18:00');
    await fireEvent.press(screen.getByTestId('counter-add'));
    await fireEvent.changeText(screen.getByTestId('counter-date-1'), '2026-11-16');
    await fireEvent.changeText(screen.getByTestId('counter-time-1'), '12:00');
    await fireEvent.press(screen.getByTestId('counter-submit'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/plans/{planId}/respond', {
        params: { path: { planId: 'p1' } },
        body: { action: 'COUNTER', options: ['2026-11-15T10:00:00Z', '2026-11-16T04:00:00Z'] },
      }),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('AC-34 шинэ болзоо: 19:30 (Улаанбаатар) → startsAt 11:30Z; гарчиггүй бол талбарын алдаа', async () => {
    const post = mockPost((_path, init) => ok(plan('new-1', { title: String(init.body?.title) }), 201));
    await renderWithClient(<PlanFormScreen />);
    await fireEvent.press(await screen.findByTestId('plan-form-submit'));
    expect(await screen.findByText('Гарчгаа бичнэ үү')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('plan-form-title'), 'Од харах');
    await fireEvent.changeText(screen.getByTestId('plan-form-date'), '2026-11-14');
    await fireEvent.changeText(screen.getByTestId('plan-form-time'), '19:30');
    await fireEvent.press(screen.getByTestId('plan-form-submit'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/plans', {
        body: expect.objectContaining({ title: 'Од харах', startsAt: '2026-11-14T11:30:00Z', timezone: TZ, reminderOffsets: [1440, 60], recurrence: 'NONE' }),
      }),
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/plans/[id]', params: { id: 'new-1' } }));
  });

  it('AC-110 `?draft=` санаанаас гарчиг, ангиллаар бөглөгдөнө', async () => {
    mockParams = { draft: JSON.stringify({ title: 'Кино үзэх', category: 'CULTURE' }) };
    await renderWithClient(<PlanFormScreen />);
    expect(await screen.findByTestId('plan-form-title')).toHaveProp('value', 'Кино үзэх');
    expect(screen.getByTestId('plan-form-category-CULTURE')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });
});
