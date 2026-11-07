import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';
import { exportRequest } from '@/api/queries/exports';
import ExportScreen from '@/app/(tabs)/memories/export';
import RecapScreen from '@/app/recap/[id]';
import { saveFile } from '@/media/saveFile';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';

import { fail, media, ok, renderWithClient } from '../../../test/memoryFixtures';

let mockOffline = false;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: 'r1' }),
}));

jest.mock('@/hooks/useOnlineOnly', () => ({ useOnlineOnly: () => ({ disabled: mockOffline }) }));
jest.mock('@/media/saveFile', () => ({ saveFile: jest.fn(async () => 'shared') }));

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const RECAP = {
  id: 'r1',
  anniversaryOn: '2026-09-01',
  yearLabel: '1 дэх жил',
  slides: [
    { kind: 'TITLE', title: 'Бидний анхны жил' },
    { kind: 'STAT', title: 'дурсамж хамтдаа', value: 1240 },
    { kind: 'MEMORY', title: 'Анхны аялал', media: media('cover'), memoryId: 'm1' },
    { kind: 'PLACE', title: 'Хамгийн их очсон газар', body: 'Хустай' },
    { kind: 'CLOSING', title: 'Дараагийн жилдээ' },
  ],
};

let exportsList: unknown[];
const spies: jest.SpyInstance[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
  usePrefsStore.setState({ ...defaultPrefs, animation: 'REDUCED' });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  exportsList = [
    { id: 'e1', kind: 'BOOK_PDF', status: 'READY', createdAt: '2026-11-01T10:00:00Z', readyAt: '2026-11-01T10:05:00Z', expiresAt: '2026-11-08T10:05:00Z' },
    { id: 'e2', kind: 'ALBUM_ZIP', status: 'RUNNING', createdAt: '2026-11-07T10:00:00Z' },
    { id: 'e3', kind: 'ALBUM_ZIP', status: 'EXPIRED', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'e4', kind: 'BOOK_PDF', status: 'FAILED', createdAt: '2026-09-01T10:00:00Z' },
  ];
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
      if (path === '/recaps/{recapId}') return ok(RECAP);
      if (path === '/exports') return ok(exportsList);
      if (path === '/memory-groups') return ok([{ id: 'g1', name: 'Аялал', count: 3, version: 0 }]);
      return ok({});
    }) as never),
    jest.spyOn(api, 'POST').mockImplementation((async () => {
      const created = { id: 'e9', kind: 'BOOK_PDF', status: 'QUEUED', createdAt: '2026-11-07T12:00:00Z' };
      exportsList = [created, ...exportsList];
      return ok(created, 202);
    }) as never),
  );
});

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  jest.useRealTimers();
});

