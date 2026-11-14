import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { DateIdea, LibraryIdea } from '@/api/queries/ideas';
import BudgetScreen from '@/app/(tabs)/plans/budget';
import DeckScreen from '@/app/(tabs)/plans/deck';
import IdeaEditorScreen from '@/app/(tabs)/plans/idea-editor';
import IdeasScreen from '@/app/(tabs)/plans/ideas';
import LibraryScreen from '@/app/(tabs)/plans/library';
import RandomScreen from '@/app/(tabs)/plans/random';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { fail, ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));
jest.mock('@/auth/device', () => ({ deviceTimezone: () => 'Asia/Ulaanbaatar', deviceInfo: () => ({ name: 'test', platform: 'IOS' }) }));

configure({ asyncUtilTimeout: 5000 });

const idea = (id: string, o: Partial<DateIdea> = {}): DateIdea => ({
  id,
  title: `Санаа ${id}`,
  category: 'HOME',
  setting: 'HOME',
  budgetMnt: 30000,
  author: ME,
  createdAt: '2026-11-01T00:00:00Z',
  version: 1,
  ...o,
});
const lib = (id: string, o: Partial<LibraryIdea> = {}): LibraryIdea => ({
  id,
  title: `Сан ${id}`,
  description: 'Тайлбар',
  category: 'OUTDOOR',
  budgetBand: 'FREE',
  seasons: ['WINTER'],
  setting: 'OUTDOOR',
  longDistance: false,
  durationMinutes: 90,
  preparation: '',
  ...o,
});

type Handler = (path: string, init?: { params?: { query?: Record<string, unknown> }; body?: Record<string, unknown> }) => unknown;
let getHandler: Handler;
const spies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  getHandler = () => ok([]);
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string, init?: never) => {
      if (path === '/me') return ok({ id: ME.id, displayName: ME.displayName, callName: null, timezone: 'Asia/Ulaanbaatar', avatar: null });
      if (path === '/couple') return ok({ partner: { id: PARTNER.id, displayName: PARTNER.displayName, callName: null, avatar: null }, myView: { partnerNickname: null, partnerAvatar: null } });
      return getHandler(path, init);
    }) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

function mockPost(handler: Handler) {
  const post = jest.spyOn(api, 'POST').mockImplementation((async (path: string, init: never) => handler(path, init)) as never);
  spies.push(post);
  return post;
}

describe('S-51 санаанууд ба S-53 санаа', () => {
  it('AC-179 S-51 ангиллаар шүүнэ; «Болзоо болгох» S-54 ноорогтой', async () => {
    getHandler = (path, init) => (path === '/ideas' ? ok(init?.params?.query?.category === 'CULTURE' ? [idea('c1', { category: 'CULTURE', title: 'Театр' })] : [idea('h1')]) : ok([]));
    await renderWithClient(<IdeasScreen />);
    expect(await screen.findByTestId('idea-h1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ideas-category-CULTURE'));
    expect(await screen.findByText('Театр')).toBeTruthy();
    expect(api.GET).toHaveBeenCalledWith('/ideas', { params: { query: { category: 'CULTURE' } } });
    await fireEvent.press(screen.getByTestId('idea-to-plan-c1'));
    const call = (router.push as jest.Mock).mock.calls.at(-1)[0] as { pathname: string; params: { draft: string } };
    expect(call.pathname).toBe('/plans/new');
    expect(JSON.parse(call.params.draft)).toMatchObject({ title: 'Театр', category: 'CULTURE', ideaId: 'c1' });
  });

  it('AC-179 S-53 гарчиггүй хадгалахад талбарын алдаа; бөглөөд хадгалахад POST /ideas', async () => {
    const post = mockPost((_p, init) => ok(idea('n1', { title: String(init?.body?.title) }), 201));
    await renderWithClient(<IdeaEditorScreen />);
    await fireEvent.press(await screen.findByTestId('idea-save'));
    expect(await screen.findByText('Гарчгаа бичнэ үү')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('idea-title'), 'Гэрийн кино үдэш');
    await fireEvent.press(screen.getByTestId('idea-category-CULTURE'));
    await fireEvent.changeText(screen.getByTestId('idea-budget'), '20000');
    await fireEvent.press(screen.getByTestId('idea-setting-HOME'));
    await fireEvent.press(screen.getByTestId('idea-save'));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/ideas', {
        body: expect.objectContaining({ title: 'Гэрийн кино үдэш', category: 'CULTURE', budgetMnt: 20000, setting: 'HOME', clientId: expect.any(String) }),
      }),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('AC-91 чатаас ирсэн ноорог (`?draft=`) S-53-ыг бөглөнө', async () => {
    mockParams = { draft: JSON.stringify({ title: 'Уул руу явъя', description: 'Уул руу явъя\nхоол авна' }) };
    await renderWithClient(<IdeaEditorScreen />);
    expect(await screen.findByTestId('idea-title')).toHaveProp('value', 'Уул руу явъя');
    expect(screen.getByTestId('idea-description')).toHaveProp('value', 'Уул руу явъя\nхоол авна');
    expect(screen.getByTestId('idea-from-chat')).toBeTruthy();
  });
});

