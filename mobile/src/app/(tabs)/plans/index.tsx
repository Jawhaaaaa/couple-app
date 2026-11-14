import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CalendarView } from '@/components/plans/CalendarView';
import { UpcomingPane } from '@/components/plans/UpcomingPane';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { TabScreen } from '@/components/TabScreen';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

type PlansTab = 'upcoming' | 'calendar';

/**
 * S-50 Төлөвлөгөө (FR-7.3, AC-94): «Удахгүй / Календарь» таб, «Болзоо санал болгох» → S-54.
 * Календарийн таб нь S-52-той ижил (`calendar.tsx` нь deep link-д).
 */
export default function PlansScreen() {
  const t = useT();
  const colors = useColors();
  const [tab, setTab] = useState<PlansTab>('upcoming');
  return (
    <TabScreen title={t('tabs.plans')} testID="screen-S-50">
      <ScrollView contentContainerStyle={styles.body}>
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
            { key: 'calendar', label: t('plans.tabs.calendar') },
          ]}
          value={tab}
          onChange={setTab}
          testID="plans-tabs"
        />
        {tab === 'upcoming' ? <UpcomingPane /> : <CalendarView />}
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
