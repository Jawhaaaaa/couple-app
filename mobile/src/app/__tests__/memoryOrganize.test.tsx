import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import MemoryGroupScreen from '@/app/(tabs)/memories/groups/[id]';
import MemorySearchScreen from '@/app/(tabs)/memories/search';
import TrashScreen from '@/app/(tabs)/memories/trash';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { memory, ok, renderWithClient, summary } from '../../../test/memoryFixtures';

let mockParams: Record<string, string> = {};
let mockOffline = false;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/hooks/useOnlineOnly', () => ({ useOnlineOnly: () => ({ disabled: mockOffline }) }));

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const spies: jest.SpyInstance[] = [];
let trash: unknown[];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockOffline = false;
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  trash = [
    { memoryId: 'm1', memory: summary('m1', { title: 'Тэрэлж' }), deletedAt: '2026-11-06T12:00:00Z', purgeAfter: '2026-12-06T12:00:00Z', daysLeft: 29 },
    { memoryId: 'm2', memory: summary('m2', { title: 'Хуучин' }), deletedAt: '2026-10-08T12:00:00Z', purgeAfter: '2026-11-07T23:00:00Z', daysLeft: 0 },
  ];
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
      if (path === '/memories/trash') return ok(trash);
      if (path === '/memory-groups/{groupId}') {
        return ok({ id: 'g1', name: 'Анхны аялал', count: 2, version: 1, memories: [summary('a'), summary('b')] });
      }
      if (path === '/memory-groups') return ok([{ id: 'g1', name: 'Анхны аялал', count: 2, version: 1 }]);
      if (path === '/memory-tags') return ok(['аялал', 'уул']);
      if (path === '/memories') return ok({ items: [summary('s1', { title: 'Хустай' })], nextCursor: null });
      if (path === '/couple') return ok({ partner: { displayName: 'Ану', callName: null }, myView: { partnerNickname: null } });
      return ok({});
    }) as never),
    jest.spyOn(api, 'POST').mockImplementation((async () => ok(memory('m1', { title: 'Тэрэлж' }))) as never),
    jest.spyOn(api, 'DELETE').mockImplementation((async () => ok(undefined, 204)) as never),
  );
});

afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-37 Хогийн сав', () => {
  it('AC-23 үлдсэн хоног, сэргээх (сэтгэгдэл, реакцтайгаа буцна)', async () => {
    await renderWithClient(<TrashScreen />);
    await waitFor(() => expect(screen.getByTestId('trash-days-m1')).toHaveTextContent('29 хоногийн дараа бүрмөсөн устна'));
    expect(screen.getByTestId('trash-days-m2')).toHaveTextContent('Өнөөдөр бүрмөсөн устна');
    await fireEvent.press(screen.getByTestId('trash-restore-m1'));
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/memories/{memoryId}/restore', { params: { path: { memoryId: 'm1' } } }));
    await waitFor(() => expect(screen.getByTestId('trash-restored')).toHaveTextContent('«Тэрэлж» сэргээгдлээ.'));
  });

  it('AC-23 бүрмөсөн устгах нь баталгаажуулалттай', async () => {
    await renderWithClient(<TrashScreen />);
    await waitFor(() => expect(screen.getByTestId('trash-purge-m2')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('trash-purge-m2'));
    expect(api.DELETE).not.toHaveBeenCalled();
    expect(screen.getByTestId('trash-purge-confirm-body')).toHaveTextContent('«Хуучин», түүний зураг, сэтгэгдэл дахин сэргэхгүй.');
    await fireEvent.press(screen.getByTestId('trash-purge-confirm-confirm'));
    await waitFor(() => expect(api.DELETE).toHaveBeenCalledWith('/memories/{memoryId}/purge', { params: { path: { memoryId: 'm2' } } }));
  });

  it('хоосон бол S-37 хоосон төлөв → дурсамж руу', async () => {
    trash = [];
    await renderWithClient(<TrashScreen />);
    await waitFor(() => expect(screen.getByText('Хогийн сав хоосон байна.')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('state-empty-action'));
    expect(router.replace).toHaveBeenCalledWith('/memories');
  });
});

