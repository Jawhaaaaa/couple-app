import {
  type AudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { LIVE_BARS, meteringToLevel, pushLevel, VOICE_MAX_MS, VOICE_MIN_MS } from './voice';

export type VoiceMode = 'hold' | 'locked';
export type VoicePhase = 'idle' | 'starting' | 'recording' | 'denied' | 'unsupported';

export interface VoiceClip {
  uri: string;
  mime: string;
  durationMs: number;
}

/** Вэбэд expo-audio нь MediaRecorder-аар бичдэг (iOS Safari — mp4/AAC, Chromium — webm/opus). */
export function voiceRecordingSupported(): boolean {
  if (Platform.OS !== 'web') return true;
  return typeof globalThis.MediaRecorder !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia;
}

function clipMime(recorder: AudioRecorder): string {
  if (Platform.OS !== 'web') return 'audio/mp4';
  const type = (recorder as unknown as { mediaRecorder?: { mimeType?: string } }).mediaRecorder?.mimeType;
  return type && type.length > 0 ? type.split(';')[0] : 'audio/webm';
}

/**
 * S-45 дуу бичих (FR-6.1, AC-32, ANIM-23): native-д expo-audio (AAC m4a), вэбэд MediaRecorder.
 * `hold` — товчийг дарж байх хооронд (суллавал илгээнэ, зүүн тийш гулсуулбал цуцална, дээш түлхвэл
 * түгжинэ); `locked` — гар чөлөөтэй (Илгээх/Цуцлах товчоор). 5 минутад хүрмэгц автоматаар дуусна.
 */
export function useVoiceRecording(onClip: (clip: VoiceClip) => void) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [mode, setMode] = useState<VoiceMode>('locked');
  const [levels, setLevels] = useState<number[]>([]);
  const onClipRef = useRef(onClip);
  const finishing = useRef(false);

  useEffect(() => {
    onClipRef.current = onClip;
  }, [onClip]);

  const reset = useCallback(() => {
    setPhase('idle');
    setLevels([]);
    finishing.current = false;
  }, []);

  const start = useCallback(
    async (nextMode: VoiceMode) => {
      if (!voiceRecordingSupported()) {
        setPhase('unsupported');
        return;
      }
      setMode(nextMode);
      setPhase('starting');
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPhase('denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    },
    [recorder],
  );

  const cancel = useCallback(async () => {
    if (recorder.isRecording) await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    reset();
  }, [recorder, reset]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    const durationMs = recorder.getStatus().durationMillis ?? 0;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    const mime = clipMime(recorder);
    reset();
    if (uri && durationMs >= VOICE_MIN_MS) onClipRef.current({ uri, mime, durationMs: Math.min(durationMs, VOICE_MAX_MS) });
  }, [recorder, reset]);

  const lock = useCallback(() => setMode('locked'), []);

  // ANIM-23: амьд долгион ба 5 минутын хязгаар — бичлэгийн төлөв өөрчлөгдөх бүрд
  const recording = phase === 'recording';
  const durationMs = recording ? state.durationMillis : 0;
  const metering = state.metering;
  const [lastSample, setLastSample] = useState(0);
  if (recording && durationMs !== lastSample) {
    setLastSample(durationMs);
    setLevels((prev) => pushLevel(prev, meteringToLevel(metering), LIVE_BARS));
  }
  useEffect(() => {
    if (recording && durationMs >= VOICE_MAX_MS) void finish();
  }, [recording, durationMs, finish]);

  return { phase, mode, durationMs, levels, start, cancel, finish, lock, dismiss: reset };
}
