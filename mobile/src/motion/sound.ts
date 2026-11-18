import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import type { AnimId } from './anims';
import { registerSoundPlayer } from './haptics';

/**
 * Сонголтот зөөлөн дуу (FR-19.7, Тохиргоо → «Дуу», анхдагч унтраастай).
 * iOS Safari вэб апп-д чичиргээ байхгүй тул haptic-ийн орлуулга. Native дээр haptic
 * хангалттай тул дуу тоглуулахгүй.
 */
const SOUND_FILES = {
  heart: require('../../assets/sounds/heart.wav'),
  chime: require('../../assets/sounds/chime.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  success: require('../../assets/sounds/success.wav'),
} as const;
export type SoundName = keyof typeof SOUND_FILES;

export const ANIM_SOUNDS: Partial<Record<AnimId | 'HUG', SoundName>> = {
  'ANIM-01': 'heart',
  HUG: 'heart',
  'ANIM-02': 'chime',
  'ANIM-03': 'pop',
  'ANIM-05': 'success',
  'ANIM-06': 'pop',
  'ANIM-07': 'pop',
  'ANIM-12': 'success',
  'ANIM-13': 'pop',
  'ANIM-14': 'success',
  'ANIM-15': 'pop',
  'ANIM-17': 'pop',
  'ANIM-18': 'success',
  'ANIM-19': 'chime',
  'ANIM-20': 'success',
  'ANIM-21': 'success',
};

function playWeb(name: SoundName) {
  const uri = Asset.fromModule(SOUND_FILES[name]).uri;
  const audio = new Audio(uri);
  audio.volume = 0.5;
  audio.play().catch(() => {});
}

/** Апп эхлэхэд нэг удаа дуудна. */
export function installSoundPlayer() {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return;
  registerSoundPlayer((anim) => {
    const name = ANIM_SOUNDS[anim];
    if (name) playWeb(name);
  });
}
