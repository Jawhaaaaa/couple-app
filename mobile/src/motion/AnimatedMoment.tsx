import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import type { AnimId } from './anims';
import { type MotionLevel, useMotionPreference } from './useMotionPreference';

export type AnimState = 'playing' | 'done' | 'reduced' | 'off';

export function animStateFor(level: MotionLevel, playing: boolean): AnimState {
  if (level === 'off') return 'off';
  if (level === 'reduced') return 'reduced';
  return playing ? 'playing' : 'done';
}

interface Props extends Omit<ViewProps, 'children'> {
  anim: AnimId;
  playing: boolean;
  children: (level: MotionLevel) => ReactNode;
}

/**
 * ANIM-ийг E2E-д ажиглах тэмдэглэгээ (TQ-05, DD-AURA-026): `testID="anim-ANIM-01"`,
 * вэбэд `data-anim-state="playing|done|reduced|off"`.
 */
export function AnimatedMoment({ anim, playing, children, ...rest }: Props) {
  const level = useMotionPreference();
  const state = animStateFor(level, playing);
  const webData = { dataSet: { animState: state, anim } } as object;
  return (
    <View {...rest} {...webData} testID={`anim-${anim}`} accessibilityState={{ busy: state === 'playing' }}>
      {children(level)}
    </View>
  );
}
