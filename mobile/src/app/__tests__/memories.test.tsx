import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import MemoriesScreen from '@/app/(tabs)/memories/index';
import { resetPrinted } from '@/components/memories/PolaroidIn';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ok, renderWithClient, summary } from '../../../test/memoryFixtures';

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

let getSpy: jest.SpyInstance;
let pages: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  resetPrinted();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  pages = {
    all: {
      items: [
        summary('a', { title: 'Тэрэлж', occurredOn: '2026-11-05', commentCount: 3, favorite: true }),
        summary('b', { title: 'Кино', occurredOn: '2026-11-01', status: 'UPLOADING' }),
        summary('c', { title: 'Намрын алхалт', occurredOn: '2026-10-12' }),
      ],
      nextCursor: null,
    },
    private: { items: [summary('p', { title: 'Ганцаараа', visibility: 'PRIVATE' })], nextCursor: null },
  };
  getSpy = jest.spyOn(api, 'GET').mockImplementation((async (path: string, init?: { params?: { query?: Record<string, unknown> } }) => {
    const query = init?.params?.query ?? {};
    if (path === '/memories') return ok(query.scope === 'private' ? pages.private : pages.all);
    if (path === '/memories/months') {
      return ok([
        { year: 2026, month: 11, count: 2 },
        { year: 2026, month: 10, count: 7 },
      ]);
    }
    if (path === '/memories/places') return ok([{ lat: 47.8, lon: 106, placeName: 'Хустай', memoryIds: ['a', 'c'], count: 2 }]);
    if (path === '/recaps') return ok([{ id: 'r1', anniversaryOn: '2026-09-01', yearLabel: '1 дэх жил' }]);
    return ok({});
  }) as never);
});

afterEach(() => getSpy.mockRestore());

describe('S-30 Дурсамжийн timeline', () => {
  it('AC-80 сараар бүлэглэсэн толгой «2026 оны 11 сар · 2 дурсамж», карт бүр төлөвтэй', async () => {
    await renderWithClient(<MemoriesScreen />);
    await waitFor(() => expect(screen.getByText('2026 оны 11 сар · 2 дурсамж')).toBeTruthy());
    expect(screen.getByText('2026 оны 10 сар · 7 дурсамж')).toBeTruthy();
    expect(screen.getByTestId('memory-card-a')).toBeTruthy();
    expect(screen.getByTestId('memory-card-favorite')).toBeTruthy();
    expect(screen.getByTestId('memory-card-uploading')).toBeTruthy();
    expect(getSpy).toHaveBeenCalledWith('/memories', { params: { query: { limit: 20 } } });
  });

  it('R-4 / AC-67 «Хувийн» chip → scope=private, PRIVATE тэмдэг', async () => {
    const view = await renderWithClient(<MemoriesScreen />);
    await waitFor(() => expect(screen.getByTestId('memories-chip-private')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('memories-chip-private'));
    expect(router.setParams).toHaveBeenCalledWith({ scope: 'private' });

    mockParams = { scope: 'private' };
    await view.rerender(<MemoriesScreen />);
    await waitFor(() => expect(screen.getByTestId('memory-card-p')).toBeTruthy());
    expect(screen.getByTestId('memory-card-private')).toBeTruthy();
    expect(getSpy).toHaveBeenCalledWith('/memories', { params: { query: { scope: 'private', limit: 20 } } });
    expect(getSpy).toHaveBeenCalledWith('/memories/months', { params: { query: { scope: 'private' } } });
  });

  it('ANIM-13 энэ ажиллалтад нэмэгдсэн дурсамж polaroid-оор гарна; хуучин нь үгүй', async () => {
    pages.all = { items: [summary('new', { createdAt: new Date(Date.now() + 60_000).toISOString() }), summary('old')], nextCursor: null };
    await renderWithClient(<MemoriesScreen />);
    await waitFor(() => expect(screen.getByTestId('memory-card-new')).toBeTruthy());
    expect(screen.getAllByTestId('anim-ANIM-13')).toHaveLength(1);
  });

  it('ANIM-11 хоосон төлөв → S-32 (Capture Moment); FAB ч мөн адил', async () => {
    pages.all = { items: [], nextCursor: null };
    await renderWithClient(<MemoriesScreen />);
    await waitFor(() => expect(screen.getByTestId('anim-ANIM-11')).toBeTruthy());
    expect(screen.getByText('Та хоёрын анхны дурсамж энд хадгалагдана.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('state-empty-action'));
    expect(router.push).toHaveBeenCalledWith('/memory-editor');
    await fireEvent.press(screen.getByTestId('memories-fab'));
    expect(router.push).toHaveBeenCalledTimes(2);
  });

  it('AC-86 «Газрын зураг» таб — газруудын жагсаалт тоотой; «Жилийн тойм» → S-38', async () => {
    mockParams = { view: 'map' };
    const view = await renderWithClient(<MemoriesScreen />);
    await waitFor(() => expect(screen.getByTestId('memories-place')).toBeTruthy());
    expect(screen.getByText('Газруудын жагсаалт')).toBeTruthy();
    expect(screen.getByText('2 дурсамж')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('memories-place'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/memories/search', params: { place: 'Хустай' } });

    mockParams = { view: 'recap' };
    await view.rerender(<MemoriesScreen />);
    await waitFor(() => expect(screen.getByTestId('memories-recap')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('memories-recap'));
    expect(router.push).toHaveBeenCalledWith('/recap/r1');
  });

  it('табыг солиход ?view= шинэчлэгдэнэ', async () => {
    await renderWithClient(<MemoriesScreen />);
    await fireEvent.press(screen.getByTestId('memories-view-map'));
    expect(router.setParams).toHaveBeenCalledWith({ view: 'map' });
  });
});
