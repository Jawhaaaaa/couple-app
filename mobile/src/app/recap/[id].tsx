import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRecap } from '@/api/queries/recaps';
import { RecapStory } from '@/components/memories/RecapStory';
import { ScreenState } from '@/components/ScreenState';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/memories?view=recap');
}

/**
 * S-38 Жилийн хураангуй (`fullScreenModal`, FR-5.11, AC-84, ANIM-22): story хэлбэрийн
 * слайдууд автоматаар солигдоно; баруун талыг товшвол дараах, зүүнийг товшвол өмнөх;
 * түр зогсоох товчтой (WCAG 2.2.2). Reduce motion-д Ken Burns, тоолох хөдөлгөөнгүй — зөвхөн fade.
 */
export default function RecapScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recap = useRecap(id);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} testID="screen-S-38">
      {recap.data ? (
        <RecapStory slides={recap.data.slides} yearLabel={recap.data.yearLabel} onClose={close} />
      ) : (
        <>
          <View style={styles.bar}>
            <View style={styles.flex} />
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.icon} testID="recap-close">
              <X size={26} color={colors.text} strokeWidth={iconStroke} />
            </Pressable>
          </View>
          {recap.isPending ? (
            <ScreenState kind="loading" rows={2} />
          ) : (
            <ScreenState kind="error" message={errorText(recap.error)} onRetry={() => void recap.refetch()} />
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
});
