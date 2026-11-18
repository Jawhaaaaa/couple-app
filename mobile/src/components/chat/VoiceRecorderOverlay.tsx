import { ChevronLeft, Lock, SendHorizontal, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { SwipeToCancel } from '@/chat/micGesture';
import { formatClock, VOICE_MAX_MS } from '@/chat/voice';
import type { VoiceMode } from '@/chat/useVoiceRecording';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

interface Props {
  mode: VoiceMode;
  durationMs: number;
  levels: number[];
  onCancel: () => void;
  onSend: () => void;
}

const BAR_MAX = 28;

/**
 * S-45 бичлэгийн overlay (ANIM-23): амьд долгион, хугацаа / 5:00, «‹ Гулсуулж цуцлах». Түгжсэн
 * (гар чөлөөтэй) горимд Цуцлах ба Илгээх товч; overlay-г зүүн тийш гулсуулбал ч цуцална.
 * Reduce motion-д баганууд хөдлөхгүй — хугацаа л өснө.
 */
export function VoiceRecorderOverlay({ mode, durationMs, levels, onCancel, onSend }: Props) {
  const t = useT();
  const colors = useColors();
  const [swipe] = useState(() => new SwipeToCancel());
  useEffect(() => {
    swipe.setOnCancel(onCancel);
  }, [swipe, onCancel]);
  const nearLimit = durationMs >= VOICE_MAX_MS - 30_000;

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} testID="screen-S-45" {...swipe.responder.panHandlers}>
      <View style={[styles.dot, { backgroundColor: colors.danger }]} />
      <AppText variant="label" color={nearLimit ? 'warning' : 'text'} accessibilityLabel={t('chat.voice.elapsedA11y', { time: formatClock(durationMs) })} testID="voice-timer">
        {formatClock(durationMs)} / {formatClock(VOICE_MAX_MS)}
      </AppText>
      <AnimatedMoment anim="ANIM-23" playing style={styles.wave}>
        {(level) => (
          <View style={styles.wave} testID="voice-wave">
            {levels.map((l, i) => (
              <View
                key={i}
                style={[styles.bar, { height: level === 'full' ? Math.max(3, l * BAR_MAX) : 6, backgroundColor: colors.primary }]}
              />
            ))}
          </View>
        )}
      </AnimatedMoment>
      {mode === 'hold' ? (
        <View style={styles.hint} testID="voice-slide-hint">
          <ChevronLeft size={16} color={colors.textMuted} strokeWidth={iconStroke} />
          <AppText variant="caption" color="textMuted">
            {t('chat.voice.slideToCancel')}
          </AppText>
          <Lock size={14} color={colors.textMuted} strokeWidth={iconStroke} />
        </View>
      ) : (
        <>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('chat.voice.cancel')} testID="voice-cancel" style={styles.button}>
            <Trash2 size={22} color={colors.danger} strokeWidth={iconStroke} />
          </Pressable>
          <Pressable
            onPress={onSend}
            accessibilityRole="button"
            accessibilityLabel={t('chat.voice.send')}
            testID="voice-send"
            style={[styles.button, styles.send, { backgroundColor: colors.primary }]}
          >
            <SendHorizontal size={20} color={colors.onPrimary} strokeWidth={iconStroke} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: spacing.sm, minHeight: touchTarget, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: BAR_MAX, overflow: 'hidden' },
  bar: { width: 3, borderRadius: 2 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  button: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  send: { borderRadius: radius.pill },
});
