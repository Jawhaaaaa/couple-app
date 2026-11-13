import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import type { SharedPromise } from '@/api/queries/chat';
import PromiseSheet from '@/app/(tabs)/chat/promise';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { ME, ok, PARTNER, renderWithClient } from '../../../test/memoryFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

let current: SharedPromise | null;
const spies: jest.SpyInstance[] = [];
const promise = (overrides: Partial<SharedPromise>): SharedPromise =>
  ({ id: 'pr1', text: 'Ням гараг бүр утасгүй орой', status: 'PROPOSED', proposer: PARTNER, startsOn: null, endsOn: null, myOutcome: null, partnerOutcome: null, ...overrides }) as SharedPromise;

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: ME.id, signedOut: false });
  current = null;
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async () => (current ? ok(current) : ok(undefined, 204))) as never),
    jest.spyOn(api, 'POST').mockImplementation((async (path: string, init: { body?: { text?: string; kept?: boolean } }) => {
      if (path === '/promises') return ok(promise({ text: init.body?.text, proposer: ME }), 201);
      if (path === '/promises/{promiseId}/accept') return ok(promise({ status: 'ACTIVE', startsOn: '2026-11-07', endsOn: '2026-11-13' }));
      if (path === '/promises/{promiseId}/decline') return ok(promise({ status: 'DECLINED' }));
      if (path === '/promises/{promiseId}/outcome') return ok(promise({ status: 'ENDED', myOutcome: init.body?.kept ?? null, partnerOutcome: true }));
      return ok({});
    }) as never),
  );
});

afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

describe('AC-93 S-47 хамтын амлалт', () => {
  it('амлалтгүй бол санал болгох (≤ 140); илгээсний дараа «Хариу хүлээж байна»', async () => {
    await renderWithClient(<PromiseSheet />);
    await fireEvent.changeText(await screen.findByTestId('promise-input'), 'а'.repeat(150));
    expect(screen.getByTestId('promise-input')).toHaveProp('value', 'а'.repeat(140));
    await fireEvent.changeText(screen.getByTestId('promise-input'), 'Ням гараг бүр утасгүй орой');
    await fireEvent.press(screen.getByTestId('promise-propose'));
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/promises', { body: { text: 'Ням гараг бүр утасгүй орой' } }));
    expect(await screen.findByTestId('promise-waiting')).toBeTruthy();
    expect(screen.getByTestId('promise-status')).toHaveTextContent('Хариу хүлээж байна');
  });

  it('хамтрагчийн санал — зөвшөөрөхөд 7 хоногийн хугацаатай идэвхтэй', async () => {
    current = promise({});
    await renderWithClient(<PromiseSheet />);
    await fireEvent.press(await screen.findByTestId('promise-accept'));
    await waitFor(() => expect(screen.getByTestId('promise-status')).toHaveTextContent('Энэ 7 хоногийн амлалт'));
    expect(screen.queryByTestId('promise-accept')).toBeNull();
  });

  it('өөрийн санал дээр зөвшөөрөх товч байхгүй', async () => {
    current = promise({ proposer: ME });
    await renderWithClient(<PromiseSheet />);
    expect(await screen.findByTestId('promise-waiting')).toBeTruthy();
    expect(screen.queryByTestId('promise-accept')).toBeNull();
  });

  it('дууссан бол «Амлалтаа биелүүлсэн үү?» Тийм/Дараагийн удаа; хамтрагчийн хариу харагдана', async () => {
    current = promise({ status: 'ENDED', startsOn: '2026-11-07', endsOn: '2026-11-13' });
    await renderWithClient(<PromiseSheet />);
    expect(await screen.findByTestId('promise-outcome')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('promise-kept'));
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/promises/{promiseId}/outcome', { params: { path: { promiseId: 'pr1' } }, body: { kept: true } }));
    expect(await screen.findByTestId('promise-partner-outcome')).toBeTruthy();
  });
});
