import { act, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { HapticFlash, flashDuration } from '@/motion/HapticFlash';
import { onVisualHaptic, playHaptic } from '@/motion/haptics';
import { currentCoords } from '@/platform/location';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { downloadIcs, downloadName, getPosition, shareOrDownload, type WebEnv } from '../webFallbacks';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

/** Хуурамч DOM: `<a download>` дарагдсаныг бүртгэнэ. */
function fakeEnv(nav: WebEnv['navigator'] = {}) {
  const clicks: { href: string; download: string }[] = [];
  const doc = {
    createElement: () => {
      const a = { href: '', download: '', rel: '', click: () => clicks.push({ href: a.href, download: a.download }), remove: jest.fn() };
      return a;
    },
    body: { appendChild: jest.fn() },
  } as unknown as Document;
  const urls = { createObjectURL: jest.fn(() => 'blob:aura/1'), revokeObjectURL: jest.fn() };
  return { env: { navigator: nav, document: doc, URL: urls } satisfies WebEnv, clicks, urls };
}

const png = () => new Blob(['png'], { type: 'image/png' });
const realOS = Platform.OS;

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  Platform.OS = realOS;
});

describe('T-86 shareOrDownload (FR-19.8)', () => {
  it('AC-158 Web Share-гүй орчинд файлыг татна (S-72 жилийн зураг)', async () => {
    const { env, clicks } = fakeEnv({});
    await expect(shareOrDownload({ file: { blob: png(), fileName: 'aura-2026.png' } }, env)).resolves.toBe('downloaded');
    expect(clicks).toEqual([{ href: 'blob:aura/1', download: 'aura-2026.png' }]);
  });

  it('AC-158 файлыг canShare зөвшөөрвөл системийн хуваалцах цонхоор', async () => {
    const share = jest.fn(async () => {});
    const { env, clicks } = fakeEnv({ share, canShare: () => true });
    await expect(shareOrDownload({ title: 'Бидний 2026', file: { blob: png(), fileName: 'aura-2026.png', mime: 'image/png' } }, env)).resolves.toBe('shared');
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.title).toBe('Бидний 2026');
    expect(data.files?.[0]?.name).toBe('aura-2026.png');
    expect(data.files?.[0]?.type).toBe('image/png');
    expect(clicks).toEqual([]);
  });

  it('AC-158 canShare файлыг дэмжихгүй бол share дуудахгүй, татна', async () => {
    const share = jest.fn(async () => {});
    const { env, clicks } = fakeEnv({ share, canShare: () => false });
    await expect(shareOrDownload({ file: { blob: png(), fileName: 'a.png' } }, env)).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(clicks).toHaveLength(1);
  });

  it('AC-158 хэрэглэгч цонхыг хаавал (AbortError) dismissed — татахгүй', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
    const { env, clicks } = fakeEnv({ share: jest.fn(async () => Promise.reject(abort)), canShare: () => true });
    await expect(shareOrDownload({ file: { blob: png(), fileName: 'a.png' } }, env)).resolves.toBe('dismissed');
    expect(clicks).toEqual([]);
  });

  it('AC-158 share алдаа (NotAllowedError) — татах нөөц рүү', async () => {
    const denied = Object.assign(new Error('activation'), { name: 'NotAllowedError' });
    const { env, clicks } = fakeEnv({ share: jest.fn(async () => Promise.reject(denied)), canShare: () => true });
    await expect(shareOrDownload({ file: { blob: png(), fileName: 'a.png' } }, env)).resolves.toBe('downloaded');
    expect(clicks).toHaveLength(1);
  });

  it('AC-158 текст (S-08 урилга): Web Share байвал хуваалцана', async () => {
    const share = jest.fn(async () => {});
    const copy = jest.fn(async () => {});
    const { env } = fakeEnv({ share });
    await expect(shareOrDownload({ text: 'Код: ABC123', url: 'https://aura.mn/i/ABC123', copy }, env)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'Код: ABC123', url: 'https://aura.mn/i/ABC123' });
    expect(copy).not.toHaveBeenCalled();
  });

  it('AC-158 текст: Web Share-гүй (desktop) бол санах ойд хуулна', async () => {
    const copy = jest.fn(async () => {});
    const { env } = fakeEnv({});
    await expect(shareOrDownload({ text: 'Код: ABC123', url: 'https://aura.mn/i/ABC123', copy }, env)).resolves.toBe('copied');
    expect(copy).toHaveBeenCalledWith('Код: ABC123\nhttps://aura.mn/i/ABC123');
  });

  it('татах нэрийн аюултай тэмдэгт солигдоно', () => {
    expect(downloadName('Болзоо: Тэрэлж/шөнө.ics')).toBe('Болзоо_Тэрэлж_шөнө.ics');
    expect(downloadName('')).toBe('aura-file');
  });
});

