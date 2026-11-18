import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Message } from '@/api/queries/chat';
import { AppText } from '@/components/AppText';
import { formatClock, playedBars, waveformOrFlat } from '@/chat/voice';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const BAR_MAX = 26;

/**
 * Дуут мессеж тоглуулах (AC-32, ANIM-23): серверийн 64 цэгийн долгион, тоглуулахад явцаар өнгөлөгдөнө,
 * урт `durationMs`-ээс. Хөрвүүлэлт дуусаагүй (`PROCESSING`) бол «боловсруулж байна».
 */
export function VoiceMessagePlayer({ message, mine }: { message: Message; mine: boolean }) {
  const t = useT();
  const colors = useColors();
  const media = message.media;
  const ready = media?.status === 'READY';
  const player = useAudioPlayer(ready ? media.urls.original : null);
  const status = useAudioPlayerStatus(player);
  const bars = waveformOrFlat(media?.waveform);
  const totalMs = media?.durationMs ?? Math.round((status.duration || 0) * 1000);
  const played = playedBars(bars.length, status.currentTime, status.duration || totalMs / 1000);
  const fg = mine ? colors.onPrimary : colors.text;
  const dim = mine ? colors.glow : colors.border;

  const toggle = () => {
    if (!ready) return;
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) void player.seekTo(0);
    player.play();
  };

  return (
    <View style={styles.root} testID="voice-player">
      <Pressable
        onPress={toggle}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t('chat.voice.pause') : t('chat.voice.play', { time: formatClock(totalMs) })}
        accessibilityState={{ disabled: !ready }}
        testID="voice-toggle"
        style={[styles.play, { backgroundColor: mine ? colors.onPrimary : colors.primary }]}
      >
        {status.playing ? (
          <Pause size={18} color={mine ? colors.primary : colors.onPrimary} strokeWidth={iconStroke} />
        ) : (
          <Play size={18} color={mine ? colors.primary : colors.onPrimary} strokeWidth={iconStroke} />
        )}
      </Pressable>
      <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="voice-waveform">
        {bars.map((v, i) => (
          <View key={i} style={[styles.bar, { height: Math.max(3, v * BAR_MAX), backgroundColor: i < played ? fg : dim }]} />
        ))}
      </View>
      <AppText variant="caption" style={{ color: fg }} testID="voice-duration">
        {ready ? formatClock(status.playing || status.currentTime > 0 ? status.currentTime * 1000 : totalMs) : t('chat.voice.processing')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 200 },
  play: { width: touchTarget - 8, height: touchTarget - 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 1, height: BAR_MAX },
  bar: { width: 2, borderRadius: 1 },
});
