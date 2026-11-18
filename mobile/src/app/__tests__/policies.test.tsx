import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import PolicyUpdateScreen from '@/app/(auth)/policy-update';
import PoliciesScreen from '@/app/settings/policies';
import ProfileSettingsScreen from '@/app/settings/profile';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ok, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
jest.mock('@/hooks/useOnlineOnly', () => ({ useOnlineOnly: () => ({ disabled: false }) }));

const DOCS = {
  mn: {
    version: '2026-11-14',
    publishedAt: '2026-11-14T00:00:00Z',
    privacyMarkdown: '# Aura — Нууцлалын бодлого\n\n## 4. Админ ба гуравдагч этгээдийн хандалт\n\n- **Админ** зөвхөн хууль ёсны хүсэлтээр.',
    termsMarkdown: '# Aura — Үйлчилгээний нөхцөл\n\n## 1. Хэн ашиглаж болох вэ\n\n18 ба түүнээс дээш насны хүн.',
  },
  en: {
    version: '2026-11-14',
    publishedAt: '2026-11-14T00:00:00Z',
    privacyMarkdown: '# Aura — Privacy Policy\n\n## 4. Admin and third-party access\n\nOnly on lawful request.',
    termsMarkdown: '# Aura — Terms of Service\n\n## 1. Who can use Aura\n\nAdults 18+.',
  },
};

const me = (accepted: string | null, required = false) => ({
  id: 'u-bat',
  email: 'bat@aura.test',
  displayName: 'Бат',
  emailVerified: true,
  policyVersionAccepted: accepted,
  policyUpdateRequired: required,
  space: { id: 's-1', kind: 'COUPLE', status: 'ACTIVE' },
});

let meData: ReturnType<typeof me>;
let getSpy: jest.SpyInstance;
let postSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs, animation: 'OFF' });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  meData = me('2026-11-14');
  getSpy = jest.spyOn(api, 'GET').mockImplementation((async (p: string, init?: { params?: { query?: { locale?: 'mn' | 'en' } } }) => {
    if (p === '/policies/current') return ok(DOCS[init?.params?.query?.locale ?? 'mn']);
    if (p === '/me') return ok(meData);
    return ok({});
  }) as never);
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => ok(undefined, 204)) as never);
});

afterEach(() => {
  getSpy.mockRestore();
  postSpy.mockRestore();
});