describe('T-86 downloadIcs', () => {
  it('AC-158 .ics-ийг нэвтрэлттэй татаж text/calendar файл болгон хадгална', async () => {
    const { env, clicks, urls } = fakeEnv({});
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['BEGIN:VCALENDAR'], { type: 'application/octet-stream' }) }));
    await expect(
      downloadIcs({ url: 'https://api/plans/p1/ics', fileName: 'Болзоо', headers: { Authorization: 'Bearer at' } }, { ...env, fetch: fetchMock as unknown as typeof fetch }),
    ).resolves.toBe('downloaded');
    expect(fetchMock).toHaveBeenCalledWith('https://api/plans/p1/ics', { headers: { Authorization: 'Bearer at' }, credentials: 'include' });
    expect((urls.createObjectURL.mock.calls[0] as unknown as [Blob])[0].type).toBe('text/calendar');
    expect(clicks).toEqual([{ href: 'blob:aura/1', download: 'Болзоо.ics' }]);
    jest.advanceTimersByTime(60_000);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:aura/1');
  });

  it('AC-158 серверийн алдааг дамжуулна (дуудагч алдааны мэдэгдэл харуулна)', async () => {
    const { env } = fakeEnv({});
    const fetchMock = jest.fn(async () => ({ ok: false, status: 404 }));
    await expect(downloadIcs({ url: 'x', fileName: 'a.ics' }, { ...env, fetch: fetchMock as unknown as typeof fetch })).rejects.toThrow('HTTP 404');
  });
});

describe('T-86 getPosition (navigator.geolocation)', () => {
  const geo = (impl: (ok: PositionCallback, fail: PositionErrorCallback, opts?: PositionOptions) => void) =>
    ({ getCurrentPosition: jest.fn(impl) }) as unknown as Geolocation;

  it('AC-158 байршлыг 5 оронтой бөөрөнхийлж буцаана, хуучин кэш авахгүй', async () => {
    const g = geo((ok) => ok({ coords: { latitude: 47.918873456, longitude: 106.917012345, accuracy: 20 } } as GeolocationPosition));
    await expect(getPosition({ navigator: { geolocation: g } })).resolves.toEqual({ status: 'ok', lat: 47.91887, lon: 106.91701, accuracy: 20 });
    expect((g.getCurrentPosition as jest.Mock).mock.calls[0][2]).toEqual({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
  });

  it('AC-158 татгалзвал denied, хугацаа дуусвал failed, API-гүй бол unavailable', async () => {
    await expect(getPosition({ navigator: { geolocation: geo((_, fail) => fail({ code: 1 } as GeolocationPositionError)) } })).resolves.toEqual({ status: 'denied' });
    await expect(getPosition({ navigator: { geolocation: geo((_, fail) => fail({ code: 3 } as GeolocationPositionError)) } })).resolves.toEqual({ status: 'failed' });
    await expect(getPosition({ navigator: {} })).resolves.toEqual({ status: 'unavailable' });
  });

  it('AC-158 вэбэд currentCoords нь expo-location биш navigator.geolocation-ыг дуудна', async () => {
    Platform.OS = 'web';
    const nav = globalThis.navigator as unknown as { geolocation?: Geolocation };
    const original = nav.geolocation;
    nav.geolocation = geo((ok) => ok({ coords: { latitude: 47.9, longitude: 106.9, accuracy: 5 } } as GeolocationPosition));
    try {
      await expect(currentCoords()).resolves.toEqual({ status: 'ok', lat: 47.9, lon: 106.9 });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expect(require('expo-location').requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    } finally {
      nav.geolocation = original;
    }
  });
});

describe('T-86 haptic-ийн вэб орлуулга (FR-19.7)', () => {
  const nav = globalThis.navigator as unknown as { vibrate?: unknown };
  const originalVibrate = nav.vibrate;
  beforeEach(() => {
    usePrefsStore.getState().set({ ...defaultPrefs });
    Platform.OS = 'web';
    nav.vibrate = undefined;
  });
  afterEach(() => {
    nav.vibrate = originalVibrate;
  });

  it('AC-217 (б) чичиргээгүй хөтөчид тод дүрслэлийн сонсогчид haptic-ийн давталттай мэдэгдэнэ', () => {
    const seen: number[] = [];
    const off = onVisualHaptic((spec) => seen.push(spec.times));
    expect(playHaptic('ANIM-01')).toBe('visual');
    off();
    playHaptic('ANIM-01');
    expect(seen).toEqual([2]);
  });

  it('AC-217 (б) HapticFlash: haptic бүрд хүрээ анивчиж, хугацааны дараа алга болно', async () => {
    await render(
      <ThemeProvider>
        <HapticFlash />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('haptic-visual')).toBeNull();
    await act(async () => {
      playHaptic('ANIM-01');
    });
    expect(screen.getByTestId('haptic-visual')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(flashDuration({ times: 2 }) + 10);
    });
    expect(screen.queryByTestId('haptic-visual')).toBeNull();
  });

  it('AC-217 (б) haptic унтраастай бол тод дүрслэл ч гарахгүй', async () => {
    usePrefsStore.getState().set({ haptics: false });
    await render(
      <ThemeProvider>
        <HapticFlash />
      </ThemeProvider>,
    );
    await act(async () => {
      expect(playHaptic('ANIM-01')).toBe('none');
    });
    expect(screen.queryByTestId('haptic-visual')).toBeNull();
  });

  it('AC-217 (а) native-д HapticFlash юу ч рендэрлэхгүй', async () => {
    Platform.OS = 'ios';
    await render(
      <ThemeProvider>
        <HapticFlash />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('haptic-visual')).toBeNull();
  });
});
