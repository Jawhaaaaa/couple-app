import { ScrollView, StyleSheet } from 'react-native';

import { IdeasPane } from '@/components/plans/IdeasPane';
import { StackScreen } from '@/components/StackScreen';
import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

/** S-51 санаанууд (deep link) — S-50-ийн «Санаанууд» табтай ижил. */
export default function IdeasScreen() {
  const t = useT();
  return (
    <StackScreen title={t('plans.ideas.title')} testID="screen-S-51">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <IdeasPane />
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xxl },
});
