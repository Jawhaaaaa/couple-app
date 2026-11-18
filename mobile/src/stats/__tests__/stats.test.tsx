import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { captureRef } from 'react-native-view-shot';

import { api } from '@/api/client';
import type { YearInReview } from '@/api/queries/stats';
import StatsScreen from '@/app/(tabs)/together/stats';
import YearInReviewScreen from '@/app/year/[year]';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, renderWithClient } from '../../../test/memoryFixtures';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///year.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const STATS = { memories: 1234, photos: 3000, videos: 12, dates: 40, goalsCompleted: 3, letters: 9, daysTogether: 745, heartsSent: 5021, cities: 3, countries: 2, distanceKm: 2987.4 };
const REVIEW: YearInReview = {
  year: 2026,
  totals: { memories: 120, dates: 14 },
  topMonth: { month: 7, count: 30 },
  topPlace: { placeName: 'Тэрэлж', count: 8 },
  topMemories: [],
  slides: [
    { kind: 'TITLE', title: 'Бидний 2026' },
    { kind: 'STAT', title: 'дурсамж', value: 120 },
    { kind: 'STAT', title: 'болзоо', value: 14 },
    { kind: 'STAT', title: '7 сар', value: 30 },
    { kind: 'PLACE', title: 'Тэрэлж', value: 8 },
    { kind: 'CLOSING', title: 'Дараагийн жил ч хамтдаа' },
  ],
};

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs, animation: 'OFF' });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => (path === '/stats' ? ok(STATS) : ok(REVIEW))) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-71 статистик', () => {
  it('AC-117 AC-47 серверийн тоо бүр (Монгол формат «1 234»), хот/улс/км', async () => {
    await renderWithClient(<StatsScreen />);
    expect(await screen.findByTestId('stat-memories-value')).toHaveTextContent('1 234');
    expect(screen.getByTestId('stat-heartsSent-value')).toHaveTextContent('5 021');
    expect(screen.getByTestId('stat-cities')).toHaveTextContent('3 хот');
    expect(screen.getByTestId('stat-countries')).toHaveTextContent('2 улс');
    expect(screen.getByTestId('stat-distance')).toHaveTextContent(/2 987 км/);
    await fireEvent.press(screen.getByTestId('stat-year'));
    expect(router.push).toHaveBeenCalledWith(`/year/${new Date().getFullYear()}`);
  });
});

describe('S-72 «Бидний жил»', () => {
  it('AC-118 6–10 слайд, сүүлийнх дээр «Зураг болгон хадгалах»', async () => {
    mockParams = { year: '2026' };
    await renderWithClient(<YearInReviewScreen />);
    expect(await screen.findByTestId('recap-story')).toBeTruthy();
    expect(screen.getByTestId('recap-position')).toHaveProp('accessibilityLabel', expect.stringContaining('6'));
    for (let i = 0; i < 5; i += 1) await fireEvent.press(screen.getByTestId('recap-next'));
    await fireEvent.press(await screen.findByTestId('year-save-image'));
    await waitFor(() => expect(captureRef).toHaveBeenCalled());
    expect(await screen.findByTestId('year-save-result')).toHaveTextContent('Зургийг хадгаллаа');
  });

  it('буруу он → алдааны төлөв', async () => {
    mockParams = { year: 'abc' };
    await renderWithClient(<YearInReviewScreen />);
    expect(await screen.findByTestId('state-error')).toBeTruthy();
  });
});
