import { INSTALL_SNOOZE_MS, installContext, shouldOfferInstall } from '@/pwa/installPrompt';
import { nextPwaPrompt, type PromptInput } from '@/pwa/pwaPrompts';

const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
  iosFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-14T12:00:00Z');

describe('AC-153 S-100 суулгах зааврын шийдвэр', () => {
  it('(а) iOS Safari, standalone биш → 3 алхамт заавар (ios-safari) ба автоматаар санал болгоно', () => {
    const context = installContext({ ua: UA.iosSafari, standalone: false });
    expect(context).toBe('ios-safari');
    expect(shouldOfferInstall({ context, canPrompt: false, dismissedAt: null, now: NOW })).toBe(true);
  });

  it('(б) display-mode: standalone → гарахгүй', () => {
    const context = installContext({ ua: UA.iosSafari, standalone: true });
    expect(context).toBe('standalone');
    expect(shouldOfferInstall({ context, canPrompt: true, dismissedAt: null, now: NOW })).toBe(false);
  });

  it('(в) хаагаад 6 дахь өдөр гарахгүй, 8 дахь өдөр гарна (7 хоног)', () => {
    const context = installContext({ ua: UA.iosSafari, standalone: false });
    expect(INSTALL_SNOOZE_MS).toBe(7 * DAY);
    expect(shouldOfferInstall({ context, canPrompt: false, dismissedAt: NOW - 6 * DAY, now: NOW })).toBe(false);
    expect(shouldOfferInstall({ context, canPrompt: false, dismissedAt: NOW - 8 * DAY, now: NOW })).toBe(true);
  });

  it('(г) iOS Chrome/Firefox/апп доторх хөтөч → «Safari-аар нээнэ үү» (ios-other)', () => {
    for (const ua of [UA.iosChrome, UA.iosFirefox, UA.iosInstagram]) {
      expect(installContext({ ua, standalone: false })).toBe('ios-other');
    }
    expect(shouldOfferInstall({ context: 'ios-other', canPrompt: false, dismissedAt: null, now: NOW })).toBe(true);
  });

  it('(д) Android Chrome — beforeinstallprompt ирсэн үед л «Суулгах»', () => {
    const context = installContext({ ua: UA.androidChrome, standalone: false });
    expect(context).toBe('android');
    expect(shouldOfferInstall({ context, canPrompt: true, dismissedAt: null, now: NOW })).toBe(true);
    expect(shouldOfferInstall({ context, canPrompt: false, dismissedAt: null, now: NOW })).toBe(false);
  });

  it('iPadOS (desktop UA + мэдрэгч) → iOS; desktop Chrome → desktop', () => {
    expect(installContext({ ua: UA.ipadDesktop, standalone: false, maxTouchPoints: 5 })).toBe('ios-safari');
    expect(installContext({ ua: UA.ipadDesktop, standalone: false, maxTouchPoints: 0 })).toBe('desktop');
    expect(installContext({ ua: UA.desktopChrome, standalone: false })).toBe('desktop');
  });
});

describe('S-100 / S-101 автомат санал (нэвтэрсний дараа нүүрэнд, нэг удаа)', () => {
  const base: PromptInput = {
    platform: 'web',
    signedIn: true,
    pathname: '/home',
    hydrated: true,
    shownThisSession: false,
    installOffer: false,
    pushOffered: false,
    pushSupport: 'supported',
    permission: 'default',
  };

  it('суулгах санал эхэлж, дараа нь мэдэгдэл', () => {
    expect(nextPwaPrompt({ ...base, installOffer: true })).toBe('install');
    expect(nextPwaPrompt(base)).toBe('push');
  });

  it('native, нэвтрээгүй, нүүр биш, ачаалагдаагүй, энэ сесст гарсан → юу ч үгүй', () => {
    expect(nextPwaPrompt({ ...base, platform: 'ios' })).toBeNull();
    expect(nextPwaPrompt({ ...base, signedIn: false })).toBeNull();
    expect(nextPwaPrompt({ ...base, pathname: '/login' })).toBeNull();
    expect(nextPwaPrompt({ ...base, hydrated: false })).toBeNull();
    expect(nextPwaPrompt({ ...base, shownThisSession: true, installOffer: true })).toBeNull();
  });

  it('AC-154 S-101 нэг л удаа; зөвшөөрөл шийдэгдсэн эсвэл суулгаагүй iPhone бол үгүй', () => {
    expect(nextPwaPrompt({ ...base, pushOffered: true })).toBeNull();
    expect(nextPwaPrompt({ ...base, permission: 'granted' })).toBeNull();
    expect(nextPwaPrompt({ ...base, permission: 'denied' })).toBeNull();
    expect(nextPwaPrompt({ ...base, pushSupport: 'needs-install' })).toBeNull();
  });
});
