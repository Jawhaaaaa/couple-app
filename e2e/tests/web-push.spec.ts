import { expect, test } from '@playwright/test';

import { suppressPwaPrompts } from '../fixtures/twoPartners';
import { confirmStartDate, linkedCouple } from '../support/couple';
import { apiAs, apiJson, signInUi } from '../support/users';
import { createPushDevice, type PushDevice } from '../support/webpush';

/**
 * Web Push (T-84, FR-13.1, FR-19.3, AC-154; IT нь `WebPushIT`): B нэвтэрсний дараа S-101 автоматаар
 * санал болгогдоно — системийн зөвшөөрлийн цонх ЗӨВХӨН «Зөвшөөрөх» товшилтоор; subscription серверт
 * бүртгэгдэнэ; A «Зүрх илгээх» дарахад B-гийн subscription руу push (VAPID, aes128gcm) илгээгдэнэ;
 * endpoint 410 буцаахад subscription устна.
 *
 * Тестийн push endpoint: хөтчийн push service (FCM, Mozilla autopush) тестийн орчноос хүрэхгүй тул
 * `PushManager.subscribe` нь backend-ийн тестийн хүлээн авагч (`/test/push-sink`, DD-AURA-027)-ийн
 * хаяг ба тестийн түлхүүртэй subscription буцаана — апп-ын урсгал (зөвшөөрөл → subscribe → `POST
 * /push-subscriptions`) ба серверийн илгээлт бодитоор явж, ирсэн payload-ыг тайлж шалгана. Системийн
 * зөвшөөрлийн цонхыг Playwright товших боломжгүй тул `Notification.requestPermission` нь хэрэглэгч
 * «Allow» дарсныг загварчилж, хэдэн удаа дуудагдсаныг тоолно.
 * Суусан PWA (`display-mode: standalone`) — iPhone-д push зөвхөн суусан апп-д (SD-04) тул.
 */
interface PushProbe {
  permissionRequests: number;
  subscribeCalls: number;
  serverKey: string | null;
}

