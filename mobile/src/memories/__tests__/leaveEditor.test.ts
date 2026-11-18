import { isLeavingEditor, leaveEditorAfterSave, type LeaveRouter } from '../leaveEditor';

jest.mock('expo-router', () => ({ router: {} }));

function fakeRouter(canGoBack = true) {
  const calls: string[] = [];
  const router: LeaveRouter = {
    back: () => calls.push('back'),
    push: (href) => calls.push(`push ${href}`),
    replace: (href) => calls.push(`replace ${href}`),
    dismissTo: (href) => calls.push(`dismissTo ${href}`),
    canGoBack: () => canGoBack,
  };
  return { router, calls };
}

const flush = () => new Promise<void>((r) => setImmediate(r));

describe('AC-198 S-32 хадгалсны дараах шилжилт', () => {
  it('вэб: back() хийгээд хөтчийн popstate бодитоор ирсний ДАРАА л S-31 руу push (хожуу popstate дарахгүй)', async () => {
    const win = new EventTarget();
    const { router, calls } = fakeRouter();
    const done = leaveEditorAfterSave('m1', { router, web: true, win: win as unknown as Window });
    expect(calls).toEqual(['back']);
    // Firefox: popstate 100 мс-ээс хожуу — тэр хүртэл push хийгдэхгүй
    await flush();
    expect(calls).toEqual(['back']);
    expect(isLeavingEditor()).toBe(true);
    win.dispatchEvent(new Event('popstate'));
    await done;
    expect(calls).toEqual(['back', 'push /memories/m1']);
    expect(isLeavingEditor()).toBe(false);
  });

  it('вэб: popstate огт ирэхгүй бол (түүхгүй entry) хугацааны дараа push', async () => {
    const win = new EventTarget();
    const { router, calls } = fakeRouter();
    await leaveEditorAfterSave('m2', { router, web: true, win: win as unknown as Window, popTimeoutMs: 5 });
    expect(calls).toEqual(['back', 'push /memories/m2']);
  });

  it('вэб: давхар дуудалт (давхар товшилт, хожуу хаах) шинэ back/push нэмэхгүй', async () => {
    const win = new EventTarget();
    const { router, calls } = fakeRouter();
    const first = leaveEditorAfterSave('m3', { router, web: true, win: win as unknown as Window });
    const second = leaveEditorAfterSave(null, { router, web: true, win: win as unknown as Window });
    expect(second).toBe(first);
    win.dispatchEvent(new Event('popstate'));
    await first;
    expect(calls).toEqual(['back', 'push /memories/m3']);
  });

  it('вэб: буцах түүхгүй (шууд нээсэн editor) бол S-31-ээр солино', async () => {
    const { router, calls } = fakeRouter(false);
    await leaveEditorAfterSave('m4', { router, web: true, win: new EventTarget() as unknown as Window });
    expect(calls).toEqual(['replace /memories/m4']);
  });

  it('native: dismissTo нэг үйлдлээр', async () => {
    const { router, calls } = fakeRouter();
    await leaveEditorAfterSave('m5', { router, web: false });
    expect(calls).toEqual(['dismissTo /memories/m5']);
  });

  it('засвар/болзооноос (шинэ дурсамж биш) — зөвхөн буцна, түүхгүй бол S-30', async () => {
    const a = fakeRouter();
    await leaveEditorAfterSave(null, { router: a.router, web: true, win: new EventTarget() as unknown as Window });
    expect(a.calls).toEqual(['back']);
    const b = fakeRouter(false);
    await leaveEditorAfterSave(null, { router: b.router, web: false });
    expect(b.calls).toEqual(['replace /memories']);
  });
});
