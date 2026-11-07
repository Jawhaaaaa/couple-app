import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { Memory } from '@/api/queries/memories';
import MemoryDetailScreen from '@/app/(tabs)/memories/[id]';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { memory, ME, media, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: 'm1' }),
}));

jest.mock('expo-video', () => ({ useVideoPlayer: () => ({}), VideoView: () => null }));

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

let current: Memory;
const spies: jest.SpyInstance[] = [];

function mockApi() {
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
      if (path === '/memories/{memoryId}') return ok(current);
      if (path === '/memories/{memoryId}/delete-preview') return ok({ partnerCommentCount: 2, partnerName: 'Ану' });
      if (path === '/couple') return ok({ partner: { displayName: 'Ану', callName: null }, myView: { partnerNickname: null } });
      return ok({});
    }) as never),
    jest.spyOn(api, 'PUT').mockImplementation((async (path: string) => {
      if (path === '/memories/{memoryId}/perspective') {
        return ok({ id: 'p-new', author: ME, text: 'Миний санасан нь', version: 0 });
      }
      return ok(undefined, 204);
    }) as never),
    jest.spyOn(api, 'DELETE').mockImplementation((async (path: string) => {
      if (path === '/memories/{memoryId}') return ok({ memoryId: 'm1', purgeAfter: '2026-12-07T12:00:00Z' });
      return ok(undefined, 204);
    }) as never),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  current = memory('m1', {
    title: 'Анхны аялал',
    author: ME,
    perspectives: [{ id: 'pp', author: PARTNER, text: 'Би тэр өдөр маш их инээсэн', version: 1 }],
    comments: [
      { id: 'c1', memoryId: 'm1', author: PARTNER, text: 'Ямар гоё өдөр байсан бэ', createdAt: '2026-11-07T10:00:00Z', version: 0 },
      { id: 'c2', memoryId: 'm1', author: ME, text: 'Тийм ээ', createdAt: '2026-11-07T10:05:00Z', version: 0 },
    ],
    reactions: [{ emoji: 'HUG', count: 1, userIds: [PARTNER.id], mine: false }],
  });
  mockApi();
});

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
});

