import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import { phraseMatches } from '@/api/queries/account';
import DeleteAccountScreen from '@/app/settings/delete-account';
import { clearRefreshToken } from '@/auth/tokenStore';
import { SpaceStatusBanner } from '@/components/settings/SpaceStatusBanner';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { fail, ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
let mockOffline = false;
jest.mock('@/hooks/useOnlineOnly', () => ({ useOnlineOnly: () => ({ disabled: mockOffline }) }));

const DAY = 24 * 60 * 60 * 1000;

function couple(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    kind: 'COUPLE',
    status: 'ACTIVE',
    timezone: 'Asia/Ulaanbaatar',
    startDateStatus: 'CONFIRMED',
    theme: 'CORAL',
    partner: { id: PARTNER.id, displayName: 'Ану', callName: null, avatar: null, timezone: 'Asia/Ulaanbaatar' },
    myView: { partnerNickname: null, partnerAvatar: null, mascotColor: 'coral' },
    isLongDistance: false,
    ...overrides,
  };
}

let current: ReturnType<typeof couple>;
const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  mockOffline = false;
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  current = couple();
  spies.push(jest.spyOn(api, 'GET').mockImplementation((async () => ok(current)) as never));
  jest.clearAllMocks();
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

async function goToConfirm() {
  await fireEvent.press(await screen.findByTestId('delete-continue'));
  expect(screen.getByTestId('delete-step-2')).toHaveTextContent('2 / 3');
  await fireEvent.press(screen.getByTestId('delete-export-skip'));
  expect(screen.getByTestId('delete-step-3')).toHaveTextContent('3 / 3');
}

describe('S-87 акаунт устгах', () => {
  it('AC-128 анхааруулга (GAP-14): сэргээлтгүй, хамтрагч 30 хоног харах/экспорт; экспортын санал S-85 руу', async () => {
    await renderWithClient(<DeleteAccountScreen />);
    expect(await screen.findByTestId('delete-warn-irreversible')).toHaveTextContent('Устгасан акаунтыг сэргээх боломжгүй.');
    expect(await screen.findByTestId('delete-warn-partner')).toHaveTextContent(/Ану мэдэгдэл.*30 хоног/);
    await fireEvent.press(screen.getByTestId('delete-continue'));
    await fireEvent.press(screen.getByTestId('delete-export-open'));
    expect(router.push).toHaveBeenCalledWith('/settings/data');
  });

  it('хосгүй бол хамтрагчийн тухай мөр харагдахгүй', async () => {
    current = couple({ kind: 'SOLO', partner: null });
    await renderWithClient(<DeleteAccountScreen />);
    await waitFor(() => expect(api.GET).toHaveBeenCalledWith('/couple'));
    expect(screen.queryByTestId('delete-warn-partner')).toBeNull();
  });

  it('AC-128 нууц үг + «УСТГАХ» → POST /me/deletion, сесс цэвэрлээд S-03 руу', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ partnerExportUntil: '2026-12-07T00:00:00Z' }, 202)) as never);
    spies.push(post);
    await renderWithClient(<DeleteAccountScreen />);
    await goToConfirm();
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'Secret123!');
    expect(screen.getByTestId('delete-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('delete-phrase'), 'устгах ');
    expect(screen.getByTestId('delete-confirm')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/me/deletion', { body: { password: 'Secret123!', confirmPhrase: 'устгах' } }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(clearRefreshToken).toHaveBeenCalled();
    expect(useSessionStore.getState().accessToken).toBeNull();
    expect(useSessionStore.getState().signedOut).toBe(true);
  });

  it('AC-128 буруу нууц үг (401) — тайлбар, гарахгүй', async () => {
    spies.push(jest.spyOn(api, 'POST').mockImplementation((async () => fail(401, 'AUTH_INVALID_CREDENTIALS')) as never));
    await renderWithClient(<DeleteAccountScreen />);
    await goToConfirm();
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'wrong');
    await fireEvent.changeText(screen.getByTestId('delete-phrase'), 'УСТГАХ');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(await screen.findByText('Нууц үг буруу байна.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect(useSessionStore.getState().accessToken).toBe('at');
  });

  it('англи хэлэнд баталгаажуулах үг «DELETE»', async () => {
    expect(phraseMatches('delete', 'DELETE')).toBe(true);
    expect(phraseMatches(' УСТГАХ ', 'УСТГАХ')).toBe(true);
    expect(phraseMatches('устга', 'УСТГАХ')).toBe(false);
  });

  it('offline-д устгах товч идэвхгүй', async () => {
    mockOffline = true;
    await renderWithClient(<DeleteAccountScreen />);
    expect(screen.getByTestId('delete-offline')).toBeTruthy();
    await goToConfirm();
    await fireEvent.changeText(screen.getByTestId('delete-phrase'), 'УСТГАХ');
    expect(screen.getByTestId('delete-confirm')).toBeDisabled();
  });
});

describe('Хамтрагч акаунтаа устгасан (PARTNER_DELETED)', () => {
  it('AC-128 ORPHANED — «30 хоногийн дотор татаж аваарай» зурвас, S-85 экспорт руу', async () => {
    current = couple({ status: 'ORPHANED', partner: null, readOnlyUntil: new Date(Date.now() + 30 * DAY - 60_000).toISOString() });
    await renderWithClient(<SpaceStatusBanner />);
    const banner = await screen.findByTestId('space-banner-orphaned');
    expect(banner).toHaveTextContent(/акаунтаа устгасан — 30 хоногийн дотор/);
    await fireEvent.press(banner);
    expect(router.push).toHaveBeenCalledWith('/settings/data');
  });
});
