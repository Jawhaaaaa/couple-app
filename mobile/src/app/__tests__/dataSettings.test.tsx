import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import DataScreen from '@/app/settings/data';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { fail, ME, ok, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const GB = 1024 ** 3;
let exportsList: unknown[];
const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  exportsList = [];
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) =>
      path === '/storage/usage'
        ? ok({ usedBytes: Math.round(8.4 * GB), quotaBytes: 10 * GB, ratio: 0.84, warning: true })
        : ok(exportsList)) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-85 өгөгдөл ба хадгалалт', () => {
  it('NFR-11 хэрэглээ «8,4 / 10 GB» ба 80%-ийн анхааруулга', async () => {
    await renderWithClient(<DataScreen />);
    expect(await screen.findByTestId('data-usage-warning')).toBeTruthy();
    expect(screen.getByTestId('data-usage-text')).toHaveTextContent(/10/);
  });

  it('AC-126 бүтэн хуулбар — POST /exports FULL; бэлэн болсныг татах товчтой', async () => {
    exportsList = [{ id: 'e1', kind: 'FULL', status: 'READY', createdAt: '2026-11-07T04:00:00Z', readyAt: '2026-11-07T04:05:00Z', expiresAt: '2026-11-14T04:05:00Z' }];
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ id: 'e2', kind: 'FULL', status: 'QUEUED', createdAt: 'x' }, 202)) as never);
    spies.push(post);
    await renderWithClient(<DataScreen />);
    expect(await screen.findByTestId('export-download-e1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('data-export-start'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/exports', { body: { kind: 'FULL', locale: 'mn' } }));
    expect(await screen.findByTestId('data-export-started')).toBeTruthy();
  });

  it('өмнөх хуулбар бэлтгэгдэж байвал (429) ойлгомжтой мессеж', async () => {
    spies.push(jest.spyOn(api, 'POST').mockImplementation((async () => fail(429, 'RATE_LIMITED')) as never));
    await renderWithClient(<DataScreen />);
    await fireEvent.press(await screen.findByTestId('data-export-start'));
    expect(await screen.findByTestId('data-export-error')).toHaveTextContent(/бэлтгэгдэж байна/);
  });
});
