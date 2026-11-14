import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import { displayUser } from '@/api/queries/couple';
import CoupleSettingsScreen from '@/app/settings/couple';
import { SettingsSync } from '@/components/settings/SettingsSync';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { colorsFor } from '@/theme/tokens';
import { pickAvatar } from '@/upload/avatar';

import { ME, media, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
jest.mock('@/upload/avatar', () => ({ pickAvatar: jest.fn() }));
jest.mock('@/upload/simpleUpload', () => ({
  blobFromUri: jest.fn(async () => new Blob(['x'])),
  simpleUpload: jest.fn(async () => ({ id: 'm-partner' })),
}));
let mockOffline = false;
jest.mock('@/hooks/useOnlineOnly', () => ({ useOnlineOnly: () => ({ disabled: mockOffline }) }));

type Json = Record<string, unknown>;

function couple(overrides: Json = {}): Json {
  return {
    id: 'c1',
    kind: 'COUPLE',
    status: 'ACTIVE',
    timezone: 'Asia/Ulaanbaatar',
    startDate: '2023-02-14',
    startDateStatus: 'CONFIRMED',
    theme: 'CORAL',
    pendingThemeProposal: null,
    partner: { id: PARTNER.id, displayName: 'Ану', callName: null, avatar: null, timezone: 'Asia/Ulaanbaatar' },
    myView: { partnerNickname: null, partnerAvatar: null, mascotColor: 'coral' },
    isLongDistance: false,
    ...overrides,
  };
}

const proposal = (proposerId: string, theme = 'LAVENDER') => ({
  id: 'tp1',
  theme,
  status: 'PENDING',
  proposer: { id: proposerId, displayName: proposerId === ME.id ? 'Бат' : 'Ану', avatar: null },
  createdAt: '2026-11-07T00:00:00Z',
});

let current: Json;
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

describe('S-82 хосын тохиргоо', () => {
  it('AC-137 хоч хадгалах — PATCH /couple/my-view (зөвхөн надад), хоосон бол null', async () => {
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async (_p: string, init: { body: Json }) => {
      current = couple({ myView: { partnerNickname: init.body.partnerNickname ?? null, partnerAvatar: null, mascotColor: 'coral' } });
      return ok(current);
    }) as never);
    spies.push(patch);
    await renderWithClient(<CoupleSettingsScreen />);
    expect(await screen.findByTestId('couple-partner')).toHaveTextContent(/зөвхөн та харна/);
    expect(screen.getByTestId('couple-nickname-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('couple-nickname'), '  Бөмбөгөө ');
    await fireEvent.press(screen.getByTestId('couple-nickname-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/couple/my-view', { body: { partnerNickname: 'Бөмбөгөө' } }));
    expect(await screen.findByTestId('couple-nickname-saved')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('couple-nickname'), '');
    await fireEvent.press(screen.getByTestId('couple-nickname-save'));
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith('/couple/my-view', { body: { partnerNickname: null } }));
  });

  it('AC-137 хамтрагчийн зураг — AVATAR upload → partnerAvatarMediaId', async () => {
    (pickAvatar as jest.Mock).mockResolvedValue({ status: 'picked', avatar: { uri: 'file://p.jpg', width: 10, height: 10 } });
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok(couple({ myView: { partnerNickname: null, partnerAvatar: media('m-partner'), mascotColor: 'coral' } }))) as never);
    spies.push(patch);
    const { simpleUpload } = jest.requireMock('@/upload/simpleUpload');
    await renderWithClient(<CoupleSettingsScreen />);
    await fireEvent.press(await screen.findByTestId('couple-avatar-pick'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/couple/my-view', { body: { partnerAvatarMediaId: 'm-partner' } }));
    expect(simpleUpload).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'AVATAR' }));
    expect(await screen.findByTestId('couple-avatar-saved')).toBeTruthy();
  });

  it('AC-137 displayUser — хамтрагч бол хоч ба миний өгсөн зураг, бусад хэвээр', () => {
    const c = couple({ myView: { partnerNickname: 'Бөмбөгөө', partnerAvatar: media('m-nick'), mascotColor: 'coral' } }) as never;
    expect(displayUser(c, { id: PARTNER.id, displayName: 'Ану', avatar: null })).toEqual({ name: 'Бөмбөгөө', avatar: media('m-nick') });
    expect(displayUser(c, { id: ME.id, displayName: 'Бат', avatar: null })).toEqual({ name: 'Бат', avatar: null });
    expect(displayUser(null, { id: PARTNER.id, displayName: 'Ану' })).toEqual({ name: 'Ану', avatar: null });
  });

  it('AC-138 «Лаванда» санал болгох — POST /couple/theme-proposals, хүлээж буй төлөв', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => {
      current = couple({ pendingThemeProposal: proposal(ME.id) });
      return ok(proposal(ME.id), 201);
    }) as never);
    spies.push(post);
    await renderWithClient(<CoupleSettingsScreen />);
    expect(await screen.findByTestId('couple-theme-current')).toHaveTextContent(/Коралл/);
    expect(screen.getByTestId('couple-theme-propose')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('couple-theme-LAVENDER'));
    await fireEvent.press(screen.getByTestId('couple-theme-propose'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/couple/theme-proposals', { body: { theme: 'LAVENDER' } }));
    expect(await screen.findByTestId('couple-theme-pending-mine')).toHaveTextContent(/Лаванда.*Ану зөвшөөрөхийг/);
  });

  it('AC-138 хамтрагчийн саналыг зөвшөөрөхөд палитр шууд солигдоно', async () => {
    current = couple({ pendingThemeProposal: proposal(PARTNER.id) });
    spies.push(
      jest.spyOn(api, 'POST').mockImplementation((async () => {
        current = couple({ theme: 'LAVENDER' });
        return ok(current);
      }) as never),
    );
    await renderWithClient(
      <>
        <SettingsSync />
        <CoupleSettingsScreen />
      </>,
    );
    expect(await screen.findByTestId('couple-theme-pending-partner')).toHaveTextContent(/Ану «Лаванда»/);
    await fireEvent.press(screen.getByTestId('couple-theme-accept'));
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/couple/theme-proposals/{proposalId}/accept', { params: { path: { proposalId: 'tp1' } } }));
    await waitFor(() => expect(usePrefsStore.getState().palette).toBe('LAVENDER'));
    expect(screen.getByTestId('theme-root')).toHaveStyle({ backgroundColor: colorsFor('LAVENDER', 'dark').bg });
  });

  it('AC-138 татгалзах — decline, сэдэв хэвээр', async () => {
    current = couple({ pendingThemeProposal: proposal(PARTNER.id, 'FOREST') });
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => {
      current = couple();
      return ok(undefined, 204);
    }) as never);
    spies.push(post);
    await renderWithClient(
      <>
        <SettingsSync />
        <CoupleSettingsScreen />
      </>,
    );
    await fireEvent.press(await screen.findByTestId('couple-theme-decline'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/couple/theme-proposals/{proposalId}/decline', { params: { path: { proposalId: 'tp1' } } }));
    await waitFor(() => expect(screen.queryByTestId('couple-theme-pending-partner')).toBeNull());
    expect(usePrefsStore.getState().palette).toBe('CORAL');
  });

  it('AC-138 хамтрагч зөвшөөрсөн (couple.updated → дахин татсан) сэдэв SettingsSync-ээр палитр болно', async () => {
    current = couple({ theme: 'OCEAN' });
    await renderWithClient(<SettingsSync />);
    await waitFor(() => expect(usePrefsStore.getState().palette).toBe('OCEAN'));
  });

  it('AC-190 маскотын бүсний өнгө — PATCH mascotColor, локал маскот шууд', async () => {
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok(couple({ myView: { partnerNickname: null, partnerAvatar: null, mascotColor: 'mint' } }))) as never);
    spies.push(patch);
    await renderWithClient(<CoupleSettingsScreen />);
    await fireEvent.press(await screen.findByTestId('couple-mascot-mint'));
    expect(usePrefsStore.getState().mascotColor).toBe('mint');
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/couple/my-view', { body: { mascotColor: 'mint' } }));
    expect(screen.getByTestId('couple-mascot-mint').props.accessibilityState.selected).toBe(true);
  });

  it('эхэлсэн өдөр (S-11 руу) ба «Хосоо салгах» (S-86 руу)', async () => {
    await renderWithClient(<CoupleSettingsScreen />);
    expect(await screen.findByTestId('couple-start-date-value')).toHaveTextContent('2023.02.14');
    await fireEvent.press(screen.getByTestId('couple-start-date-edit'));
    expect(router.push).toHaveBeenCalledWith('/start-date');
    await fireEvent.press(screen.getByTestId('couple-breakup-open'));
    expect(router.push).toHaveBeenCalledWith('/settings/breakup');
  });

  it('AC-127 зөвхөн харах горимд (BREAKING) бичих үйлдэл идэвхгүй', async () => {
    current = couple({ status: 'BREAKING', readOnlyUntil: '2026-12-01T00:00:00Z' });
    await renderWithClient(<CoupleSettingsScreen />);
    expect(await screen.findByTestId('couple-read-only')).toBeTruthy();
    expect(screen.getByTestId('couple-avatar-pick')).toBeDisabled();
    expect(screen.getByTestId('couple-theme-propose')).toBeDisabled();
    expect(screen.getByTestId('couple-mascot-mint')).toBeDisabled();
  });

  it('хосгүй бол тайлбар', async () => {
    current = couple({ kind: 'SOLO', partner: null });
    await renderWithClient(<CoupleSettingsScreen />);
    expect(await screen.findByTestId('couple-not-paired')).toBeTruthy();
  });
});
