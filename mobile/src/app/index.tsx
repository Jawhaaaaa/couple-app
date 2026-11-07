import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

export default function Index() {
  const t = useT();
  return (
    <View style={styles.root}>
      <AppText variant="display">{t('app.name')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.screen },
});