test.describe('AC-154 Web Push', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'Playwright-ийн WebKit-д Push API (`PushManager`, `Notification`) алга — S-101 «дэмжихгүй» гэж зөв харуулна; push-ийг Chromium/Firefox шалгана',
  );

  test('AC-154 S-101 «Зөвшөөрөх» товшилтоор л зөвшөөрөл; A зүрх илгээхэд B-гийн subscription руу push; 410 → subscription устна', async ({
    browser,
    contextOptions,
  }) => {
    test.setTimeout(90_000);
    const [a, b] = await linkedCouple('Бат', 'Ану', 'webpush');
    await confirmStartDate(a, b, '2025-02-14');
    // «Бүү саад бол» (анхдагч 23:00–07:00) цонхонд push хойшлогдоно — тестийн цагаас үл хамааруулж унтраана
    const settings = await apiJson<Record<string, unknown>>(b, 'GET', '/notification-settings');
    await apiJson(b, 'PUT', '/notification-settings', { ...settings, dndStart: '00:00', dndEnd: '00:00' });
    const vapid = await apiJson<{ publicKey: string }>(b, 'GET', '/push/vapid-public-key');
    expect(vapid.publicKey, 'AURA_VAPID_PUBLIC_KEY тохируулаагүй (backend Web Push алгасна)').toBeTruthy();

    const device = await createPushDevice();
    const contextB = await browser.newContext(contextOptions);
    await contextB.addInitScript(
      ({ endpoint, keys }) => {
        const probe: PushProbe = { permissionRequests: 0, subscribeCalls: 0, serverKey: null };
        (window as unknown as { __push: PushProbe }).__push = probe;
        // Суусан PWA
        const matchMedia = window.matchMedia.bind(window);
        window.matchMedia = (q: string) =>
          /display-mode:\s*standalone/.test(q)
            ? ({ matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList)
            : matchMedia(q);
        Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
        // Системийн зөвшөөрлийн цонх: эхэндээ «асуугаагүй», дуудагдвал хэрэглэгч «Allow» дарна
        let permission: NotificationPermission = 'default';
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission });
        Notification.requestPermission = async () => {
          probe.permissionRequests += 1;
          permission = 'granted';
          return permission;
        };
        // Тестийн push endpoint-тай subscription
        let subscription: PushSubscription | null = null;
        const toB64Url = (buf: BufferSource | string | null | undefined) => {
          if (!buf || typeof buf === 'string') return buf ?? null;
          const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
          return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        };
        PushManager.prototype.subscribe = async function subscribe(options?: PushSubscriptionOptionsInit) {
          probe.subscribeCalls += 1;
          probe.serverKey = toB64Url(options?.applicationServerKey);
          subscription = {
            endpoint,
            expirationTime: null,
            options: { userVisibleOnly: true, applicationServerKey: null },
            getKey: () => null,
            toJSON: () => ({ endpoint, expirationTime: null, keys }),
            unsubscribe: async () => true,
          } as unknown as PushSubscription;
          return subscription;
        };
        PushManager.prototype.getSubscription = async function getSubscription() {
          return subscription;
        };
      },
      { endpoint: device.endpoint, keys: device.keys },
    );
    const pageB = await contextB.newPage();
    const probe = () => pageB.evaluate(() => (window as unknown as { __push: PushProbe }).__push);

    // B нэвтэрнэ → нүүрэнд S-101 өөрөө гарна; системийн цонх хараахан асуугдаагүй
    await signInUi(pageB, b);
    await expect(pageB.getByTestId('screen-S-101')).toBeVisible();
    await expect(pageB.getByTestId('push-reasons')).toContainText('Хамтрагч зүрх илгээхэд');
    expect((await probe()).permissionRequests).toBe(0);
    const allow = pageB.getByTestId('push-allow');
    await expect(allow).toBeEnabled();
    expect((await probe()).permissionRequests).toBe(0);

    // «Зөвшөөрөх» → зөвшөөрөл → subscribe (серверийн VAPID түлхүүрээр) → `POST /push-subscriptions`
    const registered = pageB.waitForResponse((r) => r.url().endsWith('/push-subscriptions') && r.request().method() === 'POST');
    await allow.click();
    expect((await registered).status()).toBe(201);
    await expect(pageB.getByTestId('push-granted')).toBeVisible();
    const after = await probe();
    expect(after.permissionRequests).toBe(1);
    expect(after.subscribeCalls).toBe(1);
    expect(after.serverKey).toBe(vapid.publicKey);

    // A «Зүрх илгээх» (UI) → B-гийн subscription руу push
    const contextA = await browser.newContext(contextOptions);
    await suppressPwaPrompts(contextA);
    const pageA = await contextA.newPage();
    await signInUi(pageA, a);
    await expect(pageA.getByTestId('screen-S-20')).toBeVisible();
    await pageA.getByTestId('heart-button').click();
    await expect(pageA.getByTestId('heart-sent')).toBeVisible();

    await expect.poll(async () => (await device.messages()).length, { timeout: 15_000 }).toBe(1);
    const [raw] = await device.messages();
    expect(raw.headers['content-encoding']).toBe('aes128gcm');
    expect(raw.headers.authorization).toMatch(/^vapid t=/);
    const [push] = await device.payloads();
    expect(push).toMatchObject({ type: 'HEART_RECEIVED' });
    expect(String(push.body ?? '') + String(push.title ?? '')).toContain('Бат');

    // Endpoint 410 (subscription хүчингүй) → сервер устгана
    await device.respondWith(410);
    await pageA.getByTestId('heart-button').click();
    await expect.poll(async () => (await device.messages()).length, { timeout: 15_000 }).toBe(2);
    // Хяналтын төхөөрөмж: дараагийн зүрх түүнд хүрмэгц (илгээлт явсан) устгагдсан subscription руу дахин очихгүй
    const control: PushDevice = await createPushDevice();
    expect((await apiAs(b, 'POST', '/push-subscriptions', { kind: 'WEB', endpoint: control.endpoint, keys: control.keys, localReminders: false })).status).toBe(201);
    await pageA.getByTestId('heart-button').click();
    await expect.poll(async () => (await control.messages()).length, { timeout: 15_000 }).toBe(1);
    expect((await control.payloads())[0]).toMatchObject({ type: 'HEART_RECEIVED' });
    expect(await device.messages()).toHaveLength(2);

    await contextA.close();
    await contextB.close();
  });
});
