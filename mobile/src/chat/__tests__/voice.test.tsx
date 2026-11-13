import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { Message } from '@/api/queries/chat';
import { MicGesture, TAP_MS } from '@/chat/micGesture';
import { formatClock, meteringToLevel, playedBars, pushLevel, VOICE_MAX_MS, voiceFileName, waveformOrFlat } from '@/chat/voice';
import { VoiceMessagePlayer } from '@/components/chat/VoiceMessagePlayer';
import { VoiceRecorderOverlay } from '@/components/chat/VoiceRecorderOverlay';
import { ThemeProvider } from '@/theme/ThemeProvider';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) };
let mockStatus = { playing: false, currentTime: 0, duration: 12, didJustFinish: false, isLoaded: true };
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => mockPlayer),
  useAudioPlayerStatus: jest.fn(() => mockStatus),
}));

describe('AC-32 дуут мессежийн туслах', () => {
  it('урт m:ss, 5 минутын хязгаар', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_400)).toBe('1:05');
    expect(formatClock(VOICE_MAX_MS)).toBe('5:00');
  });

  it('ANIM-23 metering → 0…1, сүүлийн N багана', () => {
    expect(meteringToLevel(-160)).toBe(0.05);
    expect(meteringToLevel(0)).toBe(1);
    expect(meteringToLevel(undefined)).toBe(0.05);
    expect(pushLevel([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4]);
  });

  it('MIME-ээр өргөтгөл (iOS Safari mp4/AAC, Chromium webm)', () => {
    const at = new Date('2026-11-07T04:00:00Z');
    expect(voiceFileName('audio/webm', at)).toMatch(/\.webm$/);
    expect(voiceFileName('audio/mp4', at)).toMatch(/\.m4a$/);
  });

  it('тоглуулах явц баганаар', () => {
    expect(playedBars(64, 6, 12)).toBe(32);
    expect(playedBars(64, 0, 0)).toBe(0);
    expect(waveformOrFlat(null, 4)).toEqual([0.2, 0.2, 0.2, 0.2]);
  });
});

describe('S-45 микрофоны gesture — гулсуулж цуцлах, түгжих', () => {
  function setup() {
    let t = 0;
    const g = new MicGesture(() => t);
    const h = { start: jest.fn(), cancel: jest.fn(), finish: jest.fn(), lock: jest.fn() };
    g.setHandlers(h);
    return { g, h, advance: (ms: number) => (t += ms) };
  }

  it('дарж байгаад суллахад илгээнэ', () => {
    const { g, h, advance } = setup();
    g.grant();
    expect(h.start).toHaveBeenCalledWith('hold');
    advance(1500);
    g.release();
    expect(h.finish).toHaveBeenCalledTimes(1);
  });

  it('зүүн тийш гулсуулбал цуцална, дараа нь суллахад илгээхгүй', () => {
    const { g, h, advance } = setup();
    g.grant();
    g.move(-120, 0);
    advance(2000);
    g.release();
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(h.finish).not.toHaveBeenCalled();
  });

  it('дээш түлхвэл түгжинэ; богино товшилт ч түгжинэ', () => {
    const a = setup();
    a.g.grant();
    a.g.move(0, -90);
    a.g.release();
    expect(a.h.lock).toHaveBeenCalledTimes(1);
    const b = setup();
    b.g.grant();
    b.advance(TAP_MS - 50);
    b.g.release();
    expect(b.h.lock).toHaveBeenCalledTimes(1);
    expect(b.h.finish).not.toHaveBeenCalled();
  });
});

describe('S-45 overlay ба тоглуулагч', () => {
  it('ANIM-23 түгжсэн горимд Цуцлах/Илгээх, хугацаа / 5:00', async () => {
    const onCancel = jest.fn();
    const onSend = jest.fn();
    await render(
      <ThemeProvider>
        <VoiceRecorderOverlay mode="locked" durationMs={42_000} levels={[0.2, 0.8]} onCancel={onCancel} onSend={onSend} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('voice-timer')).toHaveTextContent('0:42 / 5:00');
    expect(screen.getByTestId('anim-ANIM-23')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('voice-send'));
    expect(onSend).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('voice-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('барих горимд «Гулсуулж цуцлах» заавар', async () => {
    await render(
      <ThemeProvider>
        <VoiceRecorderOverlay mode="hold" durationMs={1000} levels={[]} onCancel={jest.fn()} onSend={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('voice-slide-hint')).toBeTruthy();
    expect(screen.queryByTestId('voice-send')).toBeNull();
  });

  const voiceMessage = (overrides: Partial<NonNullable<Message['media']>> = {}) =>
    ({
      id: 'v1',
      clientMessageId: 'c-v1',
      sender: { id: 'u', displayName: 'Ану' },
      kind: 'VOICE',
      status: 'READ',
      deleted: false,
      reactions: [],
      createdAt: '2026-11-07T04:00:00Z',
      media: {
        id: 'm',
        kind: 'AUDIO',
        status: 'READY',
        mime: 'audio/mp4',
        sizeBytes: 1000,
        durationMs: 12_000,
        waveform: Array.from({ length: 64 }, (_, i) => (i % 8) / 8),
        urls: { original: 'https://s3/x' },
        urlsExpireAt: '2026-11-07T05:00:00Z',
        ...overrides,
      },
    }) as Message;

  it('AC-32 урт, 64 баганын долгион; товшвол тоглоно, явц өнгөлөгдөнө', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 12, didJustFinish: false, isLoaded: true };
    const { rerender } = await render(
      <ThemeProvider>
        <VoiceMessagePlayer message={voiceMessage()} mine={false} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('voice-duration')).toHaveTextContent('0:12');
    expect(screen.getByTestId('voice-waveform', { includeHiddenElements: true }).children).toHaveLength(64);
    await fireEvent.press(screen.getByTestId('voice-toggle'));
    expect(mockPlayer.play).toHaveBeenCalled();
    mockStatus = { playing: true, currentTime: 6, duration: 12, didJustFinish: false, isLoaded: true };
    await act(async () =>
      rerender(
        <ThemeProvider>
          <VoiceMessagePlayer message={voiceMessage()} mine={false} />
        </ThemeProvider>,
      ),
    );
    expect(screen.getByTestId('voice-duration')).toHaveTextContent('0:06');
  });

  it('хөрвүүлэлт дуусаагүй бол «Боловсруулж байна», тоглуулах идэвхгүй', async () => {
    await render(
      <ThemeProvider>
        <VoiceMessagePlayer message={voiceMessage({ status: 'PROCESSING', waveform: null })} mine />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('voice-duration')).toHaveTextContent(/Боловсруулж/);
    await fireEvent.press(screen.getByTestId('voice-toggle'));
    expect(mockPlayer.play).not.toHaveBeenCalledTimes(2);
  });
});