describe('S-35 Цомог', () => {
  it('AC-81 цомог устгахад дурсамжууд хэвээр үлдэхийг хэлнэ', async () => {
    mockParams = { id: 'g1' };
    await renderWithClient(<MemoryGroupScreen />);
    await waitFor(() => expect(screen.getByTestId('group-count')).toHaveTextContent('2 дурсамж'));
    expect(screen.getByTestId('memory-card-a')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('group-delete'));
    expect(screen.getByText('«Анхны аялал» цомгийг устгах уу?')).toBeTruthy();
    expect(screen.getByTestId('group-delete-confirm-body')).toHaveTextContent('Зөвхөн цомог устна — доторх 2 дурсамж хэвээр үлдэнэ.');
    await fireEvent.press(screen.getByTestId('group-delete-confirm-confirm'));
    await waitFor(() => expect(api.DELETE).toHaveBeenCalledWith('/memory-groups/{groupId}', { params: { path: { groupId: 'g1' } } }));
    expect(api.DELETE).not.toHaveBeenCalledWith('/memories/{memoryId}', expect.anything());
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('цомгоос хасах нь зөвхөн холбоосыг устгана', async () => {
    mockParams = { id: 'g1' };
    await renderWithClient(<MemoryGroupScreen />);
    await waitFor(() => expect(screen.getByTestId('group-take-out-a')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('group-take-out-a'));
    await waitFor(() =>
      expect(api.DELETE).toHaveBeenCalledWith('/memory-groups/{groupId}/memories/{memoryId}', { params: { path: { groupId: 'g1', memoryId: 'a' } } }),
    );
  });
});

describe('S-34 Хайлт', () => {
  it('AC-175 шүүлтүүрийг хослуулж GET /memories-ийн query болгоно', async () => {
    await renderWithClient(<MemorySearchScreen />);
    await waitFor(() => expect(screen.getByTestId('search-tag-аялал')).toBeTruthy());
    expect(screen.getByTestId('search-hint')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('search-q'), ' нуур ');
    await fireEvent.changeText(screen.getByTestId('search-from'), '2025-01-01');
    await fireEvent.changeText(screen.getByTestId('search-to'), '2025-12-3');
    await fireEvent.press(screen.getByTestId('search-tag-аялал'));
    await fireEvent.press(screen.getByTestId('search-group-g1'));
    await fireEvent.press(screen.getByTestId('search-author-partner'));
    await fireEvent.press(screen.getByTestId('search-favorite'));
    await fireEvent.changeText(screen.getByTestId('search-place'), 'Хустай');
    await waitFor(() =>
      expect(api.GET).toHaveBeenCalledWith('/memories', {
        params: { query: { q: 'нуур', from: '2025-01-01', tag: 'аялал', groupId: 'g1', author: 'partner', favorite: true, place: 'Хустай', limit: 20 } },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('memory-card-s1')).toBeTruthy());
    expect(screen.getByTestId('search-author-partner')).toHaveTextContent('Ану');
  });

  it('?place= параметрээс шууд хайна (газрын жагсаалтаас)', async () => {
    mockParams = { place: 'Хустай' };
    await renderWithClient(<MemorySearchScreen />);
    await waitFor(() => expect(api.GET).toHaveBeenCalledWith('/memories', { params: { query: { place: 'Хустай', limit: 20 } } }));
  });

  it('offline-д идэвхгүй, шалтгаантай; хүсэлт явахгүй', async () => {
    mockOffline = true;
    mockParams = { q: 'нуур' };
    await renderWithClient(<MemorySearchScreen />);
    expect(screen.getByTestId('search-offline')).toHaveTextContent('Хайлт интернэт шаарддаг. Холбогдмогц дахин оролдоорой.');
    expect(screen.getByTestId('search-q').props.editable).toBe(false);
    expect((api.GET as jest.Mock).mock.calls.filter(([p]) => p === '/memories')).toHaveLength(0);
  });
});
