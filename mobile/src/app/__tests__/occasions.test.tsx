import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { Celebration, Occasion, OccasionDetail } from '@/api/queries/anniversaries';
import CelebrationScreen from '@/app/celebration';
import OccasionDetailScreen from '@/app/(tabs)/together/occasions/[key]';
import OccasionEditScreen from '@/app/(tabs)/together/occasions/edit';
import OccasionsScreen from '@/app/(tabs)/together/occasions/index';
import TogetherScreen from '@/app/(tabs)/together/index';
import { addDays, todayIn } from '@/i18n/calendarDate';
import { useCelebrationGate } from '@/occasions/useCelebrationGate';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, PARTNER, renderWithClient, summary } from '../../../test/memoryFixtures';

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
jest.mock('@/auth/device', () => ({ deviceTimezone: () => 'Asia/Tokyo', deviceInfo: () => ({ name: 'test', platform: 'IOS' }) }));

configure({ asyncUtilTimeout: 5000 });

const TZ = 'Asia/Tokyo';
const today = todayIn(TZ);

function occasion(key: string, o: Partial<Occasion> = {}): Occasion {
  return { occasionKey: key, source: 'CUSTOM', anniversaryId: null, title: key, kind: 'ANNIVERSARY', date: today, nextOn: today, daysUntil: 0, recurring: true, reminderDays: [7, 1, 0], note: null, memoryCount: 0, ...o };
}

