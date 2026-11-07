import { WifiOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

/** S-95 — бүх дэлгэцийн дээд талд «Интернэт алга» зурвас. */
export function OfflineBanner({ offline: forced }: { offline?: boolean }) {
  const { offline: detected } = useNetworkStatus();
  const offline = forced ?? detected;
  const colors = useColors();
  const t = useT();
  if (!offline) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} accessibilityRole="alert" testID="offline-banner">
      <View style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <WifiOff size={16} color={colors.textMuted} strokeWidth={iconStroke} />
        <AppText variant="caption" color="textMuted" style={styles.text}>
          {t('states.offline')}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  text: { flex: 1 },
});