describe('S-56 санамсаргүй сонго', () => {
  it('AC-98 тохирох санаа ANIM-17-оор; шүүлт серверт дамжина', async () => {
    getHandler = (path) => (path === '/ideas/random' ? ok({ idea: idea('r1', { title: 'Гэрийн пицца' }), candidates: 4 }) : ok([]));
    await renderWithClient(<RandomScreen />);
    await fireEvent.press(await screen.findByTestId('random-setting-HOME'));
    await fireEvent.press(screen.getByTestId('random-budget-50000'));
    await fireEvent.press(screen.getByTestId('random-pick'));
    expect(await screen.findByText('Гэрийн пицца')).toBeTruthy();
    expect(screen.getByTestId('anim-ANIM-17')).toBeTruthy();
    expect(api.GET).toHaveBeenCalledWith('/ideas/random', { params: { query: { setting: 'HOME', maxBudget: 50000 } } });
  });

  it('AC-98 тохирох алга (204) бол «Шүүлтэд тохирох санаа алга» + «Шүүлт сулруулах» төсвийг хасаж дахин сонгоно', async () => {
    getHandler = (path, init) => {
      if (path !== '/ideas/random') return ok([]);
      return init?.params?.query?.maxBudget !== undefined ? ok(undefined, 204) : ok({ idea: idea('r2', { title: 'Тоглоомын орой' }), candidates: 2 });
    };
    await renderWithClient(<RandomScreen />);
    await fireEvent.press(await screen.findByTestId('random-budget-0'));
    await fireEvent.press(screen.getByTestId('random-pick'));
    expect(await screen.findByTestId('random-no-match')).toHaveTextContent(/Шүүлтэд тохирох санаа алга/);
    await fireEvent.press(screen.getByText('Шүүлт сулруулах'));
    expect(await screen.findByText('Тоглоомын орой')).toBeTruthy();
    expect(api.GET).toHaveBeenLastCalledWith('/ideas/random', { params: { query: {} } });
  });
});

