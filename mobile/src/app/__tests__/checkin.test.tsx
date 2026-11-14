import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { CheckIn } from '@/api/queries/checkins';
import CheckInScreen from '@/app/(tabs)/together/checkin';
import TogetherScreen from '@/app/(tabs)/together/index';
import { addDays, todayIn } from '@/i18n/calendarDate';
import { outbox } from '@/offline/outboxRuntime';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

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
jest.mock('@/auth/device', () => ({ deviceTimezone: () => 'Asia/Ulaanbaatar', deviceInfo: () => ({ name: 'test', platform: 'IOS' }) }));
jest.mock('@/offline/outboxRuntime', () => ({
  outbox: { enqueue: jest.fn(async () => ({})), flush: jest.fn(async () => 0), items: jest.fn(async () => []), subscribe: jest.fn(() => () => undefined) },
}));

configure({ asyncUtilTimeout: 5000 });

const TZ = 'Asia/Ulaanbaatar';
const today = todayIn(TZ);

let series: { mine: CheckIn[]; partner: CheckIn[] };
let autoShare: boolean;
let dashboardData: Record<string, unknown>;
const spies: jest.SpyInstance[] = [];

function prefs() {
  return { theme: 'system', dateFormat: 'YMD_DOT', animation: 'ALL', haptics: true, sound: true, checkinAutoShare: autoShare, mascotColor: 'CORAL', introSeen: true, firstWeekHidden: false };
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  series = { mine: [], partner: [] };
  autoShare = false;
  dashboardData = {
    '/letters:upcoming': [],
    '/letters:inbox': [],
    '/goals': [],
    '/stats': { memories: 48, photos: 0, videos: 0, dates: 16, goalsCompleted: 0, letters: 0, daysTogether: 742, heartsSent: 0, cities: 12, countries: 4, distanceKm: 0 },
  };
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string, init?: { params?: { query?: { box?: string } } }) => {
      if (path === '/me') return ok({ id: ME.id, displayName: ME.displayName, callName: null, timezone: TZ, avatar: null });
      if (path === '/couple') return ok({ partner: { id: PARTNER.id, displayName: PARTNER.displayName, callName: null, avatar: null }, myView: { partnerNickname: null, partnerAvatar: null } });
      if (path === '/checkins') return ok(series);
      if (path === '/me/preferences') return ok(prefs());
      if (path === '/letters') return ok(dashboardData[`/letters:${init?.params?.query?.box}`]);
      if (path === '/goals' || path === '/stats') return ok(dashboardData[path]);
      return ok([]);
    }) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-69 check-in', () => {
  it('AC-183 «Хуваалцах» анхдагчаар унтраастай; түвшин сонгоход ANIM-15; PUT {level, shared:false}', async () => {
    const put = jest.spyOn(api, 'PUT').mockImplementation((async () => ok({ localDate: today, level: 4, shared: false, note: 'Сайхан өдөр' })) as never);
    spies.push(put);
    await renderWithClient(<CheckInScreen />);
    expect(await screen.findByTestId('checkin-share')).toHaveProp('value', false);
    expect(screen.getByTestId('checkin-auto-share')).toHaveProp('value', false);
    await fireEvent.press(screen.getByTestId('checkin-level-4'));
    expect(screen.getByTestId('anim-ANIM-15')).toBeTruthy();
    expect(screen.getByTestId('checkin-level-4')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    await fireEvent.changeText(screen.getByTestId('checkin-note'), 'Сайхан өдөр');
    await fireEvent.press(screen.getByTestId('checkin-save'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/checkins/today', { body: { level: 4, shared: false, note: 'Сайхан өдөр' } }));
    expect(await screen.findByTestId('checkin-message')).toHaveTextContent(/Тэмдэглэлээ/);
  });

  it('AC-183 «автоматаар хуваалцах» асаахад PATCH /me/preferences; дараагийн check-in хуваалцагдана', async () => {
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => {
      autoShare = true;
      return ok(prefs());
    }) as never);
    const put = jest.spyOn(api, 'PUT').mockImplementation((async () => ok({ localDate: today, level: 5, shared: true })) as never);
    spies.push(patch, put);
    await renderWithClient(<CheckInScreen />);
    await fireEvent(await screen.findByTestId('checkin-auto-share'), 'valueChange', true);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { checkinAutoShare: true } }));
    await waitFor(() => expect(screen.getByTestId('checkin-share')).toHaveProp('value', true));
    await fireEvent.press(screen.getByTestId('checkin-level-5'));
    await fireEvent.press(screen.getByTestId('checkin-save'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/checkins/today', { body: { level: 5, shared: true } }));
  });

  it('AC-114 өнөөдрийнх бөглөгдсөн — засвар (дахин PUT); өнгөрсөн өдөр засагдахгүй гэж тайлбартай', async () => {
    series = { mine: [{ localDate: today, level: 2, shared: true, note: 'Ядарсан' }], partner: [] };
    const put = jest.spyOn(api, 'PUT').mockImplementation((async () => ok({ localDate: today, level: 3, shared: true, note: 'Ядарсан' })) as never);
    spies.push(put);
    await renderWithClient(<CheckInScreen />);
    expect(await screen.findByTestId('checkin-note')).toHaveProp('value', 'Ядарсан');
    expect(screen.getByTestId('checkin-share')).toHaveProp('value', true);
    expect(screen.getByText(/Өнгөрсөн өдрийн check-in-ийг засахгүй/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('checkin-level-3'));
    await fireEvent.press(screen.getByTestId('checkin-save'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/checkins/today', { body: { level: 3, shared: true, note: 'Ядарсан' } }));
    expect(await screen.findByTestId('checkin-message')).toHaveTextContent('Өнөөдрийнхийг шинэчиллээ.');
  });

  it('түвшин сонгоогүй бол алдаа; сервер хүрэхгүй бол outbox-оор PUT /checkins/today', async () => {
    spies.push(jest.spyOn(api, 'PUT').mockImplementation((async () => Promise.reject(new TypeError('Network request failed'))) as never));
    await renderWithClient(<CheckInScreen />);
    await fireEvent.press(await screen.findByTestId('checkin-save'));
    expect(await screen.findByText('Сэтгэлээ 5 түвшнээс сонгоно уу')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('checkin-level-1'));
    await fireEvent.press(screen.getByTestId('checkin-save'));
    await waitFor(() => expect(outbox.enqueue).toHaveBeenCalledWith({ method: 'PUT', path: '/checkins/today', body: { level: 1, shared: false } }));
    expect(await screen.findByTestId('checkin-message')).toHaveTextContent(/холбогдмогц илгээгдэнэ/);
  });

  it('AC-115 сарын график: миний 30 өдөр, хамтрагчийн хуваалцсан 10 өдөр л цэгтэй', async () => {
    const from = addDays(today, -29);
    const days = Array.from({ length: 30 }, (_, i) => addDays(from, i));
    series = {
      mine: days.map((d, i) => ({ localDate: d, level: (i % 5) + 1, shared: false })),
      partner: days.filter((_, i) => i % 3 === 0).map((d) => ({ localDate: d, level: 4, shared: true })),
    };
    await renderWithClient(<CheckInScreen />);
    await fireEvent(await screen.findByTestId('mood-chart-area'), 'layout', { nativeEvent: { layout: { width: 320, height: 168 } } });
    expect(screen.getAllByTestId(/^mood-dot-mine-/)).toHaveLength(30);
    expect(screen.getAllByTestId(/^mood-dot-partner-/)).toHaveLength(10);
    expect(screen.getByTestId('mood-legend-partner')).toHaveTextContent(/Ану · дундаж 4/);
    expect(screen.queryByTestId(`mood-dot-partner-${days[1]}`)).toBeNull();
  });
});

describe('S-60 «Хамтдаа» хаб', () => {
  it('карт бүр бодит өгөгдөлтэй: хамтрагчийн хуваалцсан сэтгэл, ирэх захидал, зорилго, статистик', async () => {
    series = { mine: [], partner: [{ localDate: today, level: 5, shared: true, note: 'Хурал амжилттай!' }] };
    dashboardData['/letters:upcoming'] = [{ id: 'T1', occasionLabel: '1000 дахь өдөр' }];
    dashboardData['/letters:inbox'] = [{ id: 'L1', author: PARTNER, recipient: ME, template: 'PAPER_1', status: 'DELIVERED' }];
    dashboardData['/goals'] = [{ id: 'g1', title: 'Хөвсгөл', stepsDone: 1, stepsTotal: 4, progressPercent: 25 }];
    await renderWithClient(<TogetherScreen />);
    expect(await screen.findByText('Ану өнөөдөр 😄 Гайхалтай')).toBeTruthy();
    expect(screen.getByText('Хурал амжилттай!')).toBeTruthy();
    expect(await screen.findByTestId('hub-letter-teaser')).toHaveTextContent('💌 Чамд 1000 дахь өдөр захидал ирнэ');
    expect(screen.getByTestId('hub-letter-unread')).toHaveTextContent('Уншаагүй захидал: 1');
    expect(await screen.findByTestId('goal-g1')).toHaveTextContent(/Хөвсгөл/);
    expect(await screen.findByTestId('hub-stat-days')).toHaveTextContent(/742/);
    expect(screen.getByTestId('hub-stat-cities')).toHaveTextContent(/12.*4 улс/);
    await fireEvent.press(screen.getByTestId('hub-resonance-action'));
    expect(router.push).toHaveBeenCalledWith('/together/checkin');
  });

  it('хоосон картууд үйлдэлтэй: захидал бичих, зорилго тавих, жагсаалт, газрын зураг, нууцлал (S-84)', async () => {
    await renderWithClient(<TogetherScreen />);
    expect(await screen.findByTestId('hub-letter-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('hub-letter-write'));
    expect(router.push).toHaveBeenCalledWith('/together/letters/compose');
    await fireEvent.press(await screen.findByTestId('hub-goal-add'));
    expect(router.push).toHaveBeenCalledWith('/together/goals/new');
    await fireEvent.press(screen.getByTestId('hub-list-wishlist'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/together/lists', params: { kind: 'wishlist' } });
    await fireEvent.press(screen.getByTestId('hub-open-map'));
    expect(router.push).toHaveBeenCalledWith('/together/map');
    await fireEvent.press(screen.getByTestId('hub-privacy-open'));
    expect(router.push).toHaveBeenCalledWith('/settings/security');
    expect(screen.getByTestId('together-occasions')).toBeTruthy();
  });
});
