import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useGoals } from '@/api/queries/goals';
import { AppText } from '@/components/AppText';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { GoalCard } from '@/components/together/GoalCard';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-64 хамтын зорилгууд (FR-9.3, 9.4): алхамтай ба мөнгөн зорилго, ANIM-20 явц, «2/4 алхам»
 * (AC-108). Дууссан нь доор (серверийн дараалал).
 */
export default function GoalsScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const goals = useGoals();

  let body;
  if (goals.isError && !goals.data) body = <ScreenState kind="error" message={errorText(goals.error)} onRetry={() => void goals.refetch()} />;
  else if (goals.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (goals.data.length === 0) {
    const empty = emptyStateText('S-64', locale);
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/together/goals/new')} />;
  } else {
    body = goals.data.map((g) => <GoalCard key={g.id} goal={g} />);
  }

  return (
    <StackScreen title={t('goals.title')} testID="screen-S-64">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.top}>
          <Pressable
            onPress={() => router.push('/together/goals/new')}
            accessibilityRole="button"
            accessibilityLabel={t('goals.add')}
            testID="goals-add"
            style={({ pressed }) => [styles.add, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Plus size={18} color={colors.onPrimary} strokeWidth={iconStroke} />
            <AppText variant="label" color="onPrimary">
              {t('goals.add')}
            </AppText>
          </Pressable>
        </View>
        {body}
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  add: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.md, borderRadius: radius.pill },
});
