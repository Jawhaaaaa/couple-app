import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { Dashboard } from '@/api/queries/dashboard';
import HomeScreen from '@/app/(tabs)/home/index';
import { useSignalFx } from '@/signals/sendSignal';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const me = (kind: 'SOLO' | 'COUPLE') => ({
  id: 'u-bat',
  email: 'bat@aura.test',
  displayName: 'Бат',
  callName: null,
  emailVerified: true,
  policyUpdateRequired: false,
  space: { id: 's-1', kind, status: 'ACTIVE' },
});

/** AC-13 / AC-72 (б): 2024-10-24-нөөс 2026-11-07 — 745 хоног; бүх хэсэг хоосон хос. */
function emptyCouple(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    counter: { days: 745, startDate: '2024-10-24', breakdown: { years: 2, months: 0, days: 14 }, confirmed: true },
    me: { name: 'Бат', localTime: '2026-11-07T20:30:00+08:00', utcOffsetMinutes: 480, offsetFromMeMinutes: 0, weather: null },
    partner: { name: 'Ану', localTime: '2026-11-07T21:30:00+09:00', utcOffsetMinutes: 540, offsetFromMeMinutes: 60, weather: null },
    longDistance: null,
    signalsToday: { sent: 2, received: 1 },
    unseenSignals: null,
    nextDate: null,
    upcoming: [],
    recentMemories: [],
    unreadMessages: 0,
    onThisDay: null,
    recap: null,
    incomingLetters: [],
    survey: null,
    update: null,
    ...overrides,
  };
}

const ok = (data: unknown, status = 200) => ({ data, error: undefined, response: new Response(JSON.stringify(data), { status }) });
const noContent = () => ({ data: undefined, error: undefined, response: new Response(null, { status: 204 }) });

let dashboard: Dashboard;
let meKind: 'SOLO' | 'COUPLE';
let getSpy: jest.SpyInstance;
let postSpy: jest.SpyInstance;

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs, animation: 'OFF' });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  useSignalFx.setState({ liveAt: null });
  dashboard = emptyCouple();
  meKind = 'COUPLE';
  getSpy = jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
    if (path === '/dashboard') return ok(dashboard);
    if (path === '/me') return ok(me(meKind));
    if (path === '/notifications') return ok({ items: [], nextCursor: null, unreadCount: 0 });
    if (path === '/questions/today') {
      return ok({
        coupleDay: '2026-11-07',
        question: { id: 'q-1', textMn: 'Хамгийн дуртай аялал чинь?', textEn: 'Favourite trip?', category: 'fun' },
        myAnswer: null,
        partnerAnswered: false,
      });
    }
    return ok({});
  }) as never);
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => noContent()) as never);
});

afterEach(() => {
  getSpy.mockRestore();
  postSpy.mockRestore();
});

