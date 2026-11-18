import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import { daysLeft, isReadOnlySpace } from '@/api/queries/couple';
import BreakupScreen from '@/app/settings/breakup';
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
const deadline = (days: number) => new Date(Date.now() + days * DAY - 60_000).toISOString();

function couple(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    kind: 'COUPLE',
    status: 'ACTIVE',
    timezone: 'Asia/Ulaanbaatar',
    startDate: '2023-02-14',
    startDateStatus: 'CONFIRMED',
    theme: 'CORAL',
    partner: { id: PARTNER.id, displayName: 'Ану', callName: null, avatar: null, timezone: 'Asia/Ulaanbaatar' },
    myView: { partnerNickname: null, partnerAvatar: null, mascotColor: 'coral' },
    isLongDistance: false,
    readOnlyUntil: null,
    breakup: null,
    ...overrides,
  };
}

function breaking(mine: boolean, partner: boolean, days = 14) {
  const restoreDeadline = deadline(days);
  return couple({
    status: 'BREAKING',
    readOnlyUntil: restoreDeadline,
    breakup: { status: 'BREAKING', restoreDeadline, myRestoreConfirmed: mine, partnerRestoreConfirmed: partner },
  });
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

describe('S-86 хосоо салгах', () => {
  it('AC-185 1 дэх баталгаа → 2 дахь баталгаа (нууц үг) → экспортын санал → 14 хоногийн төлөв', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => {
      current = breaking(false, false);
      return ok(current.breakup, 202);
    }) as never);
    spies.push(post);
    await renderWithClient(<BreakupScreen />);

    expect(await screen.findByTestId('breakup-step-1')).toHaveTextContent('1 / 3');
    expect(screen.getByTestId('breakup-warn')).toHaveTextContent(/14 хоног/);
    expect(screen.getByTestId('breakup-warn')).toHaveTextContent(/Ану мэдэгдэл/);
    expect(post).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('breakup-continue'));
    expect(screen.getByTestId('breakup-step-2')).toHaveTextContent('2 / 3');
    expect(post).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('breakup-password'), 'Secret123!');
    await fireEvent.press(screen.getByTestId('breakup-confirm'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/couple/breakup', { body: { password: 'Secret123!', confirmStep: 2 } }));

    expect(await screen.findByTestId('breakup-step-3')).toHaveTextContent('3 / 3');
    await fireEvent.press(screen.getByTestId('breakup-export-open'));
    expect(router.push).toHaveBeenCalledWith('/settings/data');

    await fireEvent.press(screen.getByTestId('breakup-export-later'));
    expect(await screen.findByTestId('breakup-days-left')).toHaveTextContent('Устахад 14 хоног үлдлээ');
  });

  it('AC-185 буруу нууц үг (400 password) — талбарт тайлбар, төлөв өөрчлөгдөхгүй', async () => {
    spies.push(
      jest.spyOn(api, 'POST').mockImplementation((async () => ({
        ...fail(400, 'VALIDATION_FAILED'),
        error: { code: 'VALIDATION_FAILED', message: 'x', traceId: 't', fieldErrors: [{ field: 'password', code: 'VALIDATION_FAILED' }] },
      })) as never),
    );
    await renderWithClient(<BreakupScreen />);
    await fireEvent.press(await screen.findByTestId('breakup-continue'));
    await fireEvent.changeText(screen.getByTestId('breakup-password'), 'wrong');
    await fireEvent.press(screen.getByTestId('breakup-confirm'));
    expect(await screen.findByText('Нууц үг буруу байна.')).toBeTruthy();
    expect(screen.queryByTestId('breakup-step-3')).toBeNull();
  });

  it('AC-127 (в) 14 хоногийн төлөв — үлдсэн хоног, зөвхөн харах/экспорт', async () => {
    current = breaking(false, false, 9);
    await renderWithClient(<BreakupScreen />);
    expect(await screen.findByTestId('breakup-days-left')).toHaveTextContent('Устахад 9 хоног үлдлээ');
    expect(screen.getByTestId('breakup-read-only')).toHaveTextContent(/зөвхөн харах/);
    await fireEvent.press(screen.getByTestId('breakup-state-export'));
    expect(router.push).toHaveBeenCalledWith('/settings/data');
  });

  it('AC-127 (б) зөвхөн би сэргээвэл — хамтрагчийг хүлээж буй төлөв, сэргэхгүй', async () => {
    current = breaking(false, false);
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => {
      current = breaking(true, false);
      return ok(current.breakup);
    }) as never);
    spies.push(post);
    await renderWithClient(<BreakupScreen />);
    await fireEvent.press(await screen.findByTestId('breakup-restore'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/couple/restore'));
    expect(await screen.findByTestId('breakup-restore-mine')).toHaveTextContent(/Ану баталмагц/);
    expect(screen.queryByTestId('breakup-restore')).toBeNull();
    expect(screen.getByTestId('breakup-days-left')).toBeTruthy();
  });

  it('AC-127 (а) хамтрагч баталсан, би батлахад хоёулаа → ACTIVE, «Хос сэргэлээ»', async () => {
    current = breaking(false, true);
    spies.push(
      jest.spyOn(api, 'POST').mockImplementation((async () => {
        current = couple();
        return ok({ status: 'ACTIVE', restoreDeadline: null, myRestoreConfirmed: false, partnerRestoreConfirmed: false });
      }) as never),
    );
    await renderWithClient(<BreakupScreen />);
    expect(await screen.findByTestId('breakup-restore-partner')).toHaveTextContent(/Ану сэргээхийг хүсч/);
    await fireEvent.press(screen.getByTestId('breakup-restore'));
    expect(await screen.findByTestId('breakup-restored')).toBeTruthy();
  });

  it('offline-д тасалах ба сэргээх идэвхгүй', async () => {
    mockOffline = true;
    current = breaking(false, false);
    const post = jest.spyOn(api, 'POST');
    spies.push(post);
    await renderWithClient(<BreakupScreen />);
    expect(await screen.findByTestId('breakup-offline')).toBeTruthy();
    expect(screen.getByTestId('breakup-restore')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('breakup-restore'));
    expect(post).not.toHaveBeenCalled();
  });

  it('хосгүй (SOLO) бол тасалах урсгал харагдахгүй', async () => {
    current = couple({ kind: 'SOLO', partner: null });
    await renderWithClient(<BreakupScreen />);
    expect(await screen.findByTestId('breakup-not-paired')).toBeTruthy();
    expect(screen.queryByTestId('breakup-continue')).toBeNull();
  });
});

