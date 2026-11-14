import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { api } from '@/api/client';
import MemoryEditorScreen from '@/app/memory-editor';
import { outbox } from '@/offline/outboxRuntime';
import { currentCoords } from '@/platform/location';
import { useDraftStore } from '@/stores/draftStore';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { stripGps } from '@/upload/stripGps';
import { uploadQueue } from '@/upload/uploadRuntime';

import { fail, memory, ok, renderWithClient } from '../../../test/memoryFixtures';

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('expo-image-picker', () => ({
  PermissionStatus: { DENIED: 'denied', GRANTED: 'granted' },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

jest.mock('@/platform/location', () => ({ currentCoords: jest.fn() }));

jest.mock('@/upload/stripGps', () => ({
  stripGps: jest.fn(async ({ width, height }: { width: number; height: number }) => ({
    uri: 'file:///cache/clean.jpg',
    width: Math.min(width, 2560),
    height: Math.min(height, 1920),
    mime: 'image/jpeg',
  })),
  jpegName: (name: string) => name.replace(/\.[^.]+$/, '') + '.jpg',
}));

jest.mock('@/upload/simpleUpload', () => ({ blobFromUri: jest.fn(async () => new Blob(['jpeg-bytes'])) }));

let mockLocal = 0;
jest.mock('@/upload/uploadRuntime', () => ({
  uploadQueue: {
    add: jest.fn(async () => ({ localId: `local-${++mockLocal}` })),
    wait: jest.fn(async (localId: string) => ({ id: `media-${localId}` })),
    remove: jest.fn(async () => undefined),
  },
  useUploads: () => [],
}));

jest.mock('@/offline/outboxRuntime', () => ({
  outbox: { enqueue: jest.fn(async () => ({})), flush: jest.fn(async () => 0), items: jest.fn(async () => []), subscribe: jest.fn(() => () => undefined) },
}));

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: false,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const library = ImagePicker.launchImageLibraryAsync as jest.Mock;
const EXIF = { DateTimeOriginal: '2025:07:12 14:30:00', GPSLatitude: 47.918, GPSLatitudeRef: 'N', GPSLongitude: 106.917, GPSLongitudeRef: 'E' };

function photo(i: number, exif: Record<string, unknown> | null = null) {
  return { uri: `file:///DCIM/IMG_${i}.HEIC`, width: 4000, height: 3000, type: 'image', fileName: `IMG_${i}.HEIC`, mimeType: 'image/heic', exif };
}

const spies: jest.SpyInstance[] = [];
let patchCalls = 0;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockLocal = 0;
  patchCalls = 0;
  useDraftStore.setState({ drafts: {} });
  usePrefsStore.setState({ ...defaultPrefs });
  useSessionStore.setState({ accessToken: 'at', userId: 'u-bat', signedOut: false });
  spies.push(
    jest.spyOn(api, 'GET').mockImplementation((async (path: string) => {
      if (path === '/memories/{memoryId}') return ok(memory('m1', { title: 'Анхны аялал', version: 3 }));
      if (path === '/memory-groups') return ok([{ id: 'g1', name: 'Аялал', count: 1, version: 0 }]);
      if (path === '/memory-tags') return ok(['аялал']);
      return ok({});
    }) as never),
    jest.spyOn(api, 'POST').mockImplementation((async () => ok(memory('new-1'), 201)) as never),
    jest.spyOn(api, 'PATCH').mockImplementation((async () => {
      patchCalls += 1;
      if (patchCalls === 1) {
        return fail(409, 'VERSION_CONFLICT', { current: memory('m1', { title: 'Аялал (Ану засав)', version: 4 }), updatedBy: 'Ану' });
      }
      return ok(memory('m1', { title: 'Миний гарчиг', version: 5 }));
    }) as never),
  );
});

afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

async function openNew() {
  await renderWithClient(<MemoryEditorScreen />);
  await waitFor(() => expect(screen.getByTestId('editor-pick')).toBeTruthy());
}

describe('S-32 дурсамж нэмэх', () => {
  it('AC-79 EXIF-ийн огноо, байршил «Зурагнаас авсан» тэмдэгтэй бөглөгдөж, засахад тэмдэг арилна', async () => {
    library.mockResolvedValueOnce({ canceled: false, assets: [photo(1, EXIF)] });
    await openNew();
    expect(screen.queryByTestId('editor-date-exif')).toBeNull();
    await fireEvent.press(screen.getByTestId('editor-pick'));
    await waitFor(() => expect(screen.getByTestId('editor-date').props.value).toBe('2025-07-12'));
    expect(screen.getByTestId('editor-date-exif')).toHaveTextContent('Зурагнаас авсан');
    expect(screen.getByTestId('editor-place').props.value).toBe('47.91800, 106.91700');
    expect(screen.getByTestId('editor-lat').props.value).toBe('47.918');
    expect(screen.getByTestId('editor-place-exif')).toBeTruthy();
    expect(library).toHaveBeenCalledWith(expect.objectContaining({ exif: true, allowsMultipleSelection: true, selectionLimit: 20 }));

    await fireEvent.changeText(screen.getByTestId('editor-date'), '2025-07-13');
    expect(screen.queryByTestId('editor-date-exif')).toBeNull();
  });

  it('AC-21 / AC-172 зургийг GPS-гүй ≤ 2560 болгож MEMORY upload дараалалд оруулна', async () => {
    library.mockResolvedValueOnce({ canceled: false, assets: [photo(1, EXIF)] });
    await openNew();
    await fireEvent.press(screen.getByTestId('editor-pick'));
    await waitFor(() => expect(uploadQueue.add).toHaveBeenCalledTimes(1));
    expect(stripGps).toHaveBeenCalledWith({ uri: 'file:///DCIM/IMG_1.HEIC', width: 4000, height: 3000 });
    expect(uploadQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'MEMORY', fileName: 'IMG_1.jpg', mime: 'image/jpeg', uri: 'file:///cache/clean.jpg' }),
    );
    await waitFor(() => expect(screen.getByTestId('editor-media-0')).toBeTruthy());
    expect(screen.getByTestId('editor-media-0-alt')).toBeTruthy();
  });

  it('AC-172 61 с видео ба 21 дэх файл тайлбартай татгалзана; хязгаарын тайлбар харагдана', async () => {
    const assets = [
      { uri: 'file:///v.mov', width: 1920, height: 1080, type: 'video', fileName: 'long.mov', mimeType: 'video/quicktime', duration: 61_000, fileSize: 1000 },
      ...Array.from({ length: 21 }, (_, i) => photo(i + 1)),
    ];
    library.mockResolvedValueOnce({ canceled: false, assets });
    await openNew();
    expect(screen.getByTestId('editor-limits')).toHaveTextContent(/20 хүртэл зураг, видео\. Видео 60 секунд, 200 MB хүртэл/);
    await fireEvent.press(screen.getByTestId('editor-pick'));
    await waitFor(() => expect(screen.getAllByTestId('editor-reject')).toHaveLength(2));
    expect(screen.getByText('long.mov: видео 60 секундээс урт байна. Богино хэсгийг нь сонгоорой.')).toBeTruthy();
    expect(screen.getByText('IMG_21.HEIC нэмэгдсэнгүй — нэг дурсамжид 20 хүртэл файл багтана.')).toBeTruthy();
    await waitFor(() => expect(uploadQueue.add).toHaveBeenCalledTimes(20));
    expect(screen.getByTestId('editor-pick').props.accessibilityState.disabled).toBe(true);
  });

  it('файл дуусмагц POST /memories (clientId, alt) → шинэ дурсамж руу; ноорог арилна', async () => {
    library.mockResolvedValueOnce({ canceled: false, assets: [photo(1)] });
    await openNew();
    await fireEvent.press(screen.getByTestId('editor-pick'));
    await waitFor(() => expect(screen.getByTestId('editor-media-0-alt')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('editor-media-0-alt'), 'Нуурын эрэг');
    await fireEvent.changeText(screen.getByTestId('editor-title'), 'Анхны аялал');
    await fireEvent.changeText(screen.getByTestId('editor-date'), '2026-10-03');
    const clientId = useDraftStore.getState().drafts.new.clientId;
    await fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(api.POST).toHaveBeenCalledWith('/memories', {
        body: {
          clientId,
          title: 'Анхны аялал',
          occurredOn: '2026-10-03',
          dateSource: 'MANUAL',
          locationSource: 'NONE',
          tags: [],
          groupIds: [],
          media: [{ mediaId: 'media-local-1', altText: 'Нуурын эрэг' }],
        },
      }),
    );
    expect(uploadQueue.wait).toHaveBeenCalledWith('local-1');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/memories/new-1'));
    expect(useDraftStore.getState().drafts.new?.clientId).not.toBe(clientId);
  });

  it('сүлжээгүй бол ижил clientId-тай outbox-оор (давхар үүсэхгүй)', async () => {
    (api.POST as jest.Mock).mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });
    library.mockResolvedValueOnce({ canceled: false, assets: [photo(1)] });
    await openNew();
    await fireEvent.press(screen.getByTestId('editor-pick'));
    await waitFor(() => expect(screen.getByTestId('editor-media-0')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('editor-title'), 'Offline дурсамж');
    const clientId = useDraftStore.getState().drafts.new.clientId;
    await fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() =>
      expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/memories', clientId, body: expect.objectContaining({ clientId }) })),
    );
  });

  it('гарчиг, медиагүй бол хадгалахгүй — талбар бүр шалтгаантай', async () => {
    await openNew();
    await fireEvent.press(screen.getByTestId('editor-save'));
    expect(screen.getByText('Энэ мөчдөө нэр өгөөрэй.')).toBeTruthy();
    expect(screen.getByTestId('editor-error-media')).toBeTruthy();
    expect(api.POST).not.toHaveBeenCalled();
  });

  it('ноорог хадгалагдана — дэлгэцээс гараад буцахад бичсэн гарчиг хэвээр', async () => {
    const first = await renderWithClient(<MemoryEditorScreen />);
    await waitFor(() => expect(screen.getByTestId('editor-title')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('editor-title'), 'Дуусаагүй бодол');
    await first.unmount();
    await renderWithClient(<MemoryEditorScreen />);
    await waitFor(() => expect(screen.getByTestId('editor-title').props.value).toBe('Дуусаагүй бодол'));
  });

  it('AC-158 «Одоогийн байршлыг ашиглах» (вэбэд navigator.geolocation) координат, нэрийг бөглөнө; татгалзвал гараар', async () => {
    (currentCoords as jest.Mock).mockResolvedValueOnce({ status: 'denied' }).mockResolvedValueOnce({ status: 'ok', lat: 47.91887, lon: 106.91701 });
    await openNew();
    await fireEvent.press(screen.getByTestId('editor-location-current'));
    expect(await screen.findByTestId('editor-location-notice')).toHaveTextContent(/гараар/);
    expect(screen.getByTestId('editor-lat').props.value).toBe('');
    await fireEvent.press(screen.getByTestId('editor-location-current'));
    await waitFor(() => expect(screen.getByTestId('editor-lat').props.value).toBe('47.91887'));
    expect(screen.getByTestId('editor-lon').props.value).toBe('106.91701');
    expect(screen.getByTestId('editor-place').props.value).toBe('47.91887, 106.91701');
    expect(screen.queryByTestId('editor-location-notice')).toBeNull();
  });

  it('?draft= (чат/болзоо) гарчиг, огноо, газар, тайлбараар бөглөнө', async () => {
    mockParams = { draft: JSON.stringify({ title: 'Кино үзсэн', occurredOn: '2026-10-03', place: 'Өргөө', description: 'Шөнийн кино' }) };
    await renderWithClient(<MemoryEditorScreen />);
    await waitFor(() => expect(screen.getByTestId('editor-title').props.value).toBe('Кино үзсэн'));
    expect(screen.getByTestId('editor-date').props.value).toBe('2026-10-03');
    expect(screen.getByTestId('editor-place').props.value).toBe('Өргөө');
    expect(screen.getByTestId('editor-description').props.value).toBe('Шөнийн кино');
  });
});