describe('S-38 жилийн хураангуй (AC-84, ANIM-22)', () => {
  it('слайдууд дарааллаар: товшвол дараах/өмнөх, STAT тоо reduce motion-д шууд эцсийн утга', async () => {
    await renderWithClient(<RecapScreen />);
    await waitFor(() => expect(screen.getByTestId('recap-slide-TITLE')).toBeTruthy());
    expect(screen.getByText('Бидний анхны жил')).toBeTruthy();
    expect(screen.getByTestId('anim-ANIM-22')).toBeTruthy();
    expect(screen.getByTestId('recap-position').props.accessibilityLabel).toBe('1 / 5 слайд');

    await fireEvent.press(screen.getByTestId('recap-next'));
    expect(screen.getByTestId('recap-stat-value')).toHaveTextContent('1 240');
    await fireEvent.press(screen.getByTestId('recap-next'));
    expect(screen.getByTestId('recap-kenburns')).toBeTruthy();
    expect(screen.getByTestId('recap-open-memory')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recap-prev'));
    expect(screen.getByTestId('recap-slide-STAT')).toBeTruthy();
  });

  it('автоматаар дараагийн слайд руу шилжинэ, түр зогсоовол зогсоно; сүүлийнх дээр «Дуусгах»', async () => {
    jest.useFakeTimers();
    await renderWithClient(<RecapScreen />);
    await waitFor(() => expect(screen.getByTestId('recap-slide-TITLE')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(6100);
    });
    expect(screen.getByTestId('recap-slide-STAT')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recap-pause'));
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.getByTestId('recap-slide-STAT')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recap-pause'));
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(6100);
      });
    }
    expect(screen.getByTestId('recap-slide-CLOSING')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recap-done'));
    expect(router.back).toHaveBeenCalled();
  });

  it('хөдөлгөөн бүрэн үед STAT тоолж өсөж эцэстээ утгандаа хүрнэ', async () => {
    usePrefsStore.setState({ animation: 'ALL' });
    await renderWithClient(<RecapScreen />);
    await waitFor(() => expect(screen.getByTestId('recap-slide-TITLE')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recap-next'));
    await waitFor(() => expect(screen.getByTestId('recap-stat-value')).toHaveTextContent('1 240'), { timeout: 3000 });
  });
});

describe('S-39 экспорт (AC-126)', () => {
  it('төлөв бүр шошготой; бэлэн бол татах, хугацаа дууссан/бүтэлгүйтсэн бол товчгүй', async () => {
    await renderWithClient(<ExportScreen />);
    await waitFor(() => expect(screen.getByTestId('export-status-e1')).toHaveTextContent('Бэлэн'));
    expect(screen.getByTestId('export-status-e2')).toHaveTextContent('Бэлтгэж байна…');
    expect(screen.getByTestId('export-status-e3')).toHaveTextContent('Хугацаа дууссан');
    expect(screen.getByTestId('export-status-e4')).toHaveTextContent('Бүтэлгүйтсэн');
    expect(screen.queryByTestId('export-download-e3')).toBeNull();
    // RUNNING байгаа үед «нэг экспорт бэлтгэгдэж байна»
    expect(screen.getByTestId('export-busy')).toHaveTextContent(/^Нэг экспорт бэлтгэгдэж байна/);

    await fireEvent.press(screen.getByTestId('export-download-e1'));
    await waitFor(() =>
      expect(saveFile).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringMatching(/\/exports\/e1\/download$/),
          fileName: 'aura-dursamj.pdf',
          headers: { Authorization: 'Bearer at' },
        }),
      ),
    );
  });

  it('PDF ном, цомгоор хүрээ → POST /exports', async () => {
    exportsList = [];
    await renderWithClient(<ExportScreen />);
    await waitFor(() => expect(screen.getByTestId('export-none')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('export-scope-group'));
    expect(screen.getByTestId('export-start').props.accessibilityState.disabled).toBe(true);
    await waitFor(() => expect(screen.getByTestId('export-group-g1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('export-group-g1'));
    await fireEvent.press(screen.getByTestId('export-start'));
    await waitFor(() => expect(api.POST).toHaveBeenCalledWith('/exports', { body: { kind: 'BOOK_PDF', groupId: 'g1', locale: 'mn' } }));
    await waitFor(() => expect(screen.getByTestId('export-started')).toBeTruthy());
    expect(screen.getByTestId('export-status-e9')).toHaveTextContent('Дараалалд');
  });

  it('429 → «Нэг экспорт бэлтгэгдэж байна» (алдаа биш мэдээлэл)', async () => {
    exportsList = [];
    (api.POST as jest.Mock).mockImplementation(async () => fail(429, 'RATE_LIMITED'));
    await renderWithClient(<ExportScreen />);
    await waitFor(() => expect(screen.getByTestId('export-none')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('export-kind-zip'));
    await fireEvent.press(screen.getByTestId('export-start'));
    await waitFor(() => expect(screen.getByTestId('export-busy')).toBeTruthy());
    expect(screen.queryByTestId('export-error')).toBeNull();
    expect(api.POST).toHaveBeenCalledWith('/exports', { body: { kind: 'ALBUM_ZIP', locale: 'mn' } });
  });

  it('offline-д идэвхгүй', async () => {
    mockOffline = true;
    await renderWithClient(<ExportScreen />);
    expect(screen.getByTestId('export-offline')).toBeTruthy();
    expect(screen.getByTestId('export-start').props.accessibilityState.disabled).toBe(true);
  });

  it('огнооны хүрээ: дутуу эсвэл урвуу бол хүсэлт үүсэхгүй', () => {
    expect(exportRequest('BOOK_PDF', 'range', { from: '2026-01-01', to: '2026-12-31' }, 'mn')).toEqual({ kind: 'BOOK_PDF', from: '2026-01-01', to: '2026-12-31', locale: 'mn' });
    expect(exportRequest('BOOK_PDF', 'range', { from: '2026-12-31', to: '2026-01-01' }, 'mn')).toBeNull();
    expect(exportRequest('ALBUM_ZIP', 'group', { groupId: null }, 'en')).toBeNull();
  });
});