let occasions: Occasion[];
let detail: OccasionDetail;
let celebrations: Celebration[];
const spies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  occasions = [];
  celebrations = [];
  detail = { occasion: occasion('custom:a1', { anniversaryId: 'a1', title: 'Анх уулзсан өдөр', kind: 'FIRST_MET' }), note: null, memories: [], reminderDays: [7, 1, 0], version: 2 };
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
      if (path === '/me') return ok({ id: ME.id, displayName: ME.displayName, callName: null, timezone: TZ, avatar: null });
      if (path === '/couple') return ok({ partner: { id: PARTNER.id, displayName: PARTNER.displayName, callName: null, avatar: null }, myView: { partnerNickname: null, partnerAvatar: null } });
      if (path === '/anniversaries') return ok(occasions);
      if (path === '/occasions/{occasionKey}') return ok(detail);
      if (path === '/gift-ideas') return ok([{ id: 'g1', occasionKey: 'custom:a1', text: 'Ном', done: false, createdAt: '2026-11-01T00:00:00Z' }]);
      if (path === '/memories') return ok({ items: [summary('m1', { title: 'Нуур' }), summary('m2', { title: 'Уул' }), summary('m3', { title: 'Кино' })], nextCursor: null });
      if (path === '/me/celebrations') return ok(celebrations);
      return ok([]);
    }) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-61 тэмдэглэлт өдрүүд', () => {
  it('AC-103 «18 хоног үлдлээ», «3 хоногийн өмнө» (Asia/Tokyo-ийн өдрөөр); AC-181 төрөлтэйгөө', async () => {
    occasions = [
      occasion('custom:met', { title: 'Анх уулзсан', kind: 'FIRST_MET', date: addDays(today, 18), nextOn: addDays(today, 18), daysUntil: 18 }),
      occasion('custom:once', { title: 'Нэг удаагийн', recurring: false, date: addDays(today, -3), nextOn: addDays(today, -3), daysUntil: -3, daysSince: 3 }),
    ];
    await renderWithClient(<OccasionsScreen />);
    expect(await screen.findByTestId('occasion-left-custom:met')).toHaveTextContent('18 хоног үлдлээ');
    expect(screen.getByTestId('occasion-left-custom:once')).toHaveTextContent('3 хоногийн өмнө');
    expect(screen.getByTestId('occasion-kind-custom:met')).toHaveTextContent(/Анх уулзсан/);
    expect(screen.getByTestId('milestone-horizon')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('occasion-custom:met'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/together/occasions/[key]', params: { key: 'custom:met' } });
  });

  it('хоосон бол «Өдөр нэмэх» S-62 руу; S-60 хабаас S-61 руу', async () => {
    await renderWithClient(<OccasionsScreen />);
    await fireEvent.press(await screen.findByTestId('state-empty-action'));
    expect(router.push).toHaveBeenCalledWith('/together/occasions/edit');
  });

  it('S-60 хабын карт S-61 руу', async () => {
    await renderWithClient(<TogetherScreen />);
    await fireEvent.press(await screen.findByTestId('together-occasions'));
    expect(router.push).toHaveBeenCalledWith('/together/occasions');
  });

  it('AC-105 тэмдэглэл + 2 дурсамж хавсаргахад PUT; хавсаргасан дурсамж харагдана', async () => {
    mockParams = { key: 'custom:a1' };
    const put = jest.spyOn(api, 'PUT').mockImplementation((async (_p: string, init: { body: { note: string; memoryIds: string[] } }) => {
      detail = { ...detail, note: init.body.note, memories: [summary('m1', { title: 'Нуур' }), summary('m2', { title: 'Уул' })], version: 3 };
      return ok(detail);
    }) as never);
    spies.push(put);
    await renderWithClient(<OccasionDetailScreen />);
    await fireEvent.changeText(await screen.findByTestId('occasion-note'), 'Анх Зайсанд уулзсан');
    await fireEvent.press(screen.getByTestId('occasion-attach'));
    await fireEvent.press(await screen.findByTestId('occasion-pick-m1'));
    await fireEvent.press(screen.getByTestId('occasion-pick-m2'));
    await fireEvent.press(screen.getByTestId('occasion-save'));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/occasions/{occasionKey}/note', {
        params: { path: { occasionKey: 'custom:a1' } },
        body: { note: 'Анх Зайсанд уулзсан', memoryIds: ['m1', 'm2'], reminderDays: [7, 1, 0], version: 2 },
      }),
    );
    expect(await screen.findByTestId('occasion-memory-m1')).toHaveTextContent(/Нуур/);
    expect(screen.getByTestId('occasion-memory-m2')).toHaveTextContent(/Уул/);
  });

  it('AC-40 нууц бэлгийн санаа — зөвхөн өөрийнх, нэмэхэд POST', async () => {
    mockParams = { key: 'custom:a1' };
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ id: 'g2', occasionKey: 'custom:a1', text: 'Цэцэг', done: false, createdAt: 'x' }, 201)) as never);
    spies.push(post);
    await renderWithClient(<OccasionDetailScreen />);
    expect(await screen.findByTestId('gift-g1')).toHaveTextContent(/Ном/);
    await fireEvent.changeText(screen.getByTestId('gift-input'), 'Цэцэг');
    await fireEvent.press(screen.getByTestId('gift-add'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/gift-ideas', { body: { occasionKey: 'custom:a1', text: 'Цэцэг' } }));
  });

  it('AC-181 S-62 «Анх уулзсан», жил бүр давтагдах — POST; огноо буруу бол алдаа', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ id: 'a9' }, 201)) as never);
    spies.push(post);
    await renderWithClient(<OccasionEditScreen />);
    await fireEvent.changeText(await screen.findByTestId('occasion-form-title'), 'Анх уулзсан өдөр');
    await fireEvent.changeText(screen.getByTestId('occasion-form-date'), '2024-10');
    await fireEvent.press(screen.getByTestId('occasion-form-kind-FIRST_MET'));
    await fireEvent.press(screen.getByTestId('occasion-form-save'));
    expect(await screen.findByText('Огноогоо ОООО-СС-ӨӨ хэлбэрээр бичнэ үү')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('occasion-form-date'), '2024-10-24');
    await fireEvent.press(screen.getByTestId('occasion-form-reminder-7'));
    await fireEvent.press(screen.getByTestId('occasion-form-save'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/anniversaries', {
        body: { title: 'Анх уулзсан өдөр', date: '2024-10-24', kind: 'FIRST_MET', recurring: true, reminderDays: [1, 0] },
      }),
    );
  });

  it('AC-181 давталтгүй ой — recurring false', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ id: 'a9' }, 201)) as never);
    spies.push(post);
    await renderWithClient(<OccasionEditScreen />);
    await fireEvent.changeText(await screen.findByTestId('occasion-form-title'), 'Төгсөлт');
    await fireEvent.changeText(screen.getByTestId('occasion-form-date'), '2026-06-20');
    await fireEvent(screen.getByTestId('occasion-form-recurring'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('occasion-form-save'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/anniversaries', { body: expect.objectContaining({ title: 'Төгсөлт', recurring: false }) }));
  });
});

describe('S-25 ойн мэндчилгээ', () => {
  it('AC-39 үзээгүй баяр ANIM-05-аар; AC-MO-02 товшиход хаагдаж seen, дахин гарахгүй', async () => {
    celebrations = [{ eventKey: 'milestone:days:1000', kind: 'MILESTONE', title: '1000 хоног', days: 1000 }];
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok(undefined, 204)) as never);
    spies.push(post);
    const { client } = await renderWithClient(<CelebrationScreen />);
    expect(await screen.findByTestId('celebration-title')).toHaveTextContent('1000 хоног');
    expect(screen.getByTestId('anim-ANIM-05')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('celebration-overlay'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/me/celebrations/{eventKey}/seen', { params: { path: { eventKey: 'milestone:days:1000' } } }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['celebrations'])).toEqual([]);
  });

  it('AC-39 апп нээхэд үзээгүй ойн баяр байвал нэг удаа S-25 руу; бусад төрлийн баяр биш', async () => {
    celebrations = [
      { eventKey: 'linked:x', kind: 'LINKED', title: 'Холбогдлоо' },
      { eventKey: 'anniversary:custom:a1:2026', kind: 'ANNIVERSARY', title: 'Ой' },
    ];
    function Gate() {
      useCelebrationGate();
      return null;
    }
    const view = await renderWithClient(<Gate />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/celebration'));
    view.rerender(<Gate />);
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
