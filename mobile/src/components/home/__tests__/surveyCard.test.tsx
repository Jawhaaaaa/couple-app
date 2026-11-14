import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import { DASHBOARD_KEY } from '@/api/queries/dashboard';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { fail, ok, renderWithClient } from '../../../../test/memoryFixtures';

import { SurveyCard } from '../SurveyCard';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

let postSpy: jest.SpyInstance;

beforeEach(() => {
  usePrefsStore.setState({ ...defaultPrefs, animation: 'OFF' });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  postSpy = jest.spyOn(api, 'POST').mockImplementation((async () => ok(undefined, 204)) as never);
});

afterEach(() => postSpy.mockRestore());

describe('S-20 санал асуулгын карт (AC-207, GAP-17)', () => {
  it('AC-207 сервер `due` гэвэл «Энэ апп бидэнд ойр байх мэдрэмж өгдөг» 1–5 ба «Алгасах»', async () => {
    await renderWithClient(<SurveyCard prompt={{ due: true }} />);
    expect(screen.getByTestId('survey-statement')).toHaveTextContent('Энэ апп бидэнд ойр байх мэдрэмж өгдөг');
    for (const score of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`survey-score-${score}`)).toBeTruthy();
    expect(screen.getByLabelText('4 гэж үнэлэх')).toBeTruthy();
    expect(screen.getByTestId('survey-skip')).toHaveTextContent('Алгасах');
  });

  it('AC-207 30 хоногт ≤ 1 — сервер `due` биш (эсвэл талбаргүй) бол карт харагдахгүй', async () => {
    const { rerender } = await renderWithClient(<SurveyCard prompt={{ due: false }} />);
    expect(screen.queryByTestId('survey-card')).toBeNull();
    await rerender(<SurveyCard prompt={null} />);
    expect(screen.queryByTestId('survey-card')).toBeNull();
    await rerender(<SurveyCard prompt={undefined} />);
    expect(screen.queryByTestId('survey-card')).toBeNull();
  });

  it('AC-207 оноо илгээхэд POST /me/survey {score} → карт алга, нүүрний кэшээс ч хасагдана', async () => {
    const { client } = await renderWithClient(<SurveyCard prompt={{ due: true }} />);
    client.setQueryData(DASHBOARD_KEY, { survey: { due: true } });
    await fireEvent.press(screen.getByTestId('survey-score-4'));
    await waitFor(() => expect(screen.queryByTestId('survey-card')).toBeNull());
    expect(postSpy).toHaveBeenCalledWith('/me/survey', { body: { score: 4 } });
    expect(client.getQueryData<{ survey: unknown }>(DASHBOARD_KEY)?.survey).toBeNull();
  });

  it('AC-207 «Алгасах» нь `score: null` илгээж картыг хаана', async () => {
    await renderWithClient(<SurveyCard prompt={{ due: true }} />);
    await fireEvent.press(screen.getByTestId('survey-skip'));
    await waitFor(() => expect(screen.queryByTestId('survey-card')).toBeNull());
    expect(postSpy).toHaveBeenCalledWith('/me/survey', { body: { score: null } });
  });

  it('AC-207 өөр төхөөрөмжөөс хариулсан (409 SURVEY_NOT_DUE) бол алдаагүйгээр алга', async () => {
    postSpy.mockImplementation((async () => fail(409, 'SURVEY_NOT_DUE')) as never);
    await renderWithClient(<SurveyCard prompt={{ due: true }} />);
    await fireEvent.press(screen.getByTestId('survey-score-5'));
    await waitFor(() => expect(screen.queryByTestId('survey-card')).toBeNull());
    expect(screen.queryByTestId('survey-error')).toBeNull();
  });

  it('сүлжээний алдаанд карт үлдэж алдааг харуулна — дахин оролдох боломжтой', async () => {
    postSpy.mockImplementation((async () => fail(500, 'INTERNAL')) as never);
    await renderWithClient(<SurveyCard prompt={{ due: true }} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('survey-score-2'));
    });
    await waitFor(() => expect(screen.getByTestId('survey-error')).toBeTruthy());
    expect(screen.getByTestId('survey-card')).toBeTruthy();
  });
});