describe('S-31 дурсамжийн дэлгэрэнгүй', () => {
  it('гарчиг, огноо, зохиогч, тайлбар, шошго, медиа alt', async () => {
    await renderWithClient(<MemoryDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('memory-title')).toHaveTextContent('Анхны аялал'));
    expect(screen.getByTestId('memory-date')).toHaveTextContent('2026 оны 11 сарын 3');
    expect(screen.getByTestId('memory-author')).toHaveTextContent('Бат нэмсэн');
    expect(screen.getByTestId('memory-description')).toHaveTextContent('Нуурын эрэг дээр');
    expect(screen.getByText('аялал')).toBeTruthy();
    expect(screen.getByTestId('media-carousel')).toBeTruthy();
  });

  it('AC-82 хоёр өнцөг нэр/өнгөөр ялгаатай; зөвхөн өөрийнхөө өнцгийг засна', async () => {
    await renderWithClient(<MemoryDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('perspective-partner')).toBeTruthy());
    expect(screen.getByTestId('perspective-partner-author')).toHaveTextContent('Ану-ийн өнцөг');
    expect(screen.getByTestId('perspective-partner-text')).toHaveTextContent('Би тэр өдөр маш их инээсэн');
    expect(screen.getByTestId('perspective-mine-author')).toHaveTextContent('Миний өнцөг');
    // Хамтрагчийн өнцөгт засах товч байхгүй (INV-03)
    expect(within(screen.getByTestId('perspective-partner')).queryByTestId('perspective-partner-edit')).toBeNull();
    const mineStyle = screen.getByTestId('perspective-mine').props.style;
    const partnerStyle = screen.getByTestId('perspective-partner').props.style;
    expect(JSON.stringify(mineStyle)).not.toEqual(JSON.stringify(partnerStyle));

    await fireEvent.press(screen.getByTestId('perspective-mine-edit'));
    await fireEvent.changeText(screen.getByTestId('perspective-mine-input'), 'Миний санасан нь');
    await fireEvent.press(screen.getByTestId('perspective-mine-save'));
    await waitFor(() =>
      expect(api.PUT).toHaveBeenCalledWith('/memories/{memoryId}/perspective', { params: { path: { memoryId: 'm1' } }, body: { text: 'Миний санасан нь' } }),
    );
  });

  it('AC-174 устгахын өмнө «Анугийн 2 сэтгэгдэл хамт устна» → батлахад хогийн сав (S-37)', async () => {
    await renderWithClient(<MemoryDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('memory-delete')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('memory-delete'));
    await waitFor(() => expect(screen.getByTestId('memory-delete-confirm-body')).toHaveTextContent('Анугийн 2 сэтгэгдэл хамт устна'));
    expect(screen.getByText('30 хоног хогийн саванд хадгалагдана — тэр хооронд сэргээж болно.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('memory-delete-confirm-confirm'));
    await waitFor(() => expect(api.DELETE).toHaveBeenCalledWith('/memories/{memoryId}', { params: { path: { memoryId: 'm1' } } }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/memories/trash'));
  });

  it('INV-03 хамтрагчийн дурсамжид засах/устгах товч байхгүй', async () => {
    current = { ...current, author: PARTNER };
    await renderWithClient(<MemoryDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('memory-title')).toBeTruthy());
    expect(screen.queryByTestId('memory-edit')).toBeNull();
    expect(screen.queryByTestId('memory-delete')).toBeNull();
    expect(screen.getByTestId('memory-favorite')).toBeTruthy();
  });

  it('AC-173 товшвол ❤️; удаан дарвал ANIM-07 нумаар 6 реакц', async () => {
    await renderWithClient(<MemoryDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('reaction-main')).toBeTruthy());
    expect(screen.getByTestId('reaction-count-HUG')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reaction-main'));
    await waitFor(() =>
      expect(api.PUT).toHaveBeenCalledWith('/memories/{memoryId}/reaction', { params: { path: { memoryId: 'm1' } }, body: { emoji: 'LOVE' } }),
    );

    await fireEvent(screen.getByTestId('reaction-main'), 'longPress');
    expect(screen.getByTestId('anim-ANIM-07')).toBeTruthy();
    for (const emoji of ['LOVE', 'ADORE', 'HEART_EYES', 'KISS', 'HUG', 'SPARKLE']) expect(screen.getByTestId(`reaction-pick-${emoji}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reaction-pick-KISS'));
    await waitFor(() =>
      expect(api.PUT).toHaveBeenCalledWith('/memories/{memoryId}/reaction', { params: { path: { memoryId: 'm1' } }, body: { emoji: 'KISS' } }),
    );
  });

  it('AC-173 зөвхөн өөрийн сэтгэгдлийг засах/устгах товчтой', async () => {
    await renderWithClient(<MemoryDetailScreen />);
    await waitFor(() => expect(screen.getAllByTestId('comment')).toHaveLength(2));
    const [partners, mine] = screen.getAllByTestId('comment');
    expect(within(partners).queryByTestId('comment-edit')).toBeNull();
    expect(within(mine).getByTestId('comment-edit')).toBeTruthy();
    expect(within(mine).getByTestId('comment-delete')).toBeTruthy();
  });

  it('PROCESSING видео «Боловсруулж байна…»', async () => {
    current = { ...current, media: [{ media: media('v1', { kind: 'VIDEO', status: 'PROCESSING', mime: 'video/mp4' }), position: 0 }] };
    await renderWithClient(<MemoryDetailScreen />);
    const carousel = await screen.findByTestId('media-carousel');
    await fireEvent.layout(carousel, { width: 360, height: 300 });
    await waitFor(() => expect(screen.getByTestId('media-processing')).toBeTruthy());
    expect(screen.getByText('Боловсруулж байна…')).toBeTruthy();
  });
});