describe('S-90 бодлого ба нөхцөл (тохиргоо)', () => {
  it('AC-130 GET /policies/current?locale=mn бодит текст — markdown гарчиг, жагсаалт; админ/гуравдагч хандалтын хэсэг', async () => {
    await renderWithClient(<PoliciesScreen />);
    await waitFor(() => expect(screen.getByTestId('policies-privacy')).toBeTruthy());
    expect(getSpy).toHaveBeenCalledWith('/policies/current', { params: { query: { locale: 'mn' } } });
    expect(screen.getByText('Aura — Нууцлалын бодлого')).toBeTruthy();
    expect(screen.getByText('4. Админ ба гуравдагч этгээдийн хандалт')).toBeTruthy();
    expect(screen.getAllByRole('header').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/\*\*|^#/)).toBeNull();
  });

  it('AC-130 зөвшөөрсөн хувилбар (профайлаас) ба одоогийн хувилбарын нийтэлсэн огноо', async () => {
    await renderWithClient(<PoliciesScreen />);
    await waitFor(() => expect(screen.getByTestId('policies-accepted')).toHaveTextContent('Таны зөвшөөрсөн хувилбар: 2026.11.14'));
    expect(screen.getByTestId('policies-current')).toHaveTextContent('Одоогийн хувилбар: 2026.11.14 · 2026.11.14-нд нийтэлсэн');
    expect(screen.queryByTestId('policies-review-new')).toBeNull();
  });

  it('AC-130 Монгол/Англи — дэлгэц дээр хэл сольж, нөхцөлийн хэсэг рүү шилжинэ', async () => {
    await renderWithClient(<PoliciesScreen />);
    await waitFor(() => expect(screen.getByTestId('policies-locale-en')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('policies-locale-en'));
    await waitFor(() => expect(screen.getByText('Aura — Privacy Policy')).toBeTruthy());
    expect(getSpy).toHaveBeenCalledWith('/policies/current', { params: { query: { locale: 'en' } } });
    await fireEvent.press(screen.getByTestId('policies-doc-terms'));
    expect(screen.getByText('Aura — Terms of Service')).toBeTruthy();
    expect(screen.getByText('Adults 18+.')).toBeTruthy();
  });

  it('AC-63 зөвшөөрсөн хувилбар хуучин бол шинэ хувилбарын хаалга руу', async () => {
    meData = me('2026-11-01', true);
    await renderWithClient(<PoliciesScreen />);
    await waitFor(() => expect(screen.getByTestId('policies-review-new')).toBeTruthy());
    expect(screen.getByTestId('policies-accepted')).toHaveTextContent(/2026.11.01/);
    await fireEvent.press(screen.getByTestId('policies-review-new'));
    expect(router.push).toHaveBeenCalledWith('/policy-update');
  });

  it('зөвшөөрсөн хувилбаргүй бол тэр тухай мэдэгдэнэ', async () => {
    meData = me(null);
    await renderWithClient(<PoliciesScreen />);
    await waitFor(() => expect(screen.getByTestId('policies-accepted')).toHaveTextContent('Зөвшөөрсөн хувилбар бүртгэгдээгүй байна.'));
  });
});

describe('S-90 шинэ хувилбарын хаалга', () => {
  it('AC-63 бодит бодлого + нөхцөлийг (markdown) харуулж, зөвшөөрөхөд POST /me/policy-acceptance {version} → цааш', async () => {
    meData = me('2026-11-01', true);
    const { client } = await renderWithClient(<PolicyUpdateScreen />);
    client.setQueryData(['me'], meData);
    await waitFor(() => expect(screen.getByTestId('policy-text')).toBeTruthy());
    expect(screen.getByText('Aura — Нууцлалын бодлого')).toBeTruthy();
    expect(screen.getByText('Aura — Үйлчилгээний нөхцөл')).toBeTruthy();
    expect(screen.getByTestId('policy-version')).toHaveTextContent('Хувилбар 2026.11.14');
    await fireEvent.press(screen.getByTestId('policy-accept'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(postSpy).toHaveBeenCalledWith('/me/policy-acceptance', { body: { version: '2026-11-14' } });
    expect(client.getQueryData<ReturnType<typeof me>>(['me'])).toMatchObject({ policyUpdateRequired: false, policyVersionAccepted: '2026-11-14' });
  });
});

describe('S-81 профайл — зөвшөөрсөн бодлого', () => {
  const profile = (accepted: string | null, acceptedAt: string | null) => ({
    ...me(accepted),
    birthDate: '1998-05-14',
    timezone: 'Asia/Ulaanbaatar',
    locale: 'mn',
    callName: null,
    city: null,
    avatar: null,
    onlineVisible: true,
    typingVisible: true,
    policyAcceptedAt: acceptedAt,
  });

  it('AC-130 зөвшөөрсөн хувилбар ба огноо (хэрэглэгчийн бүсээр), S-90 руу холбоос', async () => {
    // UTC 2026-11-15 20:30 = Улаанбаатарт 2026-11-16 04:30
    meData = profile('2026-11-14', '2026-11-15T20:30:00Z') as never;
    await renderWithClient(<ProfileSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-policy-version')).toHaveTextContent('Зөвшөөрсөн хувилбар: 2026.11.14'));
    expect(screen.getByTestId('settings-policy-accepted-at')).toHaveTextContent('Зөвшөөрсөн огноо: 2026.11.16');
    await fireEvent.press(screen.getByTestId('settings-policy-open'));
    expect(router.push).toHaveBeenCalledWith('/settings/policies');
  });

  it('зөвшөөрсөн хувилбаргүй бол тэр тухай, огноогүй', async () => {
    meData = profile(null, null) as never;
    await renderWithClient(<ProfileSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-policy-none')).toHaveTextContent('Зөвшөөрсөн хувилбар бүртгэгдээгүй байна.'));
    expect(screen.queryByTestId('settings-policy-accepted-at')).toBeNull();
  });
});
