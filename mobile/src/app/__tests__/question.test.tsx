import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import type { DailyQuestion } from '@/api/queries/questions';
import QuestionScreen from '@/app/(tabs)/home/question';
import { resetRevealMemory } from '@/components/home/RevealAnswer';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

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

const base: DailyQuestion = {
  coupleDay: '2026-11-07',
  question: { id: 'q-0142', textMn: 'Бидний анхны болзоо юу байсан бэ?', textEn: 'What was our first date?', category: 'memories' },
  myAnswer: null,
  partnerAnswered: false,
};
const answer = (text: string) => ({ text, createdAt: '2026-11-07T12:00:00Z' });

const ok = (data: unknown, status = 200) => ({ data, error: undefined, response: new Response(JSON.stringify(data), { status }) });
const fail = (status: number, code: string) => ({
  data: undefined,
  error: { code, message: code, traceId: 't' },
  response: new Response('{}', { status }),
});

let today: DailyQuestion | 'NOT_PAIRED';
let getSpy: jest.SpyInstance;
let postSpy: jest.SpyInstance;

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <QuestionScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRevealMemory();
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u', signedOut: false });
  today = base;
  getSpy = jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
    if (path === '/questions/today') return today === 'NOT_PAIRED' ? fail(409, 'NOT_PAIRED') : ok(today);
    if (path === '/questions/history') {
      return ok({
        items: [
          { ...base, coupleDay: '2026-11-06', question: { ...base.question, id: 'q-0141', textMn: 'Өчигдрийн асуулт' }, myAnswer: answer('Миний'), partnerAnswered: true, partnerAnswer: answer('Түүний') },
        ],
        nextCursor: null,
      });
    }
    if (path === '/couple') return ok({ partner: { displayName: 'Ану', callName: null }, myView: { partnerNickname: null } });
    return ok({});
  }) as never);
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ ...base, myAnswer: answer('Кино'), partnerAnswered: false })) as never);
});

afterEach(() => {
  getSpy.mockRestore();
  postSpy.mockRestore();
});

describe('AC-15 S-22 өдрийн асуулт', () => {
  it('AC-15 асуулт одоогийн хэлээр; хариулсны дараа хамтрагчийнх царцсан «… хүлээж байна»', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('question-text')).toHaveTextContent(base.question.textMn));
    await fireEvent.changeText(screen.getByTestId('question-input'), '  Кино  ');
    await fireEvent.press(screen.getByTestId('question-submit'));
    expect(postSpy).toHaveBeenCalledWith('/questions/today/answer', { body: { text: 'Кино' } });
    await waitFor(() => expect(screen.getByTestId('question-partner-waiting')).toBeTruthy());
    expect(screen.getByText('Ану хариулахыг хүлээж байна…')).toBeTruthy();
    expect(screen.queryByTestId('question-partner-answer')).toBeNull();
  });

  it('AC-15 хамтрагч хариулсан ч би хариулаагүй бол түүний хариулт харагдахгүй', async () => {
    today = { ...base, partnerAnswered: true };
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('question-partner-hidden')).toBeTruthy());
    expect(screen.queryByTestId('question-partner-answer')).toBeNull();
  });

  it('AC-15 хоёулаа хариулсан бол ANIM-19-тэй тодорно', async () => {
    today = { ...base, myAnswer: answer('Кино'), partnerAnswered: true, partnerAnswer: answer('Цэцэрлэгт хүрээлэн') };
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('question-partner-answer')).toHaveTextContent('Цэцэрлэгт хүрээлэн'));
    expect(screen.getByTestId('anim-ANIM-19')).toBeTruthy();
  });

  it('AC-75 түүх хоёр хариулттайгаа', async () => {
    today = { ...base, myAnswer: answer('Кино'), partnerAnswered: false };
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('question-history-item')).toBeTruthy());
    expect(screen.getByText('Өчигдрийн асуулт')).toBeTruthy();
    expect(screen.getByText('Миний')).toBeTruthy();
    expect(screen.getByText('Түүний')).toBeTruthy();
  });

  it('409 ALREADY_ANSWERED — мэдээлэл харуулж төлвийг дахин татна', async () => {
    postSpy.mockImplementation((async () => fail(409, 'ALREADY_ANSWERED')) as never);
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('question-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('question-input'), 'Кино');
    await fireEvent.press(screen.getByTestId('question-submit'));
    await waitFor(() => expect(screen.getByTestId('question-already')).toBeTruthy());
    expect(getSpy.mock.calls.filter(([p]) => p === '/questions/today').length).toBeGreaterThanOrEqual(2);
  });

  it('хосгүй (409 NOT_PAIRED) — урилга руу CTA', async () => {
    today = 'NOT_PAIRED';
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('question-solo')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('question-solo-invite'));
    expect(router.push).toHaveBeenCalledWith('/waiting');
  });
});
