import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Celebration, CELEBRATIONS_KEY, isOccasionCelebration, markCelebrationSeen, useCelebrations } from '@/api/queries/anniversaries';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { CelebrationOverlay } from '@/motion/CelebrationOverlay';
import { useColors } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/**
 * S-25 ойн мэндчилгээ (`fullScreenModal`, FR-8.6, ANIM-05): үзээгүй ой/«N хоног»-ийн баяр нэг
 * удаа; товшиход шууд хаагдаж (AC-MO-02) `POST /me/celebrations/{key}/seen` — дахин нээхэд
 * гарахгүй (AC-39, GAP-23 — хэрэглэгч тутамд).
 */
export default function CelebrationScreen() {
  const t = useT();
  const colors = useColors();
  const queryClient = useQueryClient();
  const celebrations = useCelebrations();
  const [current, setCurrent] = useState<Celebration | null>(null);
  const seen = useMutation({ mutationFn: (eventKey: string) => markCelebrationSeen(eventKey) });

  const pending = celebrations.data?.find(isOccasionCelebration) ?? null;
  if (!current && pending) setCurrent(pending);

  useEffect(() => {
    if (celebrations.isSuccess && !pending && !current) leave();
  }, [celebrations.isSuccess, current, pending]);

  const dismiss = useCallback(() => {
    if (!current) return;
    seen.mutate(current.eventKey);
    queryClient.setQueryData<Celebration[]>(CELEBRATIONS_KEY, (list) => list?.filter((c) => c.eventKey !== current.eventKey));
    leave();
  }, [current, queryClient, seen]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="screen-S-25">
      <CelebrationOverlay anim="ANIM-05" visible={!!current} onDismiss={dismiss}>
        {current ? (
          <View style={styles.content}>
            <AppText variant="display" style={styles.center} testID="celebration-title">
              {current.title}
            </AppText>
            {current.days ? (
              <AppText variant="h2" style={styles.center} testID="celebration-days">
                {t('occasions.celebration.days', { count: current.days })}
              </AppText>
            ) : null}
            <AppText variant="caption" color="textMuted">
              {t('occasions.celebration.hint')}
            </AppText>
          </View>
        ) : null}
      </CelebrationOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  center: { textAlign: 'center' },
});
