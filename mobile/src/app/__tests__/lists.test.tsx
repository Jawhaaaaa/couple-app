import { act, configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { Goal } from '@/api/queries/goals';
import type { ListItem } from '@/api/queries/lists';
import GoalDetailScreen from '@/app/(tabs)/together/goals/[id]';
import GoalsScreen from '@/app/(tabs)/together/goals/index';
import NewGoalScreen from '@/app/(tabs)/together/goals/new';
import ListsScreen from '@/app/(tabs)/together/lists';
import { outbox } from '@/offline/outboxRuntime';
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
jest.mock('@/offline/outboxRuntime', () => ({
  outbox: { enqueue: jest.fn(async () => ({})), flush: jest.fn(async () => 0), items: jest.fn(async () => []), subscribe: jest.fn(() => () => undefined) },
}));

configure({ asyncUtilTimeout: 5000 });

function li(id: string, o: Partial<ListItem> = {}): ListItem {
  return { id, title: `Зүйл ${id}`, position: 0, createdBy: ME.id, votes: [], bothWant: false, version: 3, ...o };
}

function goal(o: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Япон аялал',
    createdBy: ME.id,
    targetAmountMnt: 1_000_000,
    steps: [
      { id: 's1', title: 'Виз', position: 0, done: true, doneBy: PARTNER.id },
      { id: 's2', title: 'Тийз', position: 1, done: true, doneBy: ME.id },
      { id: 's3', title: 'Буудал', position: 2, done: false },
      { id: 's4', title: 'Даатгал', position: 3, done: false },
    ],
    stepsDone: 2,
    contributions: [
      { id: 'c1', userId: ME.id, amountMnt: 250_000, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'c2', userId: PARTNER.id, amountMnt: 150_000, createdAt: '2026-11-02T00:00:00Z' },
    ],
    totals: [
      { userId: ME.id, amount: 250_000 },
      { userId: PARTNER.id, amount: 150_000 },
    ],
    progressPercent: 40,
    version: 2,
    ...o,
  };
}

