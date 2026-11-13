import { router } from 'expo-router';
import { Bell, ChevronRight, CircleUser, Lock } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { TabScreen } from '@/components/TabScreen';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** S-80 Тохиргоо — бүлгүүдийн бүтэн жагсаалт T-79-д; одоохондоо S-81 Профайл. */
export default function SettingsScreen() {
  const t = useT();
  const colors = useColors();
  return (
    <TabScreen title={t('common.settings')} testID="screen-S-80">
      <View style={styles.list}>
        <Pressable
          onPress={() => router.push('/settings/profile')}
          accessibilityRole="button"
          accessibilityLabel={t('common.profile')}
          testID="settings-profile"
          style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <CircleUser size={22} color={colors.primary} strokeWidth={iconStroke} />
          <AppText style={styles.flex}>{t('common.profile')}</AppText>
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/notifications')}
          accessibilityRole="button"
          accessibilityLabel={t('notificationSettings.title')}
          testID="settings-notifications"
          style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Bell size={22} color={colors.primary} strokeWidth={iconStroke} />
          <AppText style={styles.flex}>{t('notificationSettings.title')}</AppText>
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/security')}
          accessibilityRole="button"
          accessibilityLabel={t('lock.settings.screenTitle')}
          testID="settings-security"
          style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Lock size={22} color={colors.primary} strokeWidth={iconStroke} />
          <AppText style={styles.flex}>{t('lock.settings.screenTitle')}</AppText>
          <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        </Pressable>
      </View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.xs },
  flex: { flex: 1 },
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.input,
  },
});
