import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';

import { ANIM_HAPTICS, ANIM_IDS } from '../anims';
import { playHaptic, playHugHaptic, registerSoundPlayer, webVibrationPattern } from '../haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

/** Шаардлага §3.4-ийн «Haptic» багана, үгчлэн. */
const SPEC_TABLE: Record<string, string> = {
  'ANIM-01': 'impactMedium ×2',
  'ANIM-02': 'notificationSuccess',
  'ANIM-03': 'selection',
  'ANIM-04': '—',
  'ANIM-05': 'notificationSuccess',
  'ANIM-06': 'impactLight',
  'ANIM-07': 'selection',
  'ANIM-08': '—',
  'ANIM-09': 'impactLight',
  'ANIM-10': 'selection',
  'ANIM-11': '—',
  'ANIM-12': 'notificationSuccess',
  'ANIM-13': 'impactLight',
  'ANIM-14': 'notificationSuccess',
  'ANIM-15': 'selection',
  'ANIM-16': '—',
  'ANIM-17': 'impactMedium',
  'ANIM-18': 'notificationSuccess',
  'ANIM-19': 'impactLight',
  'ANIM-20': 'notificationSuccess',
  'ANIM-21': 'notificationSuccess',
  'ANIM-22': '—',
  'ANIM-23': '—',
};

const describeSpec = (id: (typeof ANIM_IDS)[number]) => {
  const s = ANIM_HAPTICS[id];
  return s ? `${s.kind}${s.times > 1 ? ` ×${s.times}` : ''}` : '—';
};

function nativeCalls(): string[] {
  const calls: string[] = [];
  (Haptics.impactAsync as jest.Mock).mock.calls.forEach(([style]) =>
    calls.push(`impact${String(style)[0].toUpperCase()}${String(style).slice(1)}`),
  );
  (Haptics.selectionAsync as jest.Mock).mock.calls.forEach(() => calls.push('selection'));
  (Haptics.notificationAsync as jest.Mock).mock.calls.forEach(() => calls.push('notificationSuccess'));
  return calls;
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState({ ...defaultPrefs });
  Platform.OS = 'ios';
});

describe('AC-215 ANIM бүрийн haptic хүснэгттэй таарна', () => {
  it('ANIM_HAPTICS хүснэгт = шаардлагын хүснэгт (23 мөр)', () => {
    expect(ANIM_IDS).toHaveLength(23);
    for (const id of ANIM_IDS) expect(`${id}: ${describeSpec(id)}`).toBe(`${id}: ${SPEC_TABLE[id]}`);
  });

  it.each(ANIM_IDS)('%s өдөөхөд native haptic дуудлага хүснэгттэй тэнцүү', (id) => {
    jest.useFakeTimers();
    const outcome = playHaptic(id);
    jest.runAllTimers();
    jest.useRealTimers();
    const spec = ANIM_HAPTICS[id];
    if (!spec) {
      expect(outcome).toBe('none');
      expect(nativeCalls()).toEqual([]);
    } else {
      expect(outcome).toBe('native');
      expect(nativeCalls()).toEqual(Array(spec.times).fill(spec.kind));
    }
  });

  it('тэврэлт нь зүрхнээс ялгаатай хээтэй', () => {
    jest.useFakeTimers();
    playHugHaptic();
    jest.runAllTimers();
    jest.useRealTimers();
    expect(nativeCalls()).toEqual(['impactHeavy', 'impactHeavy', 'impactHeavy']);
  });
});

describe('AC-MO-04 haptic асаах/унтраах', () => {
  it('анхдагч асаалттай', () => {
    expect(defaultPrefs.haptics).toBe(true);
  });
  it('унтраасны дараа haptic дуудлага 0', () => {
    usePrefsStore.getState().set({ haptics: false });
    jest.useFakeTimers();
    expect(playHaptic('ANIM-01')).toBe('none');
    jest.runAllTimers();
    jest.useRealTimers();
    expect(nativeCalls()).toEqual([]);
  });
});

describe('AC-217 вэбийн haptic-ийн орлуулга', () => {
  const nav = globalThis.navigator as unknown as { vibrate?: unknown };
  const original = nav.vibrate;
  afterEach(() => {
    nav.vibrate = original;
  });

  it('(а) Android Chrome — navigator.vibrate дуудагдана', () => {
    Platform.OS = 'web';
    const vibrate = jest.fn(() => true);
    nav.vibrate = vibrate;
    expect(playHaptic('ANIM-01')).toBe('vibrate');
    expect(vibrate).toHaveBeenCalledWith(webVibrationPattern(ANIM_HAPTICS['ANIM-01']!));
    expect(nativeCalls()).toEqual([]);
  });

  it('(б) iOS Safari (vibrate байхгүй) — тод дүрслэл', () => {
    Platform.OS = 'web';
    nav.vibrate = undefined;
    expect(playHaptic('ANIM-01')).toBe('visual');
  });

  it('«Дуу» анхдагч унтраастай, асаахад дуу тоглоно', () => {
    const player = jest.fn();
    registerSoundPlayer(player);
    expect(defaultPrefs.sound).toBe(false);
    playHaptic('ANIM-02');
    expect(player).not.toHaveBeenCalled();
    usePrefsStore.getState().set({ sound: true });
    playHaptic('ANIM-02');
    expect(player).toHaveBeenCalledWith('ANIM-02');
    registerSoundPlayer(null);
  });
});
