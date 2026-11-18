import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { AnimationObject } from 'lottie-react-native';
import { Text } from 'react-native';

import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { animStateFor, AnimatedMoment } from '../AnimatedMoment';
import { celebrationDuration, CelebrationOverlay } from '../CelebrationOverlay';
import { Confetti } from '../Confetti';
import { ParticleBurst } from '../ParticleBurst';
import { SizedLottie } from '../SizedLottie';
import { resolveMotion } from '../useMotionPreference';

const lottieMounts: unknown[] = [];
jest.mock('lottie-react-native', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: unknown) => {
      lottieMounts.push(props);
      return <View testID="lottie-view" />;
    },
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));

const heart = { v: '5.7.0', fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [], assets: [] } as unknown as AnimationObject;

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

beforeEach(() => {
  lottieMounts.length = 0;
  usePrefsStore.setState({ ...defaultPrefs });
});

describe('Хөдөлгөөний түвшин', () => {
  it('тохиргоо ба системийн reduce motion', () => {
    expect(resolveMotion('ALL', false)).toBe('full');
    expect(resolveMotion('ALL', true)).toBe('reduced');
    expect(resolveMotion('REDUCED', false)).toBe('reduced');
    expect(resolveMotion('OFF', true)).toBe('off');
    expect(animStateFor('full', true)).toBe('playing');
    expect(animStateFor('full', false)).toBe('done');
    expect(animStateFor('reduced', true)).toBe('reduced');
  });
});

describe('AC-MO-03 «Анимаци: Унтраах»-д Lottie/бөөм 0 frame', () => {
  it('«Бүгд»-д Lottie ба бөөм рендэрлэгдэнэ (харьцуулах суурь)', async () => {
    await wrap(
      <>
        <SizedLottie source={heart} size={96} />
        <ParticleBurst burstKey={1} />
        <Confetti />
      </>,
    );
    expect(lottieMounts).toHaveLength(1);
    expect(screen.getByTestId('particle-burst')).toBeTruthy();
    expect(screen.getByTestId('confetti')).toBeTruthy();
  });

  it('«Унтраах»-д LottieView mount хийгдэхгүй, бөөм/confetti 0, fallback харагдана', async () => {
    usePrefsStore.getState().set({ animation: 'OFF' });
    await wrap(
      <>
        <SizedLottie source={heart} size={96} fallback={<Text testID="static-heart">💗</Text>} />
        <ParticleBurst burstKey={1} />
        <Confetti />
        <AnimatedMoment anim="ANIM-02" playing>
          {() => <Text>Илгээгдлээ</Text>}
        </AnimatedMoment>
      </>,
    );
    expect(lottieMounts).toHaveLength(0);
    expect(screen.queryByTestId('lottie-view')).toBeNull();
    expect(screen.queryByTestId('particle-burst')).toBeNull();
    expect(screen.queryByTestId('confetti')).toBeNull();
    expect(screen.getByTestId('static-heart')).toBeTruthy();
    // Утгын бичвэр хэвээр (AC-MO-01-ийн UT хэсэг)
    expect(screen.getByText('Илгээгдлээ')).toBeTruthy();
  });

  it('«Багасгах»-д ч Lottie тоглогдохгүй, бөөм 0', async () => {
    usePrefsStore.getState().set({ animation: 'REDUCED' });
    await wrap(
      <>
        <SizedLottie source={heart} size={96} />
        <ParticleBurst burstKey={1} />
      </>,
    );
    expect(lottieMounts).toHaveLength(0);
    expect(screen.queryByTestId('particle-burst')).toBeNull();
  });
});

describe('AC-MO-05 Lottie тогтоосон хэмжээтэй контейнерт', () => {
  it('контейнер ба Lottie нь өгсөн хэмжээтэй', async () => {
    await wrap(<SizedLottie source={heart} size={96} testID="lottie-box" />);
    expect(screen.getByTestId('lottie-box')).toHaveStyle({ width: 96, height: 96, overflow: 'hidden' });
    expect(lottieMounts[0]).toMatchObject({ style: { width: 96, height: 96 } });
  });
});

describe('AC-MO-02 баярын анимаци товшиход хаагдана, нэг удаа', () => {
  it('товшиход onDismiss нэг л удаа', async () => {
    const onDismiss = jest.fn();
    await wrap(
      <CelebrationOverlay anim="ANIM-05" visible onDismiss={onDismiss}>
        <Text>Бид 365 хоног хамтдаа</Text>
      </CelebrationOverlay>,
    );
    expect(screen.getByTestId('anim-ANIM-05')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('celebration-overlay')));
    await act(async () => fireEvent.press(screen.getByTestId('celebration-overlay')));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('≤ 2.5 с-ийн дараа өөрөө хаагдана', async () => {
    expect(celebrationDuration(10_000)).toBe(2500);
    expect(celebrationDuration(1200)).toBe(1200);
    const onDismiss = jest.fn();
    await wrap(
      <CelebrationOverlay anim="ANIM-14" visible onDismiss={onDismiss} durationMs={80}>
        <Text>💞</Text>
      </CelebrationOverlay>,
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });
});
