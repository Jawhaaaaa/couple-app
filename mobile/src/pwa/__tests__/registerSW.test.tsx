import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { UpdateBanner } from '@/components/UpdateBanner';
import { usePwaStore } from '@/pwa/pwaStore';
import { applyUpdate, registerServiceWorker, requestPersistentStorage, SW_URL, supportsServiceWorker } from '@/pwa/registerSW';
import { emptyDraft, NEW_DRAFT, useDraftStore } from '@/stores/draftStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

type Handler = () => void;

/** EventTarget-тэй энгийн хуурамч объект. */
function target<T extends object>(props: T) {
  const handlers: Record<string, Handler[]> = {};
  return Object.assign(props, {
    handlers,
    addEventListener: jest.fn((type: string, fn: Handler) => (handlers[type] ??= []).push(fn)),
    removeEventListener: jest.fn(),
    emit: (type: string) => (handlers[type] ?? []).forEach((fn) => fn()),
  });
}

function fakeWorker(state = 'installed') {
  return target({ state, postMessage: jest.fn() });
}

function fakeNav({ controller = true, waiting = null as ReturnType<typeof fakeWorker> | null } = {}) {
  const reg = target({ waiting, installing: null as ReturnType<typeof fakeWorker> | null, update: jest.fn(async () => undefined) });
  const container = target({ controller: controller ? {} : null, register: jest.fn(async () => reg) });
  const storage = { persisted: jest.fn(async () => false), persist: jest.fn(async () => true) };
  return { nav: { serviceWorker: container, storage } as unknown as Navigator, reg, container, storage };
}

const doc = target({ visibilityState: 'visible' as DocumentVisibilityState });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => usePwaStore.setState({ waiting: null }));

describe('T-83 registerSW', () => {
  it('native ба serviceWorker-гүй хөтөчид бүртгэхгүй', () => {
    const { nav, container } = fakeNav();
    expect(supportsServiceWorker({ platform: 'ios', nav })).toBe(false);
    expect(supportsServiceWorker({ platform: 'web', nav: {} as Navigator })).toBe(false);
    registerServiceWorker({ platform: 'android', nav, dev: false, doc });
    registerServiceWorker({ platform: 'web', nav, dev: true, doc });
    expect(container.register).not.toHaveBeenCalled();
  });

  it('AC-140 вэб production-д /sw.js-ийг бүртгэнэ; AC-156 navigator.storage.persist() дуудна', async () => {
    const { nav, container, storage } = fakeNav();
    const stop = registerServiceWorker({ platform: 'web', nav, dev: false, doc });
    await flush();
    expect(container.register).toHaveBeenCalledWith(SW_URL, { scope: '/' });
    expect(storage.persist).toHaveBeenCalled();
    stop();
  });

  it('AC-156 аль хэдийн persisted бол дахин асуухгүй; API алга бол false', async () => {
    const { nav, storage } = fakeNav();
    storage.persisted.mockResolvedValue(true);
    expect(await requestPersistentStorage(nav)).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
    expect(await requestPersistentStorage({} as Navigator)).toBe(false);
  });

  it('AC-191 waiting SW (өмнө нь controller байсан) → «шинэ хувилбар бэлэн»', async () => {
    const waiting = fakeWorker();
    const { nav } = fakeNav({ waiting });
    registerServiceWorker({ platform: 'web', nav, dev: false, doc })();
    await flush();
    expect(usePwaStore.getState().waiting).toBe(waiting);
  });

  it('анх суулгахад (controller алга) мэдэгдэл гаргахгүй', async () => {
    const { nav } = fakeNav({ controller: false, waiting: fakeWorker() });
    registerServiceWorker({ platform: 'web', nav, dev: false, doc })();
    await flush();
    expect(usePwaStore.getState().waiting).toBeNull();
  });

  it('updatefound → installed болмогц мэдэгдэл; урд гарахад шинэчлэлт шалгана', async () => {
    const { nav, reg } = fakeNav();
    const stop = registerServiceWorker({ platform: 'web', nav, dev: false, doc });
    await flush();
    const installing = fakeWorker('installing');
    reg.installing = installing;
    reg.emit('updatefound');
    installing.state = 'installed';
    installing.emit('statechange');
    expect(usePwaStore.getState().waiting).toBe(installing);
    doc.emit('visibilitychange');
    expect(reg.update).toHaveBeenCalled();
    stop();
  });

  it('AC-191 «Шинэчлэх» — ноорог хадгалагдсаны дараа SKIP_WAITING, controllerchange-д reload', async () => {
    const waiting = fakeWorker();
    const { nav, container } = fakeNav();
    usePwaStore.setState({ waiting: waiting as unknown as ServiceWorker });
    useDraftStore.getState().put(NEW_DRAFT, { ...emptyDraft('2026-11-14'), title: 'Тэрэлжийн од' });
    let savedAtReload: string | null = null;
    const reload = jest.fn(() => {
      void AsyncStorage.getItem('aura.drafts').then((v) => (savedAtReload = v));
    });
    expect(await applyUpdate({ nav, reload, flushMs: 0, fallbackMs: 10_000 })).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    container.emit('controllerchange');
    container.emit('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(savedAtReload).toContain('Тэрэлжийн од'));
  });

  it('waiting SW алга бол юу ч хийхгүй', async () => {
    const reload = jest.fn();
    expect(await applyUpdate({ nav: fakeNav().nav, reload, flushMs: 0 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('T-83 UpdateBanner', () => {
  it('AC-191 waiting SW үед «Шинэ хувилбар бэлэн — Шинэчлэх», товшвол SKIP_WAITING', async () => {
    await render(
      <ThemeProvider>
        <UpdateBanner />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('pwa-update-banner')).toBeNull();
    const waiting = fakeWorker();
    await act(async () => usePwaStore.setState({ waiting: waiting as unknown as ServiceWorker }));
    expect(screen.getByTestId('pwa-update-banner')).toHaveTextContent(/Шинэ хувилбар бэлэн/);
    const nav = fakeNav().nav;
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
    await fireEvent.press(screen.getByTestId('pwa-update-apply'));
    await waitFor(() => expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }), { timeout: 2000 });
  });
});