describe('S-57 нууц санал нэгдэл', () => {
  it('AC-36 хоёулаа «Тийм» бол ANIM-18; хамтрагчийн сонголт хаана ч харагдахгүй', async () => {
    getHandler = (path) => {
      if (path === '/deck/next') return ok([{ ideaRef: 'library:lib-1', idea: lib('lib-1', { title: 'Чарга' }) }, { ideaRef: 'idea:2', idea: idea('2') }]);
      if (path === '/deck/matches') return ok([]);
      return ok([]);
    };
    const post = mockPost((_p, init) =>
      init?.body?.liked ? ok({ matched: true, match: { ideaRef: 'library:lib-1', idea: lib('lib-1', { title: 'Чарга' }), matchedAt: '2026-11-07T04:00:00Z' } }) : ok({ matched: false, match: null }),
    );
    await renderWithClient(<DeckScreen />);
    expect(await screen.findByText('Чарга')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('deck-yes'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/deck/swipes', { body: { ideaRef: 'library:lib-1', liked: true } }));
    expect(await screen.findByTestId('deck-match-celebration')).toHaveTextContent(/Чарга/);
    expect(screen.getByTestId('anim-ANIM-18')).toBeTruthy();
    expect(screen.queryByText(/Ану.*(тийм|үгүй)/i)).toBeNull();
  });

  it('карт дуусвал хоосон төлөв — санааны сан руу', async () => {
    getHandler = () => ok([]);
    await renderWithClient(<DeckScreen />);
    await fireEvent.press(await screen.findByTestId('state-empty-action'));
    expect(router.push).toHaveBeenCalledWith('/plans/library');
  });
});

describe('S-58 санааны сан ба S-59 төсөв', () => {
  it('AC-99 «Өвөл» + «Гадаа» шүүлт; «Миний санаа болгох» — хуулбар', async () => {
    getHandler = (path, init) => (path === '/idea-library' ? ok(init?.params?.query?.season === 'WINTER' && init?.params?.query?.setting === 'OUTDOOR' ? [lib('w1', { title: 'Мөсөн гулгуур' })] : [lib('x')]) : ok([]));
    const post = mockPost(() => ok(idea('copy', { title: 'Мөсөн гулгуур', libraryId: 'w1' }), 201));
    await renderWithClient(<LibraryScreen />);
    await fireEvent.press(await screen.findByTestId('library-season-WINTER'));
    await fireEvent.press(screen.getByTestId('library-setting-OUTDOOR'));
    expect(await screen.findByText('Мөсөн гулгуур')).toBeTruthy();
    expect(api.GET).toHaveBeenCalledWith('/idea-library', { params: { query: { season: 'WINTER', setting: 'OUTDOOR', locale: 'mn' } } });
    await fireEvent.press(screen.getByTestId('library-adopt-w1'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/idea-library/{libraryId}/adopt', { params: { path: { libraryId: 'w1' } } }));
    expect(await screen.findByTestId('library-adopted-w1')).toBeTruthy();
  });

  it('AC-97 S-59: «30 000₮ хэтэрсэн», «Би 65% · Ану 35%»', async () => {
    mockParams = { month: '2026-11' };
    getHandler = (path) =>
      path === '/budget/summary'
        ? ok({
            month: '2026-11',
            plannedTotal: 200000,
            actualTotal: 230000,
            overBy: 30000,
            shares: [
              { userId: ME.id, amount: 150000, percent: 65.2 },
              { userId: PARTNER.id, amount: 80000, percent: 34.8 },
            ],
            plans: [{ planId: 'p1', title: 'Тэрэлж', startsAt: '2026-11-14T11:30:00Z', plannedMnt: 200000, actualMnt: 230000, overBy: 30000 }],
          })
        : ok([]);
    await renderWithClient(<BudgetScreen />);
    expect(await screen.findByTestId('budget-over')).toHaveTextContent('30 000₮ хэтэрсэн');
    expect(await screen.findByText('Би 65% · Ану 35%')).toBeTruthy();
    expect(screen.getByTestId('budget-actual')).toHaveTextContent('Бодит: 230 000₮');
    expect(screen.getByTestId('budget-month')).toHaveTextContent('2026 оны 11-р сар');
  });

  it('S-59 алдаа гарвал «Дахин оролдох»', async () => {
    getHandler = (path) => (path === '/budget/summary' ? fail(500, 'INTERNAL') : ok([]));
    await renderWithClient(<BudgetScreen />);
    expect(await screen.findByTestId('state-error')).toBeTruthy();
  });
});
