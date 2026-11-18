import { type Href, router } from 'expo-router';
import { HardDrive } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { formatGigabytes, useStorageUsage } from '@/api/queries/storage';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ScreenState } from '@/components/ScreenState';
import { closeSheet, SheetScreen } from '@/components/SheetScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/**
 * S-98 Хадгалах сан дүүрсэн (`formSheet`, NFR-11, AC-200): upload 507-оор зогсоход
 * гарна. Хэрэглээний мөр «3,2 / 10 GB», тайлбар, хогийн сав цэвэрлэх санал.
 */
export default function StorageFullSheet() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const usage = useStorageUsage();

  let body;
  if (usage.isPending) body = <ScreenState kind="loading" rows={1} />;
  else if (!usage.data) body = <ScreenState kind="error" message={errorText(usage.error)} onRetry={() => void usage.refetch()} />;
  else {
    const ratio = Math.min(1, Math.max(0, usage.data.ratio));
    const used = formatGigabytes(usage.data.usedBytes, locale);
    const quota = formatGigabytes(usage.data.quotaBytes, locale);
    body = (
      <Card testID="storage-usage">
        <View style={styles.row}>
          <HardDrive size={22} color={colors.primary} strokeWidth={iconStroke} />
          <AppText variant="h3" testID="storage-usage-text">
            {t('storage.usage', { used, quota })}
          </AppText>
        </View>
        <View
          style={[styles.track, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('storage.usageA11y', { used, quota })}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
          testID="storage-usage-bar"
        >
          <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: ratio >= 1 ? colors.danger : colors.warning }]} />
        </View>
      </Card>
    );
  }

  return (
    <SheetScreen title={t('states.storageFullTitle')} testID="screen-S-98">
      {body}
      <AppText>{t('storage.body')}</AppText>
      <AppText color="textMuted">{t('storage.hint')}</AppText>
      <AppButton label={t('storage.trash')} onPress={() => router.push('/memories/trash' as Href)} testID="storage-trash" />
      <AppButton variant="ghost" label={t('common.close')} onPress={closeSheet} testID="storage-close" />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  track: { height: 14, borderRadius: radius.pill, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
