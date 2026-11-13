import { router } from 'expo-router';
import { SectionList, StyleSheet } from 'react-native';

import { useOnThisDay } from '@/api/queries/memories';
import { AppText } from '@/components/AppText';
import { MemoryCard } from '@/components/memories/MemoryCard';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { formatNumber, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

/** S-23 Жилийн өмнөх өнөөдөр (FR-3.6, AC-73): тухайн өдрийн өмнөх жилүүдийн дурсамжууд, жилээр. */
export default function OnThisDayScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const groups = useOnThisDay();
  const empty = emptyStateText('S-23', locale);
  let body;
  if (groups.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (!groups.data) body = <ScreenState kind="error" message={errorText(groups.error)} onRetry={() => void groups.refetch()} />;
  else if (groups.data.length === 0) body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/memories')} />;
  else
    body = (
      <SectionList
        sections={groups.data.map((g) => ({ key: String(g.year), year: g.year, data: g.memories }))}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <AppText variant="h2" accessibilityRole="header" style={styles.year} testID="on-this-day-year">
            {t('home.onThisDay.year', { year: formatNumber(section.year, locale).replace(/\s/g, '') })}
          </AppText>
        )}
        renderItem={({ item }) => <MemoryCard memory={item} />}
      />
    );
  return (
    <StackScreen title={t('home.onThisDay.title')} testID="screen-S-23">
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.sm },
  year: { paddingVertical: spacing.xs },
});