describe('Зөвхөн харах горимын зурвас', () => {
  it('AC-127 BREAKING — үлдсэн хоногтой зурвас, S-86 руу', async () => {
    current = breaking(false, false, 3);
    await renderWithClient(<SpaceStatusBanner />);
    const banner = await screen.findByTestId('space-banner-breaking');
    expect(banner).toHaveTextContent(/3 хоногийн дотор/);
    await fireEvent.press(banner);
    expect(router.push).toHaveBeenCalledWith('/settings/breakup');
  });

  it('AC-185 апп нээлттэй байхад тасарвал зурвас тэр агшнаас тоолно — «14 хоног» (апп нээсэн цагаар 15 биш)', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-11-07T04:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const { client } = await renderWithClient(<SpaceStatusBanner />);
      await waitFor(() => expect(api.GET).toHaveBeenCalled());
      // 30 с-ийн дараа (useNow-ийн минутын tick-ээс өмнө) хос тасарч яг 14 хоногийн хугацаа эхэлнэ
      jest.setSystemTime(Date.parse('2026-11-07T04:00:30Z'));
      const until = new Date(Date.now() + 14 * DAY).toISOString();
      current = couple({ status: 'BREAKING', readOnlyUntil: until, breakup: { status: 'BREAKING', restoreDeadline: until, myRestoreConfirmed: false, partnerRestoreConfirmed: false } });
      await client.invalidateQueries({ queryKey: ['couple'] });
      expect(await screen.findByTestId('space-banner-breaking')).toHaveTextContent(/14 хоногийн дотор/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ACTIVE үед зурвас алга', async () => {
    await renderWithClient(<SpaceStatusBanner />);
    await waitFor(() => expect(api.GET).toHaveBeenCalled());
    expect(screen.queryByTestId('space-banner-breaking')).toBeNull();
  });

  it('isReadOnlySpace ба daysLeft', () => {
    expect(isReadOnlySpace({ status: 'BREAKING' })).toBe(true);
    expect(isReadOnlySpace({ status: 'ORPHANED' })).toBe(true);
    expect(isReadOnlySpace({ status: 'ACTIVE' })).toBe(false);
    const now = Date.parse('2026-11-07T00:00:00Z');
    expect(daysLeft('2026-11-21T00:00:00Z', now)).toBe(14);
    expect(daysLeft('2026-11-07T01:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-11-06T00:00:00Z', now)).toBe(0);
    expect(daysLeft(null, now)).toBe(0);
  });
});
