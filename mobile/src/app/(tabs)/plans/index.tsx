import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CalendarView } from '@/components/plans/CalendarView';
import { IdeasPane } from '@/components/plans/IdeasPane';
import { UpcomingPane } from '@/components/plans/UpcomingPane';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { TabScreen } from '@/components/TabScreen';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

type PlansTab = 'upcoming' | 'ideas' | 'calendar';

/**
 * S-50 Төлөвлөгөө (FR-7.3, AC-94): «Удахгүй / Санаанууд / Календарь» таб, «Болзоо санал болгох» → S-54.
 * Санаанууд нь S-51, календарь нь S-52-той ижил (`ideas.tsx`, `calendar.tsx` — deep link).
 */
export default function PlansScreen() {
  const t = useT();
  const colors = useColors();
  const [tab, setTab] = useState<PlansTab>('upcoming');
  return (
    <TabScreen title={t('tabs.plans')} testID="screen-S-50">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable
            onPress={() => router.push('/plans/new')}
            accessibilityRole="button"
            accessibilityLabel={t('plans.propose')}
            testID="plans-propose"
            style={({ pressed }) => [styles.propose, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Plus size={18} color={colors.onPrimary} strokeWidth={iconStroke} />
            <AppText variant="label" color="onPrimary">
              {t('plans.propose')}
            </AppText>
          </Pressable>
        </View>
        <SegmentedTabs
          options={[
            { key: 'upcoming', label: t('plans.tabs.upcoming') },
            { key: 'ideas', label: t('plans.tabs.ideas') },
            { key: 'calendar', label: t('plans.tabs.calendar') },
          ]}
          value={tab}
          onChange={setTab}
          testID="plans-tabs"
        />
        {tab === 'upcoming' ? <UpcomingPane /> : tab === 'ideas' ? <IdeasPane /> : <CalendarView />}
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xxl },
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  propose: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
});
