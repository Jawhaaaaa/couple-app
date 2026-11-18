import { screen } from '@testing-library/react-native';

import { api } from '@/api/client';
import OnThisDayScreen from '@/app/(tabs)/home/on-this-day';
import { OnThisDaySection } from '@/components/home/HomeSections';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, renderWithClient, summary } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('AC-73 S-23 Жилийн өмнөх өнөөдөр', () => {
  it('жил бүрээр бүлэглэж дурсамжуудыг харуулна', async () => {
    spies.push(
      jest.spyOn(api, 'GET').mockImplementation((async () =>
        ok([
          { year: 2025, memories: [summary('m1', { title: 'Нэг жилийн өмнө', occurredOn: '2025-11-07' })] },
          { year: 2024, memories: [summary('m2', { title: 'Хоёр жилийн өмнө', occurredOn: '2024-11-07' })] },
        ])) as never),
    );
    await renderWithClient(<OnThisDayScreen />);
    expect(await screen.findByText('Нэг жилийн өмнө')).toBeTruthy();
    expect(screen.getAllByTestId('on-this-day-year').map((n) => n.props.children)).toEqual(['2025 он', '2024 он']);
  });

  it('тийм дурсамжгүй өдөр нүүрний карт нуугдана; байвал S-23 руу холбоно', async () => {
    const { rerender } = await renderWithClient(<OnThisDaySection data={null} />);
    expect(screen.queryByTestId('home-on-this-day')).toBeNull();
    await rerender(<OnThisDaySection data={{ count: 1, memories: [summary('m1', { title: 'Нэг жилийн өмнө' })] } as never} />);
    expect(screen.getByTestId('home-on-this-day')).toBeTruthy();
  });
});
