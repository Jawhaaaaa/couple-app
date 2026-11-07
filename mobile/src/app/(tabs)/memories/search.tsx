import { useLocalSearchParams } from 'expo-router';
import { type ReactElement, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { hasActiveFilters, type MemoryFilters, searchFilters, useMemoriesInfinite, useMemoryGroups, useMemoryTags } from '@/api/queries/memories';
import { partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { MemoryCard } from '@/components/memories/MemoryCard';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { emptyStateText } from '@/content/emptyStates';
import { useDebounced } from '@/hooks/useDebounced';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

const SEARCH_DEBOUNCE_MS = 350;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * S-34 Хайлт (FR-5.8, AC-175): текст, огнооны хүрээ, шошго, цомог, газар, хэн нэмсэн,
 * дуртай — нэг нэгээр ба хослуулан. Сервер хайдаг тул offline-д идэвхгүй, шалтгааныг хэлнэ.
 */
export default function MemorySearchScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const params = useLocalSearchParams<{ q?: string; tag?: string; place?: string; groupId?: string }>();
  const { disabled: offline } = useOnlineOnly();
  const [form, setForm] = useState<MemoryFilters>(() => ({
    q: first(params.q),
    tag: first(params.tag),
    place: first(params.place),
    groupId: first(params.groupId),
  }));
  const filters = useDebounced(useMemo(() => searchFilters(form), [form]), SEARCH_DEBOUNCE_MS);
  const active = hasActiveFilters(filters);
  const list = useMemoriesInfinite(filters, { enabled: active && !offline });
  const tags = useMemoryTags();
  const groups = useMemoryGroups();
  const couple = useCoupleQuery();
  const partner = partnerName(couple.data);

  const set = (patch: Partial<MemoryFilters>) => setForm((f) => ({ ...f, ...patch }));
  const clear = () => setForm({});
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const header = (
    <View style={styles.form} testID="search-form">
      {offline ? <FormMessage kind="info" text={t('memories.search.offline')} testID="search-offline" /> : null}
      <TextField
        label={t('memories.search.q')}
        placeholder={t('memories.search.placeholder')}
        value={form.q ?? ''}
        onChangeText={(q) => set({ q })}
        editable={!offline}
        returnKeyType="search"
        testID="search-q"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('memories.search.from')}
            placeholder={t('memories.editor.datePlaceholder')}
            value={form.from ?? ''}
            onChangeText={(from) => set({ from })}
            editable={!offline}
            maxLength={10}
            testID="search-from"
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={t('memories.search.to')}
            placeholder={t('memories.editor.datePlaceholder')}
            value={form.to ?? ''}
            onChangeText={(to) => set({ to })}
            editable={!offline}
            maxLength={10}
            testID="search-to"
          />
        </View>
      </View>
      <TextField
        label={t('memories.search.place')}
        placeholder={t('memories.editor.placePlaceholder')}
        value={form.place ?? ''}
        onChangeText={(place) => set({ place })}
        editable={!offline}
        testID="search-place"
      />
      <AppText variant="label" color="textMuted">
        {t('memories.search.author')}
      </AppText>
      <ChipRow>
        <Chip label={t('memories.search.anyone')} selected={!form.author} onPress={() => set({ author: undefined })} disabled={offline} testID="search-author-any" />
        <Chip label={t('memories.search.me')} selected={form.author === 'me'} onPress={() => set({ author: 'me' })} disabled={offline} testID="search-author-me" />
        <Chip
          label={partner ?? t('home.partnerFallback')}
          selected={form.author === 'partner'}
          onPress={() => set({ author: 'partner' })}
          disabled={offline}
          testID="search-author-partner"
        />
        <Chip label={t('memories.filters.favorite')} selected={!!form.favorite} onPress={() => set({ favorite: !form.favorite })} disabled={offline} testID="search-favorite" />
      </ChipRow>
      {tags.data && tags.data.length > 0 ? (
        <>
          <AppText variant="label" color="textMuted">
            {t('memories.search.tag')}
          </AppText>
          <ChipRow testID="search-tags">
            {tags.data.map((tag) => (
              <Chip key={tag} label={tag} selected={form.tag === tag} onPress={() => set({ tag: form.tag === tag ? undefined : tag })} disabled={offline} testID={`search-tag-${tag}`} />
            ))}
          </ChipRow>
        </>
      ) : null}
      {groups.data && groups.data.length > 0 ? (
        <>
          <AppText variant="label" color="textMuted">
            {t('memories.search.group')}
          </AppText>
          <ChipRow testID="search-groups">
            {groups.data.map((g) => (
              <Chip
                key={g.id}
                label={g.name}
                selected={form.groupId === g.id}
                onPress={() => set({ groupId: form.groupId === g.id ? undefined : g.id })}
                disabled={offline}
                testID={`search-group-${g.id}`}
              />
            ))}
          </ChipRow>
        </>
      ) : null}
      {hasActiveFilters(form) ? <AppButton variant="ghost" label={t('memories.search.clear')} onPress={clear} testID="search-clear" /> : null}
    </View>
  );

  let empty: ReactElement | undefined;
  if (!active || offline) {
    empty = (
      <AppText color="textMuted" style={styles.hint} testID="search-hint">
        {t('memories.search.hint')}
      </AppText>
    );
  } else if (list.isPending) empty = <ScreenState kind="loading" rows={2} />;
  else if (list.isError && items.length === 0) empty = <ScreenState kind="error" message={errorText(list.error)} onRetry={() => void list.refetch()} />;
  else if (items.length === 0) {
    const text = emptyStateText('S-34', locale);
    empty = <ScreenState kind="empty" text={text.text} actionLabel={text.action} onAction={clear} />;
  }

  return (
    <StackScreen title={t('memories.search.title')} testID="screen-S-34">
      <FlatList
        data={active && !offline ? items : []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item }) => <MemoryCard memory={item} />}
        testID="search-results"
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.footer} /> : undefined}
      />
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  form: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  hint: { textAlign: 'center', padding: spacing.lg },
  footer: { padding: spacing.md },
});
