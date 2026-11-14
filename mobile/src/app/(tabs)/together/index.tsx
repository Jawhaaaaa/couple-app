import { router } from 'expo-router';
import { CalendarHeart, ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { MilestoneHorizon } from '@/components/occasions/MilestoneHorizon';
import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-60 Хамтдаа хаб: ой ба тэмдэглэлт өдрүүд (Milestone Horizon → S-61). Бусад картын
 * (захидал, check-in, жагсаалт, зорилго) агуулга дараагийн нэгжид; одоохондоо хоосон төлөв (ANIM-11).
 */
export default function TogetherScreen() {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const empty = emptyStateText('S-60', locale);
  return (
    <TabScreen title={t('tabs.together')} testID="screen-S-60">
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          onPress={() => router.push('/together/occasions')}
          accessibilityRole="link"
          accessibilityLabel={t('occasions.title')}
          testID="together-occasions"
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <CalendarHeart size={22} color={colors.primary} strokeWidth={iconStroke} />
          <View style={styles.flex}>
            <AppText variant="h3">{t('occasions.title')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('occasions.hubCard')}
            </AppText>
          </View>
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        </Pressable>
        <MilestoneHorizon />
        <View style={styles.placeholder}>
          <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => {}} />
        </View>
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, minHeight: touchTarget },
  flex: { flex: 1 },
  placeholder: { flex: 1, minHeight: 280 },
});
