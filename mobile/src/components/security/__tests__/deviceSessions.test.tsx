import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import { DeviceSessions } from '@/components/security/DeviceSessions';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, renderWithClient } from '../../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const SESSIONS = [
  { id: 's1', deviceName: 'iPhone 15', platform: 'IOS', createdAt: '2026-11-01T00:00:00Z', lastUsedAt: '2026-11-07T04:00:00Z', current: true },
  { id: 's2', deviceName: 'Chrome (Windows)', platform: 'WEB', createdAt: '2026-10-01T00:00:00Z', lastUsedAt: '2026-11-06T10:00:00Z', current: false },
];
const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async () => ok(SESSIONS)) as never),
    jest.spyOn(api, 'DELETE').mockImplementation((async () => ok(undefined, 204)) as never),
    jest.spyOn(api, 'POST').mockImplementation((async () => ok(undefined, 204)) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-84 идэвхтэй төхөөрөмжүүд', () => {
  it('AC-56 өөр төхөөрөмжийг алсаас гаргах; энэ төхөөрөмжид «Гаргах» алга', async () => {
    await renderWithClient(<DeviceSessions />);
    expect(await screen.findByText(/iPhone 15 · энэ төхөөрөмж/)).toBeTruthy();
    expect(screen.queryByTestId('device-revoke-s1')).toBeNull();
    await fireEvent.press(screen.getByTestId('device-revoke-s2'));
    await waitFor(() => expect(api.DELETE).toHaveBeenCalledWith('/me/sessions/{sessionId}', { params: { path: { sessionId: 's2' } } }));
  });

  it('AC-125 GAP-24 «Бүх төхөөрөмжөөс гарах» нууц үг шаардлагатайгаар (алсаас түгжих) → энэ төхөөрөмж ч гарна', async () => {
    const signOut = jest.spyOn(api, 'signOut').mockResolvedValue(undefined as never);
    spies.push(signOut);
    await renderWithClient(<DeviceSessions />);
    await fireEvent.press(await screen.findByTestId('devices-revoke-all'));
    await fireEvent.press(screen.getByTestId('devices-confirm-confirm'));
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/me/sessions/revoke-all', { body: { requirePassword: true } }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
