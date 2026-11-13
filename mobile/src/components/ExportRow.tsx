import { useMutation } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { type DataExport, type ExportKind, exportDownloadPath, isExportActive } from '@/api/queries/exports';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { API_BASE } from '@/config';
import { useErrorText } from '@/hooks/useErrorText';
import { formatDate, formatDateLong, useT } from '@/i18n';
import { saveFile } from '@/media/saveFile';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const FILE_NAMES: Record<ExportKind, { name: string; mime: string }> = {
  BOOK_PDF: { name: 'aura-dursamj.pdf', mime: 'application/pdf' },
  ALBUM_ZIP: { name: 'aura-tsomog.zip', mime: 'application/zip' },
  FULL: { name: 'aura-export.zip', mime: 'application/zip' },
};

/** Экспортын нэг мөр (S-39, S-85): төлөв, хүчинтэй хугацаа (7 хоног), татах. */
export function ExportRow({ item, offline }: { item: DataExport; offline: boolean }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const download = useMutation({
    mutationFn: () => {
      const token = useSessionStore.getState().accessToken;
      const file = FILE_NAMES[item.kind];
      return saveFile({
        url: `${API_BASE}${exportDownloadPath(item.id)}`,
        fileName: file.name,
        mime: file.mime,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    },
  });
  const active = isExportActive(item.status);
  return (
    <View style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`export-${item.id}`}>
      <View style={styles.itemTop}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t(`memories.export.kinds.${item.kind}`)}</AppText>
          <AppText variant="caption" color="textMuted">
            {formatDate(new Date(item.createdAt), dateFormat)}
          </AppText>
        </View>
        {active ? <ActivityIndicator color={colors.primary} accessibilityLabel={t(`memories.export.status.${item.status}`)} /> : null}
        <AppText variant="label" color={item.status === 'FAILED' ? 'danger' : 'text'} testID={`export-status-${item.id}`}>
          {t(`memories.export.status.${item.status}`)}
        </AppText>
      </View>
      {item.status === 'READY' ? (
        <>
          {item.expiresAt ? (
            <AppText variant="caption" color="textMuted">
              {t('memories.export.expires', { date: formatDateLong(new Date(item.expiresAt), locale) })}
            </AppText>
          ) : null}
          <AppButton label={t('memories.export.download')} onPress={() => download.mutate()} loading={download.isPending} disabled={offline} testID={`export-download-${item.id}`} />
        </>
      ) : null}
      {item.status === 'FAILED' ? <AppText color="textMuted">{t('memories.export.failedHint')}</AppText> : null}
      {download.error ? <FormMessage text={errorText(download.error)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { borderWidth: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xs },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
