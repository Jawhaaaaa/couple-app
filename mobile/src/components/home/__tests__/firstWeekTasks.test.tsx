import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { FirstWeekState } from '@/api/queries/firstWeek';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ok, renderWithClient } from '../../../../test/memoryFixtures';
import { FirstWeekTasks } from '../FirstWeekTasks';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const day = (n: number, taskKey: string, status: 'DONE' | 'SKIPPED' | null = null): FirstWeekState => ({
  day: n,
  visible: true,
  today: { taskKey, day: n, status },
});

let state: FirstWeekState;
const spies: jest.SpyInstance[] = [];
let put: jest.SpyInstance;
let patch: jest.SpyInstance;
let post: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs, animation: 'OFF', haptics: false });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  state = day(1, 'fw-1');
  spies.push(jest.spyOn(api, 'GET').mockImplementation((async () => ok(state)) as never));
  put = jest.spyOn(api, 'PUT').mockImplementation((async (_p: string, init: { params: { path: { taskKey: string } }; body: { status: 'DONE' | 'SKIPPED' } }) =>
    ok(day(state.day, init.params.path.taskKey, init.body.status))) as never);
  patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok({ firstWeekHidden: true })) as never);
  post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ id: 'sig-1' }, 201)) as never);
  spies.push(put, patch, post);
});

afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-20 «Эхний 7 хоног» (FR-16.4)', () => {
  it('AC-134 өдөрт нэг даалгавар — 1 дэх өдөр «Эхний зураг», товч S-32 рүү', async () => {
    await renderWithClient(<FirstWeekTasks partnerName="Ану" />);
    await waitFor(() => expect(screen.getByTestId('first-week-title')).toHaveTextContent('Эхний зураг'));
    expect(api.GET).toHaveBeenCalledWith('/me/first-week-tasks');
    expect(screen.getByTestId('first-week-day')).toHaveTextContent('Эхний 7 хоног · 1/7 дэх өдөр');
    await fireEvent.press(screen.getByTestId('first-week-start'));
    expect(router.push).toHaveBeenCalledWith('/memory-editor');
  });

  it('AC-134 «Болсон» → PUT DONE ба ✨', async () => {
    state = day(2, 'fw-2');
    await renderWithClient(<FirstWeekTasks partnerName="Ану" />);
    await waitFor(() => expect(screen.getByTestId('first-week-done-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('first-week-done-button'));
    await waitFor(() => expect(screen.getByTestId('first-week-done')).toHaveTextContent(/^✨ Гоё!/));
    expect(put).toHaveBeenCalledWith('/me/first-week-tasks/{taskKey}', { params: { path: { taskKey: 'fw-2' } }, body: { status: 'DONE' } });
    expect(screen.queryByTestId('first-week-start')).toBeNull();
  });

  it('AC-134 өнөөдрийнхийг өмнө нь дуусгасан бол ✨ төлөв (дахин хийлгэхгүй)', async () => {
    state = day(4, 'fw-4', 'DONE');
    await renderWithClient(<FirstWeekTasks partnerName="Ану" />);
    await waitFor(() => expect(screen.getByTestId('first-week-done')).toHaveTextContent('✨ Өнөөдрийн даалгавар биелсэн. Маргааш уулзъя!'));
  });

  it('AC-134 «Алгасах» → PUT SKIPPED, өнөөдрийн карт алга', async () => {
    state = day(5, 'fw-5');
    await renderWithClient(<FirstWeekTasks partnerName="Ану" />);
    await waitFor(() => expect(screen.getByTestId('first-week-skip')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('first-week-skip'));
    await waitFor(() => expect(screen.queryByTestId('first-week')).toBeNull());
    expect(put).toHaveBeenCalledWith('/me/first-week-tasks/{taskKey}', { params: { path: { taskKey: 'fw-5' } }, body: { status: 'SKIPPED' } });
  });

  it('AC-134 «Нуух» → PATCH /me/preferences {firstWeekHidden: true}, карт алга', async () => {
    await renderWithClient(<FirstWeekTasks partnerName="Ану" />);
    await waitFor(() => expect(screen.getByTestId('first-week-hide')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('first-week-hide'));
    await waitFor(() => expect(screen.queryByTestId('first-week')).toBeNull());
    expect(patch).toHaveBeenCalledWith('/me/preferences', { body: { firstWeekHidden: true } });
  });

  it('AC-134 8 дахь өдөр (сервер `visible: false`) — карт алга', async () => {
    state = { day: 7, visible: false, today: null };
    await renderWithClient(<FirstWeekTasks partnerName="Ану" />);
    await waitFor(() => expect(api.GET).toHaveBeenCalled());
    expect(screen.queryByTestId('first-week')).toBeNull();
  });

  it('AC-134 3 дахь өдөр — хамтрагчийн нэртэй, нүүрнээс шууд зүрх илгээж биелнэ', async () => {
    state = day(3, 'fw-3');
    await renderWithClient(<FirstWeekTasks partnerName="Ану" />);
    await waitFor(() => expect(screen.getByTestId('first-week-body')).toHaveTextContent('Гэнэтхэн нэг зүрх илгээгээд Ану чинь хэрхэн баярлахыг хараарай.'));
    await fireEvent.press(screen.getByTestId('first-week-heart'));
    await waitFor(() => expect(screen.getByTestId('first-week-done')).toBeTruthy());
    expect(post).toHaveBeenCalledWith('/signals', { body: expect.objectContaining({ kind: 'HEART' }) });
    expect(put).toHaveBeenCalledWith('/me/first-week-tasks/{taskKey}', { params: { path: { taskKey: 'fw-3' } }, body: { status: 'DONE' } });
  });
});
