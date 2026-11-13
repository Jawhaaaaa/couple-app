import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { HardDrive, Trash2 } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EXPORTS_KEY, isExportBusy, startExport, useExports } from '@/api/queries/exports';
import { formatGigabytes, useStorageUsage } from '@/api/queries/storage';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ExportRow } from '@/components/ExportRow';
import { FormMessage } from '@/components/FormMessage';
import { StackScreen } from '@/components/StackScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/**
 * S-85 Өгөгдөл ба хадгалалт (FR-14.5, NFR-11, AC-53, AC-126): хэрэглээ «X / 10 GB» (80%-д анхааруулга),
 * нэг товчоор бүтэн хуулбар (ZIP: JSON + медиа + HTML), бэлэн болоход мэдэгдэл, 7 хоногийн холбоос;
 * хогийн сав руу.
 */
export default function DataScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const usage = useStorageUsage();
  const exportsQuery = useExports();
  const start = useMutation({
    mutationFn: () => startExport({ kind: 'FULL', locale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXPORTS_KEY }),
  });
  const full = exportsQuery.data?.filter((e) => e.kind === 'FULL') ?? [];
  const ratio = Math.min(1, usage.data?.ratio ?? 0);

  return (
    <StackScreen title={t('dataSettings.title')} testID="screen-S-85">
      <ScrollView contentContainerStyle={styles.body}>
        <Card testID="data-usage">
          <View style={styles.row}>
            <HardDrive size={20} color={colors.primary} strokeWidth={iconStroke} />
            <AppText variant="h3" testID="data-usage-text">
              {usage.data
                ? t('dataSettings.usage', { used: formatGigabytes(usage.data.usedBytes, locale), quota: formatGigabytes(usage.data.quotaBytes, locale) })
                : t('common.loading')}
            </AppText>
          </View>
          <View
            style={[styles.bar, { backgroundColor: colors.surfaceRaised }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
          >
            <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: usage.data?.warning ? colors.warning : colors.primary }]} />
          </View>
          {usage.data?.warning ? <FormMessage kind="info" text={t('dataSettings.warning')} testID="data-usage-warning" /> : null}
        </Card>

        <Card testID="data-export">
          <AppText variant="h3" accessibilityRole="header">
            {t('dataSettings.exportTitle')}
          </AppText>
          <AppText color="textMuted">{t('dataSettings.exportNote')}</AppText>
          <AppButton label={t('dataSettings.exportStart')} onPress={() => start.mutate()} loading={start.isPending} disabled={offline} testID="data-export-start" />
          {start.isSuccess ? <FormMessage kind="success" text={t('dataSettings.exportStarted')} testID="data-export-started" /> : null}
          {start.error ? (
            <FormMessage text={isExportBusy(start.error) ? t('dataSettings.exportBusy') : errorText(start.error)} testID="data-export-error" />
          ) : null}
          {full.length > 0 ? (
            <AppText variant="label" color="textMuted">
              {t('dataSettings.exports')}
            </AppText>
          ) : null}
          {full.map((e) => (
            <ExportRow key={e.id} item={e} offline={offline} />
          ))}
        </Card>

        <Card testID="data-trash">
          <View style={styles.row}>
            <Trash2 size={20} color={colors.primary} strokeWidth={iconStroke} />
            <AppText variant="h3">{t('dataSettings.trash')}</AppText>
          </View>
          <AppText color="textMuted">{t('dataSettings.trashNote')}</AppText>
          <AppButton variant="secondary" label={t('dataSettings.trash')} onPress={() => router.push('/memories/trash')} testID="data-open-trash" />
        </Card>
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bar: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
