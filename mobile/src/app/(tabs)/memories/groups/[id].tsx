import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import {
  deleteGroup,
  groupKey,
  GROUPS_KEY,
  MEMORIES_KEY,
  type MemoryGroupDetail,
  removeFromGroup,
  renameGroup,
  useMemoryGroup,
} from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { MemoryCard } from '@/components/memories/MemoryCard';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { GROUP_NAME_MAX } from '@/memories/editorModel';
import { spacing } from '@/theme/tokens';

/**
 * S-35 Цомгийн дэлгэрэнгүй (FR-5.7, AC-81): доторх дурсамжууд, нэр солих, цомгоос хасах,
 * цомгийг устгах — устгахад дурсамжууд хэвээр үлдэхийг баталгаажуулалтад хэлнэ.
 */
export default function MemoryGroupScreen() {
  const t = useT();
  const errorText = useErrorText();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useMemoryGroup(id);

  if (group.isPending) {
    return (
      <StackScreen title={t('memories.groups.title')} testID="screen-S-35-detail">
        <ScreenState kind="loading" rows={3} />
      </StackScreen>
    );
  }
  if (!group.data) {
    return (
      <StackScreen title={t('memories.groups.title')} testID="screen-S-35-detail">
        <ScreenState kind="error" message={errorText(group.error)} onRetry={() => void group.refetch()} />
      </StackScreen>
    );
  }
  return (
    <StackScreen title={group.data.name} testID="screen-S-35-detail">
      <GroupDetail group={group.data} />
    </StackScreen>
  );
}

function GroupDetail({ group }: { group: MemoryGroupDetail }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(group.name);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: groupKey(group.id) });
    void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
  };
  const rename = useMutation({
    mutationFn: () => renameGroup(group.id, name.trim(), group.version),
    onSuccess: () => {
      setRenaming(false);
      refresh();
    },
    onError: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteGroup(group.id),
    onSuccess: () => {
      setDeleting(false);
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      void queryClient.invalidateQueries({ queryKey: MEMORIES_KEY });
      queryClient.removeQueries({ queryKey: groupKey(group.id) });
      if (router.canGoBack()) router.back();
      else router.replace('/memories/groups');
    },
  });
  const takeOut = useMutation({
    mutationFn: (memoryId: string) => removeFromGroup(group.id, memoryId),
    onSuccess: refresh,
  });

  return (
    <FlatList
      data={group.memories}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      testID="group-memories"
      ListHeaderComponent={
        <View style={styles.header}>
          <AppText color="textMuted" testID="group-count">
            {t('memories.count', { count: group.count })}
          </AppText>
          <View style={styles.actions}>
            <AppButton
              variant="secondary"
              label={t('memories.groups.rename')}
              onPress={() => {
                setName(group.name);
                rename.reset();
                setRenaming(true);
              }}
              disabled={offline}
              testID="group-rename"
            />
            <AppButton variant="secondary" label={t('memories.groups.delete')} onPress={() => setDeleting(true)} disabled={offline} testID="group-delete" />
          </View>
          {takeOut.error ? <FormMessage text={errorText(takeOut.error)} /> : null}
        </View>
      }
      ListEmptyComponent={
        <ScreenState kind="empty" text={t('memories.groups.emptyGroup')} actionLabel={t('memories.capture')} onAction={() => router.push('/memory-editor')} />
      }
      renderItem={({ item }) => (
        <View style={styles.item}>
          <MemoryCard memory={item} />
          <AppButton
            variant="ghost"
            label={t('memories.groups.takeOut')}
            onPress={() => takeOut.mutate(item.id)}
            disabled={offline || takeOut.isPending}
            testID={`group-take-out-${item.id}`}
          />
        </View>
      )}
      ListFooterComponent={
        <>
          <ConfirmSheet
            visible={renaming}
            title={t('memories.groups.rename')}
            confirmLabel={t('common.save')}
            onConfirm={() => {
              if (name.trim()) rename.mutate();
            }}
            onCancel={() => setRenaming(false)}
            loading={rename.isPending}
            testID="group-rename-sheet"
          >
            <TextField
              label={t('memories.groups.newLabel')}
              value={name}
              onChangeText={(v) => setName(v.slice(0, GROUP_NAME_MAX))}
              maxLength={GROUP_NAME_MAX}
              autoFocus
              testID="group-rename-name"
            />
            {rename.error ? <FormMessage text={errorText(rename.error)} /> : null}
          </ConfirmSheet>
          <ConfirmSheet
            visible={deleting}
            title={t('memories.groups.deleteTitle', { name: group.name })}
            body={t('memories.groups.deleteBody', { count: group.count })}
            confirmLabel={t('memories.groups.delete')}
            onConfirm={() => remove.mutate()}
            onCancel={() => setDeleting(false)}
            loading={remove.isPending}
            testID="group-delete-confirm"
          >
            {remove.error ? <FormMessage text={errorText(remove.error)} /> : null}
          </ConfirmSheet>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { gap: spacing.sm, paddingBottom: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  item: { gap: spacing.xxs },
});