describe('S-20 нүүр', () => {
  it('AC-13 тоолуур «745 хоног хамтдаа», эхэлсэн өдөр; товшвол S-21', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('counter-days')).toHaveTextContent('745'));
    expect(screen.getByTestId('home-counter')).toHaveProp('accessibilityLabel', '745 хоног хамтдаа 2024.10.24 өдрөөс хойш');
    expect(screen.getByTestId('home-counter-since')).toHaveTextContent('2024.10.24 өдрөөс хойш');
    expect(getSpy).toHaveBeenCalledWith('/dashboard', expect.objectContaining({ params: expect.anything() }));
    await fireEvent.press(screen.getByTestId('home-counter'));
    expect(router.push).toHaveBeenCalledWith('/home/counter');
  });

  it('AC-65 эхэлсэн өдөр батлагдаагүй бол «Эхэлсэн өдрөө батлаарай» → S-11', async () => {
    dashboard = emptyCouple({ counter: { days: 0, startDate: null, breakdown: { years: 0, months: 0, days: 0 }, confirmed: false } });
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-counter-unconfirmed')).toBeTruthy());
    expect(screen.getByText('Эхэлсэн өдрөө батлаарай')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-counter-confirm'));
    expect(router.push).toHaveBeenCalledWith('/start-date');
  });

  it('AC-14 хамтрагчийн карт: орон нутгийн цаг ба «+1 цаг»', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('person-partner-offset')).toHaveTextContent('+1 цаг'));
    expect(screen.getByTestId('person-partner-name')).toHaveTextContent('Ану');
  });

  it('AC-72 хоосон хос — хэсэг бүр маскот + 1 өгүүлбэр + холбогдох таб руу товч', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-section-next-date-empty')).toBeTruthy());
    const expected: [string, string][] = [
      ['next-date', '/plans'],
      ['upcoming', '/together'],
      ['memories', '/memories'],
      ['messages', '/chat'],
    ];
    for (const [name, href] of expected) {
      expect(screen.getByTestId(`home-section-${name}-empty`)).toBeTruthy();
      await fireEvent.press(screen.getByTestId(`home-section-${name}-action`));
      expect(router.push).toHaveBeenLastCalledWith(href);
    }
    expect(screen.getAllByTestId('anim-ANIM-11').length).toBeGreaterThanOrEqual(4);
  });

  it('AC-72 өгөгдөлтэй хос — дараагийн болзоо, ой, дурсамж, уншаагүй «2»', async () => {
    dashboard = emptyCouple({
      nextDate: {
        id: 'p-1',
        title: 'Кино',
        startsAt: '2026-11-10T11:00:00Z',
        timezone: 'Asia/Ulaanbaatar',
        status: 'ACCEPTED',
        recurrence: 'NONE',
        proposer: { id: 'u-bat', displayName: 'Бат' },
      } as unknown as Dashboard['nextDate'],
      upcoming: [{ occasionKey: 'days:1000', source: 'AUTO_DAYS', title: '1000 хоног', nextOn: '2027-07-20', daysUntil: 255 }],
      recentMemories: [1, 2, 3].map((i) => ({
        id: `m-${i}`,
        title: `Дурсамж ${i}`,
        occurredOn: '2026-10-0' + i,
        visibility: 'SHARED',
        status: 'READY',
        cover: null,
        mediaCount: 1,
        author: { id: 'u-bat', displayName: 'Бат' },
        commentCount: 0,
        favorite: false,
        createdAt: '2026-10-01T10:00:00Z',
      })) as unknown as Dashboard['recentMemories'],
      unreadMessages: 2,
    });
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-next-date')).toBeTruthy());
    expect(screen.getByTestId('home-upcoming-item')).toHaveProp('accessibilityLabel', '1000 хоног. 2027.07.20 · 255 хоног үлдлээ');
    expect(screen.getAllByTestId('home-memory')).toHaveLength(3);
    expect(screen.getByTestId('home-unread-messages')).toHaveProp('accessibilityLabel', '2 уншаагүй мессеж');
    expect(screen.queryByTestId('home-section-next-date-empty')).toBeNull();
  });

  it('AC-18 хаалттай үед ирсэн 3 зүрх — нэг нэгтгэсэн карт «3 💗», ANIM-02 нэг удаа, POST /signals/seen', async () => {
    dashboard = emptyCouple({ unseenSignals: { count: 3, kinds: ['HEART'], lastText: null } });
    const view = await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-unseen-text')).toHaveTextContent('Ану чамд 3 💗 илгээсэн байна'));
    expect(screen.getAllByTestId('anim-ANIM-02')).toHaveLength(1);
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/signals/seen'));

    // Дахин татахад (сервер одоо үзсэн гэж хариулна) карт хэвээр, дахин тоглохгүй
    dashboard = emptyCouple();
    await view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider>
          <HomeScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    expect(postSpy.mock.calls.filter(([p]) => p === '/signals/seen')).toHaveLength(1);
  });

  it('AC-18 persist кэшийн (өмнөх сессийн) unseenSignals-аар карт гаргахгүй — зөвхөн шинээр татсан хариугаар', async () => {
    // Кэшид өмнөх сессийн хариу (3 зүрх) — сервер одоо үзсэн гэж (null) хариулна
    dashboard = emptyCouple();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } } });
    client.setQueryData(['dashboard'], emptyCouple({ unseenSignals: { count: 3, kinds: ['HEART'], lastText: null } }));
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <HomeScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('home-signals-today')).toBeTruthy());
    expect(screen.queryByTestId('home-unseen-signals')).toBeNull();
    expect(screen.queryByTestId('anim-ANIM-02')).toBeNull();
    // Дахин татахад (сэргээлтийн дараах refreshRestoredQueries) серверийн хариу — карт гарахгүй хэвээр
    await client.invalidateQueries();
    await waitFor(() => expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(false));
    expect(screen.queryByTestId('home-unseen-signals')).toBeNull();
    expect(postSpy.mock.calls.filter(([p]) => p === '/signals/seen')).toHaveLength(0);
  });

  it('AC-18 realtime overlay саяхан тоглосон бол нүүрний карт дахин үзүүлэхгүй', async () => {
    useSignalFx.setState({ liveAt: Date.now() });
    dashboard = emptyCouple({ unseenSignals: { count: 1, kinds: ['HEART'], lastText: null } });
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-signals-today')).toBeTruthy());
    expect(screen.queryByTestId('home-unseen-signals')).toBeNull();
  });

  it('хосгүй (SOLO) — урилга руу CTA (S-13)', async () => {
    meKind = 'SOLO';
    dashboard = emptyCouple({ partner: null, counter: { days: 0, startDate: null, breakdown: { years: 0, months: 0, days: 0 }, confirmed: false } });
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-solo')).toBeTruthy());
    expect(screen.queryByTestId('heart-button')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-solo-invite'));
    expect(router.push).toHaveBeenCalledWith('/waiting');
  });

  it('өнөөдрийн илгээсэн/хүлээн авсан тоо', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-signals-today')).toHaveTextContent('Өнөөдөр 2 💗 илгээсэн · 1 хүлээн авсан'));
  });

  it('AC-207 `Dashboard.survey.due` үед нүүрэнд санал асуулгын карт, үгүй бол алга', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('home-signals-today')).toBeTruthy());
    expect(screen.queryByTestId('survey-card')).toBeNull();
  });

  it('AC-207 хостой үед `due` бол санал асуулгын карт гарна', async () => {
    dashboard = emptyCouple({ survey: { due: true } });
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('survey-card')).toBeTruthy());
  });

  it('AC-207 хосгүй (SOLO) хэрэглэгчид ч санал асуулга гарна', async () => {
    meKind = 'SOLO';
    dashboard = emptyCouple({ partner: null, survey: { due: true } });
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('survey-card')).toBeTruthy());
    expect(screen.getByTestId('home-solo')).toBeTruthy();
  });
});