describe('S-32 засах — AC-131 зэрэг засвар', () => {
  it('409 VERSION_CONFLICT → «Миний / Түүний хувилбар»; «Миний» нь серверийн version-оор дахин хадгална', async () => {
    mockParams = { id: 'm1' };
    await renderWithClient(<MemoryEditorScreen />);
    await waitFor(() => expect(screen.getByTestId('editor-title').props.value).toBe('Анхны аялал'));
    await fireEvent.changeText(screen.getByTestId('editor-title'), 'Миний гарчиг');
    await fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() => expect(screen.getByTestId('conflict-sheet')).toBeTruthy());
    expect(screen.getByText('Ану энэ дурсамжийг саяхан өөрчилжээ')).toBeTruthy();
    expect(screen.getByTestId('conflict-mine-title')).toHaveTextContent('Миний гарчиг');
    expect(screen.getByTestId('conflict-theirs-title')).toHaveTextContent('Аялал (Ану засав)');
    expect(api.PATCH).toHaveBeenNthCalledWith(1, '/memories/{memoryId}', expect.objectContaining({ body: expect.objectContaining({ version: 3, title: 'Миний гарчиг' }) }));

    await fireEvent.press(screen.getByTestId('conflict-keep-mine'));
    await waitFor(() =>
      expect(api.PATCH).toHaveBeenNthCalledWith(2, '/memories/{memoryId}', expect.objectContaining({ body: expect.objectContaining({ version: 4, title: 'Миний гарчиг' }) })),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('«Түүний хувилбар» — миний өөрчлөлтийг хадгалахгүй, серверийнхийг харуулна', async () => {
    mockParams = { id: 'm1' };
    await renderWithClient(<MemoryEditorScreen />);
    await waitFor(() => expect(screen.getByTestId('editor-title').props.value).toBe('Анхны аялал'));
    await fireEvent.changeText(screen.getByTestId('editor-title'), 'Миний гарчиг');
    await fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() => expect(screen.getByTestId('conflict-keep-theirs')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('conflict-keep-theirs'));
    expect(api.PATCH).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalled();
    expect(useDraftStore.getState().drafts.m1?.title).not.toBe('Миний гарчиг');
  });
});
