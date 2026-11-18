import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Mascot } from './Mascot';

/** S-96 «Сервертэй холбогдож чадсангүй» — маскот + дахин оролдох. */
export function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <View style={styles.center} testID="server-unreachable" accessibilityRole="alert">
      <Mascot size={110} pose="tilt" />
      <AppText variant="h2" style={styles.text}>
        {t('states.serverUnreachableTitle')}
      </AppText>
      <AppText color="textMuted" style={styles.text}>
        {t('states.serverUnreachableBody')}
      </AppText>
      <AppButton label={t('common.retry')} onPress={onRetry} testID="state-retry" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  text: { textAlign: 'center' },
});
