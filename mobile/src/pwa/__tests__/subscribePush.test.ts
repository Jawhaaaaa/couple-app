import { api } from '@/api/client';
import { base64UrlToBytes } from '@/pwa/base64url';
import { subscribePush, toSubscriptionInput, type WebPushEnv, webPushSupport } from '@/pwa/subscribePush';

import { ok } from '../../../test/memoryFixtures';

jest.mock('@/auth/tokenStore', () => ({
  usesCookieRefresh: true,
  getRefreshToken: jest.fn(async () => null),
  setRefreshToken: jest.fn(async () => {}),
  clearRefreshToken: jest.fn(async () => {}),
}));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

const env = (ua: string, standalone = false, rest: Partial<WebPushEnv> = {}): WebPushEnv => ({
  device: { ua, standalone },
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  ...rest,
});

const SUB_JSON = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPk', auth: 'au' } };
let requestPermission: jest.Mock;
let subscribe: jest.Mock;
let getSubscription: jest.Mock;

beforeEach(() => {
  requestPermission = jest.fn(async () => 'granted');
  subscribe = jest.fn(async () => ({ toJSON: () => SUB_JSON }));
  getSubscription = jest.fn(async () => null);
  Object.defineProperty(globalThis, 'Notification', { value: { requestPermission, permission: 'default' }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }) } },
    configurable: true,
  });
});

describe('AC-154 Web Push бүртгэл (subscribePush)', () => {
  it('iPhone-д суулгаагүй бол needs-install; суусан PWA-д supported; API алга бол unsupported', () => {
    expect(webPushSupport(env(IPHONE))).toBe('needs-install');
    expect(webPushSupport(env(IPHONE, true))).toBe('supported');
    expect(webPushSupport(env(ANDROID))).toBe('supported');
    expect(webPushSupport(env(ANDROID, false, { hasPushManager: false }))).toBe('unsupported');
  });

  it('зөвшөөрөл → VAPID-ээр subscribe → POST /push-subscriptions (WEB, localReminders: false)', async () => {
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ id: 's1' }, 201)) as never);
    expect(await subscribePush(VAPID, env(ANDROID))).toBe('granted');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID) });
    expect((subscribe.mock.calls[0][0] as { applicationServerKey: Uint8Array }).applicationServerKey).toHaveLength(65);
    expect(post).toHaveBeenCalledWith('/push-subscriptions', {
      body: { kind: 'WEB', endpoint: SUB_JSON.endpoint, keys: SUB_JSON.keys, localReminders: false },
    });
    post.mockRestore();
  });

  it('хэрэглэгч татгалзвал subscribe/POST хийхгүй', async () => {
    requestPermission.mockResolvedValue('denied');
    const post = jest.spyOn(api, 'POST');
    expect(await subscribePush(VAPID, env(ANDROID))).toBe('denied');
    expect(subscribe).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('суулгаагүй iPhone ба VAPID тохируулаагүй үед системийн цонх нээгдэхгүй', async () => {
    expect(await subscribePush(VAPID, env(IPHONE))).toBe('needs-install');
    expect(await subscribePush(null, env(ANDROID))).toBe('not-configured');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('аль хэдийн subscription байвал дахин үүсгэхгүй, серверт бүртгэнэ', async () => {
    getSubscription.mockResolvedValue({ toJSON: () => SUB_JSON });
    const post = jest.spyOn(api, 'POST').mockImplementation((async () => ok({ id: 's1' }, 201)) as never);
    expect(await subscribePush(VAPID, env(ANDROID))).toBe('granted');
    expect(subscribe).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalled();
    post.mockRestore();
  });

  it('toSubscriptionInput — түлхүүр дутуу бол алдаа', () => {
    expect(() => toSubscriptionInput({ endpoint: 'https://x', keys: { p256dh: 'a' } })).toThrow();
  });
});
