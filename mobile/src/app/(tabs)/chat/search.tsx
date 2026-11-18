import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarSearch } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { searchMessages } from '@/api/queries/chat';
import { splitHighlights } from '@/chat/highlights';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { emptyStateText } from '@/content/emptyStates';
import { useDebounced } from '@/hooks/useDebounced';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDateLong, isCalendarDate, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/**
 * S-43 Чатын хайлт (FR-6.5, AC-89): текстээр — тодруулгатай үр дүн, товшвол чатад контекст рүү;
 * «Огноо руу үсрэх» — тухайн өдрийн эхний мессеж. Хайлт сервер шаардлагатай тул offline-д идэвхгүй.
 */
export default function ChatSearchScreen() {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const { disabled } = useOnlineOnly();
  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const term = useDebounced(q.trim(), 300);
  const results = useInfiniteQuery({
    queryKey: ['messages', 'search', term],
    queryFn: ({ pageParam }) => searchMessages(term, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: term.length > 0 && !disabled,
  });
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const dateValid = isCalendarDate(date);

  const empty = emptyStateText('S-43', locale);
  let body;
  if (!term) body = null;
  else if (results.isLoading) body = <ScreenState kind="loading" rows={4} />;
  else if (results.isError) body = <ScreenState kind="error" onRetry={() => void results.refetch()} />;
  else if (items.length === 0) body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => setQ('')} />;
  else
    body = (
      <FlatList
        data={items}
        keyExtractor={(r) => r.message.id}
        contentContainerStyle={styles.list}
        onEndReached={() => results.hasNextPage && void results.fetchNextPage()}
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : undefined}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/chat', params: { around: item.message.id } })}
            accessibilityRole="button"
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID={`search-result-${item.message.id}`}
          >
            <AppText variant="label" color="textMuted">
              {item.message.sender.displayName} · {formatDateLong(new Date(item.message.createdAt), locale)}
            </AppText>
            <AppText numberOfLines={3}>
              {splitHighlights(item.message.text ?? '', item.highlights).map((part, i) =>
                part.hit ? (
                  <Text key={i} style={{ color: colors.onSecondary, backgroundColor: colors.secondary }} testID="search-highlight">
                    {part.text}
                  </Text>
                ) : (
                  <Text key={i}>{part.text}</Text>
                ),
              )}
            </AppText>
          </Pressable>
        )}
      />
    );

  return (
    <StackScreen title={t('chat.search.title')} testID="screen-S-43">
      <View style={styles.form}>
        <TextField
          label={t('chat.search.label')}
          placeholder={t('chat.search.placeholder')}
          value={q}
          onChangeText={setQ}
          editable={!disabled}
          returnKeyType="search"
          hint={disabled ? t('chat.search.offline') : undefined}
          testID="chat-search-input"
        />
        <View style={styles.jump}>
          <View style={styles.flex}>
            <TextField
              label={t('chat.search.jumpLabel')}
              placeholder="2026-11-07"
              value={date}
              onChangeText={setDate}
              editable={!disabled}
              testID="chat-jump-input"
            />
          </View>
          <AppButton
            label={t('chat.search.jump')}
            variant="secondary"
            disabled={!dateValid || disabled}
            onPress={() => router.push({ pathname: '/chat', params: { date } })}
            testID="chat-jump"
          />
          <CalendarSearch size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        </View>
      </View>
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: spacing.screen, gap: spacing.sm },
  jump: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  flex: { flex: 1 },
  list: { padding: spacing.screen, gap: spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xxs },
});