let lists: Record<string, ListItem[]>;
let goalData: Goal;
const spies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  lists = { bucket: [], todo: [], shopping: [], wishlist: [] };
  goalData = goal();
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string, init?: { params?: { path?: { listKind?: string } } }) => {
      if (path === '/me') return ok({ id: ME.id, displayName: ME.displayName, callName: null, timezone: 'Asia/Ulaanbaatar', avatar: null });
      if (path === '/couple') return ok({ partner: { id: PARTNER.id, displayName: PARTNER.displayName, callName: null, avatar: null }, myView: { partnerNickname: null, partnerAvatar: null } });
      if (path === '/lists/{listKind}/items') return ok(lists[init?.params?.path?.listKind ?? 'bucket']);
      if (path === '/goals') return ok([{ id: 'g1', title: 'Япон аялал', targetAmountMnt: 1_000_000, stepsDone: 2, stepsTotal: 4, progressPercent: 40 }]);
      if (path === '/goals/{goalId}') return ok(goalData);
      return ok([]);
    }) as never),
  );
});
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('S-63 жагсаалт', () => {
  it('AC-107 B тэмдэглэсэн зүйл аватар, нэр, цагтай доор бүлэглэгдэнэ; «Дууссаныг цэвэрлэх» POST', async () => {
    mockParams = { kind: 'todo' };
    lists.todo = [li('a', { title: 'Төлбөр' }), li('d', { title: 'Угаалга', doneAt: '2026-11-13T04:30:00Z', doneBy: PARTNER.id })];
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ cleared: 1 })) as never);
    spies.push(post);
    await renderWithClient(<ListsScreen />);
    expect(await screen.findByTestId('list-doneby-d')).toHaveTextContent(/Ану · 2026.11.13 12:30/);
    expect(screen.getByTestId('list-section-done')).toContainElement(screen.getByTestId('list-item-d'));
    expect(screen.getByTestId('list-section-open')).toContainElement(screen.getByTestId('list-item-a'));
    await fireEvent.press(screen.getByTestId('list-clear-done'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/lists/{listKind}/clear-done', { params: { path: { listKind: 'todo' } } }));
  });

  it('AC-107 зүйлийг тэмдэглэхэд PATCH {done, version}', async () => {
    mockParams = { kind: 'shopping' };
    lists.shopping = [li('m', { title: 'Сүү' })];
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => ok(li('m', { title: 'Сүү', doneAt: '2026-11-14T01:00:00Z', doneBy: ME.id, version: 4 }))) as never);
    spies.push(patch);
    await renderWithClient(<ListsScreen />);
    await fireEvent.press(await screen.findByTestId('list-done-m'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/list-items/{itemId}', { params: { path: { itemId: 'm' } }, body: { done: true, version: 3 } }));
    expect(screen.queryByTestId('bucket-memory-sheet')).toBeNull();
  });

  it('AC-109 «Хоёулаа хүсэж байна 💗» дээд талд; санал PUT; доош зөөхөд бүх нээлттэй зүйлийн дараалал PUT', async () => {
    lists.bucket = [li('x', { position: 0 }), li('y', { position: 1 }), li('both', { position: 2, votes: [ME.id, PARTNER.id], bothWant: true })];
    const put = jest.spyOn(api, 'PUT').mockImplementation((async (path: string) => (path.endsWith('/vote') ? ok(li('x', { votes: [ME.id] })) : ok(lists.bucket))) as never);
    spies.push(put);
    await renderWithClient(<ListsScreen />);
    expect(await screen.findByTestId('list-bothwant-both')).toHaveTextContent('Хоёулаа хүсэж байна 💗');
    expect(screen.getByTestId('list-section-wanted')).toContainElement(screen.getByTestId('list-item-both'));
    await fireEvent.press(screen.getByTestId('list-vote-x'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/list-items/{itemId}/vote', { params: { path: { itemId: 'x' } } }));
    await fireEvent.press(screen.getByTestId('list-down-x'));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/lists/{listKind}/order', { params: { path: { listKind: 'bucket' } }, body: { itemIds: ['both', 'y', 'x'] } }),
    );
  });

  it('AC-106 bucket дуусахад confetti + «Дурсамж болгох уу?»; «Үгүй» бол дууссанд огноотой үлдэнэ, «Тийм» бол S-32 ноорог', async () => {
    lists.bucket = [li('k', { title: 'Хөвсгөл' })];
    const doneItem = li('k', { title: 'Хөвсгөл', doneAt: '2026-11-14T02:00:00Z', doneBy: ME.id, version: 4 });
    spies.push(jest.spyOn(api, 'PATCH').mockImplementation((async () => {
      lists.bucket = [doneItem];
      return ok(doneItem);
    }) as never));
    await renderWithClient(<ListsScreen />);
    await fireEvent.press(await screen.findByTestId('list-done-k'));
    expect(await screen.findByTestId('bucket-memory-sheet')).toHaveTextContent(/«Хөвсгөл»-г дурсамж болгох уу\?/);
    await fireEvent.press(screen.getByTestId('bucket-memory-sheet-cancel'));
    expect(await screen.findByTestId('list-doneby-k')).toHaveTextContent(/2026.11.14/);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('AC-110 wishlist-ийн кино «Болзоо болгох» → S-54 гарчиг, ангиллаар', async () => {
    mockParams = { kind: 'wishlist' };
    lists.wishlist = [li('w', { title: 'Interstellar', wishType: 'MOVIE' })];
    await renderWithClient(<ListsScreen />);
    await fireEvent.press(await screen.findByTestId('list-plan-w'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plans/new', params: { draft: JSON.stringify({ title: 'Interstellar', category: 'CULTURE' }) } });
  });

  it('AC-91 чатаас ирсэн ноорог талбарыг бөглөнө; нэмэхэд outbox-оор clientId-тай POST', async () => {
    mockParams = { kind: 'todo', draft: JSON.stringify({ title: 'Хөвсгөл явах', description: 'Хөвсгөл явах\nЗун' }) };
    await renderWithClient(<ListsScreen />);
    expect(await screen.findByTestId('list-from-chat')).toBeTruthy();
    expect(screen.getByTestId('list-new-title').props.value).toBe('Хөвсгөл явах');
    await fireEvent.press(screen.getByTestId('list-add'));
    await waitFor(() =>
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/lists/todo/items',
          body: expect.objectContaining({ title: 'Хөвсгөл явах', description: 'Хөвсгөл явах\nЗун', clientId: expect.any(String) }),
        }),
      ),
    );
    expect(outbox.flush).toHaveBeenCalled();
  });

  it('хоосон гарчигтай нэмэхэд талбарын алдаа; хоосон жагсаалтын товч мөн адил', async () => {
    await renderWithClient(<ListsScreen />);
    await fireEvent.press(await screen.findByTestId('state-empty-action'));
    expect(await screen.findByText('Юу нэмэхээ бичнэ үү')).toBeTruthy();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('AC-41/AC-131 зэрэг засварт «Ану үүнийг саяхан өөрчилжээ» + сонголт; «Миний хувилбар» серверийн version-оор дахин PATCH', async () => {
    lists.bucket = [li('z', { title: 'Хөвсгөл' })];
    const theirs = li('z', { title: 'Хөвсгөл нуур', version: 4 });
    const patch = jest
      .spyOn(api, 'PATCH')
      .mockImplementationOnce((async () => fail(409, 'VERSION_CONFLICT', { current: theirs, updatedBy: PARTNER.id })) as never)
      .mockImplementationOnce((async () => ok(li('z', { title: 'Хөвсгөл, Тэрхийн цагаан нуур', version: 5 }))) as never);
    spies.push(patch);
    await renderWithClient(<ListsScreen />);
    await fireEvent.press(await screen.findByTestId('list-edit-z'));
    await fireEvent.changeText(screen.getByTestId('list-edit-title'), 'Хөвсгөл, Тэрхийн цагаан нуур');
    await fireEvent.press(screen.getByTestId('list-edit-save'));
    expect(await screen.findByText('Ану үүнийг саяхан өөрчилжээ')).toBeTruthy();
    expect(screen.getByTestId('conflict-mine-title')).toHaveTextContent('Хөвсгөл, Тэрхийн цагаан нуур');
    expect(screen.getByTestId('conflict-theirs-title')).toHaveTextContent('Хөвсгөл нуур');
    await fireEvent.press(screen.getByTestId('conflict-keep-mine'));
    await waitFor(() =>
      expect(patch).toHaveBeenLastCalledWith('/list-items/{itemId}', { params: { path: { itemId: 'z' } }, body: { title: 'Хөвсгөл, Тэрхийн цагаан нуур', version: 4 } }),
    );
    await waitFor(() => expect(screen.queryByTestId('conflict-sheet')).toBeNull());
  });
});

describe('S-64 зорилго', () => {
  it('AC-108 жагсаалтад явц, мөнгөн зорилт; хоосон бол «Зорилго тавих» → шинэ', async () => {
    await renderWithClient(<GoalsScreen />);
    expect(await screen.findByTestId('goal-percent-g1')).toHaveTextContent('40%');
    await fireEvent.press(screen.getByTestId('goal-g1'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/together/goals/[id]', params: { id: 'g1' } });
  });

  it('AC-108 дэлгэрэнгүй: «2/4 алхам», 40%, «хэн хэд»; алхам дуусгахад PATCH', async () => {
    mockParams = { id: 'g1' };
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => {
      goalData = goal({ steps: goalData.steps.map((s) => (s.id === 's3' ? { ...s, done: true } : s)), stepsDone: 3 });
      return ok(goalData);
    }) as never);
    spies.push(patch);
    await renderWithClient(<GoalDetailScreen />);
    expect(await screen.findByTestId('goal-steps-fraction')).toHaveTextContent('2/4 алхам');
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('40%');
    expect(screen.getByTestId('goal-raised')).toHaveTextContent('400 000₮ / 1 000 000₮ цугларсан');
    expect(screen.getByTestId(`goal-share-${ME.id}`)).toHaveTextContent(/250 000₮ · 63%/);
    await waitFor(() => expect(screen.getByTestId(`goal-share-${PARTNER.id}`)).toHaveTextContent(/Ану/));
    await fireEvent.press(screen.getByTestId('goal-step-toggle-s3'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/goal-steps/{stepId}', { params: { path: { stepId: 's3' } }, body: { done: true } }));
    expect(await screen.findByTestId('goal-steps-fraction')).toHaveTextContent('3/4 алхам');
  });

  it('AC-42 хандив нэмэхэд POST; хамтрагчийн хандив (goal.updated) ирэхэд явц шинэчлэгдэж 100%-д баярлана (ANIM-20)', async () => {
    mockParams = { id: 'g1' };
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => {
      goalData = goal({ contributions: [...goalData.contributions, { id: 'c3', userId: ME.id, amountMnt: 100_000, createdAt: '2026-11-14T00:00:00Z' }], progressPercent: 50 });
      return ok(goalData, 201);
    }) as never);
    spies.push(post);
    const { client } = await renderWithClient(<GoalDetailScreen />);
    await fireEvent.changeText(await screen.findByTestId('goal-contribution-input'), '100 000');
    await fireEvent.press(screen.getByTestId('goal-contribute'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/goals/{goalId}/contributions', { params: { path: { goalId: 'g1' } }, body: { amountMnt: 100_000 } }));
    expect(await screen.findByTestId('goal-percent')).toHaveTextContent('50%');
    // Хамтрагч үлдсэнийг хандивлав — WS `goal.updated` → кэш шинэчлэгдэнэ
    await act(async () => {
      goalData = goal({ contributions: [{ id: 'c9', userId: PARTNER.id, amountMnt: 1_000_000, createdAt: '2026-11-14T00:00:00Z' }], progressPercent: 100 });
      client.setQueryData(['goal', 'g1'], goalData);
    });
    expect(await screen.findByTestId('goal-complete')).toBeTruthy();
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('100%');
  });

  it('AC-131 зорилгын гарчиг зэрэг засварт сонголт; «Түүний хувилбар» серверийнхийг үлдээнэ', async () => {
    mockParams = { id: 'g1' };
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => fail(409, 'VERSION_CONFLICT', { current: goal({ title: 'Япон, Солонгос', version: 3 }), updatedBy: PARTNER.id })) as never);
    spies.push(patch);
    await renderWithClient(<GoalDetailScreen />);
    await fireEvent.press(await screen.findByTestId('goal-title-edit'));
    await fireEvent.changeText(screen.getByTestId('goal-title-input'), 'Япон 2027');
    await fireEvent.press(screen.getByTestId('goal-title-save'));
    expect(await screen.findByTestId('conflict-sheet')).toBeTruthy();
    expect(screen.getByTestId('conflict-theirs-title')).toHaveTextContent('Япон, Солонгос');
    await fireEvent.press(screen.getByTestId('conflict-keep-theirs'));
    expect(await screen.findByTestId('goal-title')).toHaveTextContent('Япон, Солонгос');
  });

  it('AC-131 засварын үеэр хамтрагчийн goal.updated ирсэн ч засвар эхэлсэн хувилбараар PATCH — чимээгүй дарахгүй', async () => {
    mockParams = { id: 'g1' };
    const patch = jest.spyOn(api, 'PATCH').mockImplementation((async () => fail(409, 'VERSION_CONFLICT', { current: goal({ title: 'Япон, Солонгос', version: 3 }), updatedBy: PARTNER.id })) as never);
    spies.push(patch);
    const { client } = await renderWithClient(<GoalDetailScreen />);
    await fireEvent.press(await screen.findByTestId('goal-title-edit'));
    await fireEvent.changeText(screen.getByTestId('goal-title-input'), 'Япон 2027');
    // Хамтрагч гарчгийг хадгалсан — WS `goal.updated` кэшийг шинэ хувилбараар солино
    await act(async () => {
      client.setQueryData(['goal', 'g1'], goal({ title: 'Япон, Солонгос', version: 3 }));
    });
    await fireEvent.press(screen.getByTestId('goal-title-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/goals/{goalId}', { params: { path: { goalId: 'g1' } }, body: { title: 'Япон 2027', version: 2 } }));
    expect(await screen.findByTestId('conflict-sheet')).toBeTruthy();
    expect(screen.getByTestId('conflict-mine-title')).toHaveTextContent('Япон 2027');
    expect(screen.getByTestId('conflict-theirs-title')).toHaveTextContent('Япон, Солонгос');
  });

  it('шинэ зорилго: алхмууд ба мөнгөн зорилттой POST; буруу дүнд алдаа', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok(goal({ id: 'g9' }), 201)) as never);
    spies.push(post);
    await renderWithClient(<NewGoalScreen />);
    await fireEvent.changeText(await screen.findByTestId('goal-form-title'), 'Япон аялал');
    await fireEvent.changeText(screen.getByTestId('goal-form-amount'), 'мянга');
    await fireEvent.press(screen.getByTestId('goal-form-save'));
    expect(await screen.findByText('Дүнгээ эерэг бүхэл тоогоор оруулна уу')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('goal-form-amount'), '1 000 000');
    await fireEvent.changeText(screen.getByTestId('goal-form-step'), 'Виз');
    await fireEvent.press(screen.getByTestId('goal-form-step-add'));
    await fireEvent.changeText(screen.getByTestId('goal-form-step'), 'Тийз');
    await fireEvent.press(screen.getByTestId('goal-form-save'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/goals', { body: { title: 'Япон аялал', steps: ['Виз', 'Тийз'], targetAmountMnt: 1_000_000 } }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/together/goals/[id]', params: { id: 'g9' } });
  });
});
