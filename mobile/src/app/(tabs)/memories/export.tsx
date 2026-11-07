import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FolderArchive } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import {
  type DataExport,
  type ExportKind,
  type ExportRequest,
  exportDownloadPath,
  exportRequest,
  type ExportScope,
  EXPORTS_KEY,
  isExportActive,
  isExportBusy,
  startExport,
  useExports,
} from '@/api/queries/exports';
import { useMemoryGroups } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { API_BASE } from '@/config';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
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

/**
 * S-39 Экспорт (FR-5.12, FR-14.5, AC-126): PDF ном эсвэл зургийн цомог (ZIP), хүрээ — бүгд,
 * цомог эсвэл огнооны хооронд. Нэг зэрэг нэг (429 → «Нэг экспорт бэлтгэгдэж байна»),
 * бэлтгэгдэж байхад жагсаалт тогтмол шинэчлэгдэнэ; бэлэн бол татах/хуваалцах. Offline-д идэвхгүй.
 */
export default function ExportScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const { disabled: offline } = useOnlineOnly();
  const groups = useMemoryGroups();
  const exportsQuery = useExports();
  const [kind, setKind] = useState<ExportKind>('BOOK_PDF');
  const [scope, setScope] = useState<ExportScope>('all');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const request = exportRequest(kind, scope, { groupId, from, to }, locale);

  const start = useMutation({
    mutationFn: (body: ExportRequest) => startExport(body),
    onSuccess: (created) => {
      queryClient.setQueryData<DataExport[]>(EXPORTS_KEY, (list) => [created, ...(list ?? []).filter((e) => e.id !== created.id)]);
      void queryClient.invalidateQueries({ queryKey: EXPORTS_KEY });
    },
  });
  const busy = isExportBusy(start.error) || (exportsQuery.data ?? []).some((e) => isExportActive(e.status));

  return (
    <StackScreen title={t('memories.export.title')} testID="screen-S-39">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {offline ? <FormMessage kind="info" text={t('memories.export.offline')} testID="export-offline" /> : null}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="h3" accessibilityRole="header">
            {t('memories.export.kind')}
          </AppText>
          <ChipRow wrap>
            <Chip icon={BookOpen} label={t('memories.export.kinds.BOOK_PDF')} selected={kind === 'BOOK_PDF'} onPress={() => setKind('BOOK_PDF')} testID="export-kind-pdf" />
            <Chip icon={FolderArchive} label={t('memories.export.kinds.ALBUM_ZIP')} selected={kind === 'ALBUM_ZIP'} onPress={() => setKind('ALBUM_ZIP')} testID="export-kind-zip" />
          </ChipRow>
          <AppText variant="caption" color="textMuted">
            {kind === 'BOOK_PDF' ? t('memories.export.pdfNote') : t('memories.export.zipNote')}
          </AppText>
          <AppText variant="h3" accessibilityRole="header">
            {t('memories.export.scope')}
          </AppText>
          <ChipRow wrap>
            <Chip label={t('memories.export.scopes.all')} selected={scope === 'all'} onPress={() => setScope('all')} testID="export-scope-all" />
            <Chip label={t('memories.export.scopes.group')} selected={scope === 'group'} onPress={() => setScope('group')} testID="export-scope-group" />
            <Chip label={t('memories.export.scopes.range')} selected={scope === 'range'} onPress={() => setScope('range')} testID="export-scope-range" />
          </ChipRow>
          {scope === 'group' ? (
            groups.data && groups.data.length > 0 ? (
              <ChipRow wrap testID="export-groups">
                {groups.data.map((g) => (
                  <Chip key={g.id} label={g.name} selected={groupId === g.id} onPress={() => setGroupId(g.id)} testID={`export-group-${g.id}`} />
                ))}
              </ChipRow>
            ) : (
              <AppText color="textMuted">{t('memories.export.noGroups')}</AppText>
            )
          ) : null}
          {scope === 'range' ? (
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField label={t('memories.search.from')} placeholder={t('memories.editor.datePlaceholder')} value={from} onChangeText={setFrom} maxLength={10} testID="export-from" />
              </View>
              <View style={styles.flex}>
                <TextField label={t('memories.search.to')} placeholder={t('memories.editor.datePlaceholder')} value={to} onChangeText={setTo} maxLength={10} testID="export-to" />
              </View>
            </View>
          ) : null}
          <AppButton
            label={t('memories.export.start')}
            onPress={() => request && start.mutate(request)}
            disabled={offline || !request}
            loading={start.isPending}
            testID="export-start"
          />
          {start.isSuccess ? <FormMessage kind="success" text={t('memories.export.started')} testID="export-started" /> : null}
          {busy && !start.isSuccess ? <FormMessage kind="info" text={t('memories.export.busy')} testID="export-busy" /> : null}
          {start.error && !isExportBusy(start.error) ? <FormMessage text={errorText(start.error)} testID="export-error" /> : null}
        </View>

        <AppText variant="h3" accessibilityRole="header">
          {t('memories.export.history')}
        </AppText>
        {exportsQuery.isPending ? (
          <ScreenState kind="loading" rows={2} />
        ) : !exportsQuery.data ? (
          <ScreenState kind="error" message={errorText(exportsQuery.error)} onRetry={() => void exportsQuery.refetch()} />
        ) : exportsQuery.data.length === 0 ? (
          <AppText color="textMuted" testID="export-none">
            {t('memories.export.none')}
          </AppText>
        ) : (
          exportsQuery.data.map((e) => <ExportRow key={e.id} item={e} offline={offline} />)
        )}
      </ScrollView>
    </StackScreen>
  );
}

function ExportRow({ item, offline }: { item: DataExport; offline: boolean }) {
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
  scroll: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  item: { borderWidth: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xs },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
