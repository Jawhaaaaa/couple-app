import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useYearInReview } from '@/api/queries/stats';
import { AppButton } from '@/components/AppButton';
import { FormMessage } from '@/components/FormMessage';
import { RecapStory } from '@/components/memories/RecapStory';
import { ScreenState } from '@/components/ScreenState';
import { useErrorText } from '@/hooks/useErrorText';
import { formatNumber, useT } from '@/i18n';
import { saveYearImage } from '@/stats/yearImage';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/together/stats');
}

/**
 * S-72 «Бидний жил» (`fullScreenModal`, FR-12.4, AC-118, ANIM-22): тухайн жилийн тоо, хамгийн их
 * дурсамжтай сар, хамгийн их очсон газар, топ зураг — 6–10 слайд; сүүлийнхийг зураг болгон хадгална.
 * Зөвхөн хоёр хүнд (сервер хосын space-ээр шүүнэ).
 */
export default function YearInReviewScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const params = useLocalSearchParams<{ year: string }>();
  const year = Number.parseInt(String(params.year ?? ''), 10);
  const valid = Number.isInteger(year) && year > 2000 && year < 2200;
  const review = useYearInReview(valid ? year : null);
  const stage = useRef<View>(null);
  const [saved, setSaved] = useState<'saved' | 'denied' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!review.data) return;
    setSaving(true);
    const labels: Record<string, string> = {
      title: t('stats.yearTitle', { year }),
      bg: colors.bg,
      text: colors.text,
      primary: colors.primary,
      muted: colors.textMuted,
      ...(review.data.topPlace ? { topPlace: t('stats.topPlace', { place: review.data.topPlace.placeName }) } : {}),
    };
    for (const key of Object.keys(review.data.totals)) labels[`total.${key}`] = t(`stats.${key}`, { defaultValue: '' });
    setSaved(await saveYearImage(stage, review.data, labels));
    setSaving(false);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} testID="screen-S-72">
      {review.data ? (
        <RecapStory
          slides={review.data.slides}
          yearLabel={formatNumber(year, locale).replace(/\s/g, '')}
          onClose={close}
          stageRef={stage}
          lastActions={
            <View style={styles.actions}>
              <AppButton variant="secondary" label={t('stats.saveImage')} onPress={() => void save()} loading={saving} testID="year-save-image" />
              {saved ? (
                <FormMessage kind={saved === 'saved' ? 'success' : 'error'} text={t(`stats.save.${saved}`)} testID="year-save-result" />
              ) : null}
            </View>
          }
        />
      ) : (
        <>
          <View style={styles.bar}>
            <View style={styles.flex} />
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.icon} testID="year-close">
              <X size={26} color={colors.text} strokeWidth={iconStroke} />
            </Pressable>
          </View>
          {review.isPending && valid ? (
            <ScreenState kind="loading" rows={2} />
          ) : (
            <ScreenState kind="error" message={valid ? errorText(review.error) : t('stats.badYear')} onRetry={() => void review.refetch()} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  actions: { marginHorizontal: spacing.screen, marginBottom: spacing.xs, gap: spacing.xs },
});
