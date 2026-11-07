import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import type { SignalKind, SignalSummary } from '@/api/queries/dashboard';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { markSignalsSeen } from '@/signals/seen';
import { spacing } from '@/theme/tokens';

const EMOJI: Record<SignalKind, string> = { HEART: '💗', HUG: '🤗', THINKING: '💭' };
const ANIM_MS = 1600;

export function signalEmoji(kinds: SignalKind[]): string {
  const unique = [...new Set(kinds.length ? kinds : (['HEART'] as SignalKind[]))];
  return unique.map((k) => EMOJI[k]).join('');
}

/**
 * Апп хаалттай байхад ирсэн дохионууд нэг нэгтгэсэн карт (AC-18: «3 💗»): ANIM-02 нэг л
 * удаа тоглоод `POST /signals/seen`. Карт нь дуудагчийн хадгалсан snapshot-оор энэ
 * үзэлтийн турш үлдэнэ (дахин татахад алга болохгүй, дахин тоглохгүй).
 */
export function UnseenSignalsCard({ summary, name }: { summary: SignalSummary; name: string }) {
  const t = useT();
  const [playing, setPlaying] = useState(true);
  const acknowledged = useRef(false);

  useEffect(() => {
    if (acknowledged.current) return;
    acknowledged.current = true;
    playHaptic('ANIM-02');
    // Амжилтгүй бол дараагийн нээлтэд дахин нэгтгэж харуулна — энэ картад алдаа харуулахгүй
    markSignalsSeen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPlaying(false), ANIM_MS);
    return () => clearTimeout(timer);
  }, []);

  const text = t('home.unseen.title', { name, count: summary.count, emoji: signalEmoji(summary.kinds) });
  return (
    <Card testID="home-unseen-signals">
      <AnimatedMoment anim="ANIM-02" playing={playing} style={styles.row}>
        {(motion) => (
          <Animated.View entering={motion === 'full' ? ZoomIn.springify() : motion === 'reduced' ? FadeIn : undefined} style={styles.row}>
            <AppText style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
              {signalEmoji(summary.kinds)}
            </AppText>
            <AppText variant="h3" style={styles.flex} accessibilityLiveRegion="polite" testID="home-unseen-text">
              {text}
            </AppText>
          </Animated.View>
        )}
      </AnimatedMoment>
      {summary.lastText ? (
        <AppText variant="quote" testID="home-unseen-quote">
          {t('signals.quote', { text: summary.lastText })}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  emoji: { fontSize: 32, lineHeight: 40 },
});
