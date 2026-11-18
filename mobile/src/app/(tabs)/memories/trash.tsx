import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { invalidateMemoryLists, purgeMemory, restoreMemory, TRASH_KEY, type TrashEntry, trashDaysLeft, useTrash } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { MemoryCover } from '@/components/memories/MemoryCover';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useNow } from '@/hooks/useNow';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDateLong, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/**
 * S-37 Хогийн сав (FR-5.5, AC-23, AC-174): устгасан дурсамж бүрийн үлдсэн хоног, «Сэргээх»
 * (сэтгэгдэл, реакцтайгаа буцна) ба баталгаажуулалттай «Бүрмөсөн устгах».
 */
export default function TrashScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const trash = useTrash();
  const now = useNow(60_000);
  const [purging, setPurging] = useState<TrashEntry | null>(null);
  const [restored, setRestored] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
    invalidateMemoryLists(queryClient);
  };
  const restore = useMutation({
    mutationFn: (entry: TrashEntry) => restoreMemory(entry.memoryId),
    onSuccess: (memory) => {
      setRestored(memory.title);
      refresh();
    },
  });
  const purge = useMutation({
    mutationFn: (entry: TrashEntry) => purgeMemory(entry.memoryId),
    onSuccess: () => {
      setPurging(null);
      refresh();
    },
  });

  let body;
  if (trash.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (!trash.data) body = <ScreenState kind="error" message={errorText(trash.error)} onRetry={() => void trash.refetch()} />;
  else if (trash.data.length === 0) {
    const empty = emptyStateText('S-37', locale);
    body = (
      <>
        {restored ? <FormMessage kind="success" text={t('memories.trash.restored', { title: restored })} testID="trash-restored" /> : null}
        <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.replace('/memories')} />
      </>
    );
  } else {
    body = (
      <FlatList
        data={trash.data}
        keyExtractor={(e) => e.memoryId}
        contentContainerStyle={styles.list}
        testID="trash-list"
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText color="textMuted">{t('memories.trash.note')}</AppText>
            {restored ? <FormMessage kind="success" text={t('memories.trash.restored', { title: restored })} testID="trash-restored" /> : null}
            {restore.error ? <FormMessage text={errorText(restore.error)} testID="trash-error" /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <TrashRow
            entry={item}
            daysLeft={trashDaysLeft(item, now)}
            busy={restore.isPending || purge.isPending}
            offline={offline}
            onRestore={() => restore.mutate(item)}
            onPurge={() => {
              purge.reset();
              setPurging(item);
            }}
          />
        )}
      />
    );
  }

  return (
    <StackScreen title={t('memories.trash.title')} testID="screen-S-37">
      {body}
      <ConfirmSheet
        visible={!!purging}
        title={t('memories.trash.purgeTitle')}
        body={t('memories.trash.purgeBody', { title: purging?.memory?.title ?? '' })}
        confirmLabel={t('memories.trash.purge')}
        onConfirm={() => purging && purge.mutate(purging)}
        onCancel={() => setPurging(null)}
        loading={purge.isPending}
        testID="trash-purge-confirm"
      >
        {purge.error ? <FormMessage text={errorText(purge.error)} /> : null}
      </ConfirmSheet>
    </StackScreen>
  );
}

function TrashRow({
  entry,
  daysLeft,
  busy,
  offline,
  onRestore,
  onPurge,
}: {
  entry: TrashEntry;
  daysLeft: number;
  busy: boolean;
  offline: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const memory = entry.memory;
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`trash-${entry.memoryId}`}>
      <View style={styles.top}>
        <MemoryCover media={memory?.cover} size="sm" style={styles.cover} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {memory?.title ?? t('memories.detail.title')}
          </AppText>
          {memory ? (
            <AppText variant="caption" color="textMuted">
              {formatDateLong(memory.occurredOn, locale)}
            </AppText>
          ) : null}
          <AppText variant="caption" color={daysLeft <= 3 ? 'danger' : 'textMuted'} testID={`trash-days-${entry.memoryId}`}>
            {daysLeft === 0 ? t('memories.trash.today') : t('memories.trash.daysLeft', { count: daysLeft })}
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <AppButton variant="ghost" label={t('memories.trash.purge')} onPress={onPurge} disabled={offline || busy} testID={`trash-purge-${entry.memoryId}`} />
        <AppButton label={t('memories.trash.restore')} onPress={onRestore} disabled={offline || busy} testID={`trash-restore-${entry.memoryId}`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { gap: spacing.xs, paddingBottom: spacing.xs },
  row: { borderWidth: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xs },
  top: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  cover: { width: 64, height: 64, borderRadius: radius.input, overflow: 'hidden' },
  flex: { flex: 1, gap: spacing.xxs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs, flexWrap: 'wrap' },
});
