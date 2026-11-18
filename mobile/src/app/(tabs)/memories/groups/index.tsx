import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, FolderPlus } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { createGroup, GROUPS_KEY, useMemoryGroups } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { MemoryCover } from '@/components/memories/MemoryCover';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { GROUP_NAME_MAX } from '@/memories/editorModel';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** S-35 Цомгууд (FR-5.7): жагсаалт (нүүр зураг, нэр, тоо), шинэ цомог үүсгэх → S-35 дэлгэрэнгүй. */
export default function MemoryGroupsScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const groups = useMemoryGroups();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => createGroup(name.trim()),
    onSuccess: (group) => {
      setCreating(false);
      setName('');
      void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      router.push(`/memories/groups/${group.id}`);
    },
  });
  const openCreate = () => {
    create.reset();
    setCreating(true);
  };

  let body;
  if (groups.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (!groups.data) body = <ScreenState kind="error" message={errorText(groups.error)} onRetry={() => void groups.refetch()} />;
  else if (groups.data.length === 0) {
    const empty = emptyStateText('S-35', locale);
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={openCreate} />;
  } else {
    body = (
      <FlatList
        data={groups.data}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        testID="groups-list"
        ListHeaderComponent={
          <AppButton variant="secondary" label={t('memories.groups.new')} onPress={openCreate} disabled={offline} testID="groups-new" />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/memories/groups/${item.id}`)}
            accessibilityRole="link"
            accessibilityLabel={`${item.name}, ${t('memories.count', { count: item.count })}`}
            testID={`group-${item.id}`}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <MemoryCover media={item.cover} size="sm" style={styles.cover} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{item.name}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('memories.count', { count: item.count })}
              </AppText>
            </View>
            <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
          </Pressable>
        )}
      />
    );
  }

  return (
    <StackScreen title={t('memories.groups.title')} testID="screen-S-35">
      {body}
      <ConfirmSheet
        visible={creating}
        title={t('memories.groups.new')}
        confirmLabel={t('memories.groups.create')}
        onConfirm={() => {
          if (name.trim() && !offline) create.mutate();
        }}
        onCancel={() => setCreating(false)}
        loading={create.isPending}
        testID="groups-create"
      >
        <View style={styles.sheetRow}>
          <FolderPlus size={20} color={colors.primary} strokeWidth={iconStroke} />
          <View style={styles.flex}>
            <TextField
              label={t('memories.groups.newLabel')}
              placeholder={t('memories.groups.newPlaceholder')}
              value={name}
              onChangeText={(v) => setName(v.slice(0, GROUP_NAME_MAX))}
              maxLength={GROUP_NAME_MAX}
              autoFocus
              testID="groups-create-name"
            />
          </View>
        </View>
        {offline ? <FormMessage kind="info" text={t('memories.groups.offline')} /> : null}
        {create.error ? <FormMessage text={errorText(create.error)} /> : null}
      </ConfirmSheet>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: {
    minHeight: touchTarget + spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.input,
    borderWidth: 1,
  },
  cover: { width: 56, height: 56, borderRadius: radius.input, overflow: 'hidden' },
  flex: { flex: 1 },
  sheetRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
});
