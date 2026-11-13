import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FileText, Link2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { type ChatMediaKind, listChatMedia, type Message } from '@/api/queries/chat';
import { firstLink } from '@/chat/highlights';
import { AppText } from '@/components/AppText';
import { VoiceMessagePlayer } from '@/components/chat/VoiceMessagePlayer';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { formatDateLong, formatNumber, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

const COLUMNS = 3;

/** S-44 Медиа ба файлууд (FR-6.5): зураг (grid), файл, дуу, холбоос — табаар, хуучин рүү хуудаслана. */
export default function ChatMediaScreen() {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const me = useSessionStore((s) => s.userId);
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<ChatMediaKind>('IMAGE');
  const query = useInfiniteQuery({
    queryKey: ['messages', 'media', kind],
    queryFn: ({ pageParam }) => listChatMedia(kind, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const tile = Math.floor((Math.min(width, 720) - spacing.screen * 2 - spacing.xxs * (COLUMNS - 1)) / COLUMNS);
  const openContext = (m: Message) => router.push({ pathname: '/chat', params: { around: m.id } });

  const renderItem = ({ item }: { item: Message }) => {
    const meta = `${item.sender.displayName} · ${formatDateLong(new Date(item.createdAt), locale)}`;
    if (kind === 'IMAGE') {
      return (
        <Pressable onPress={() => openContext(item)} accessibilityRole="imagebutton" accessibilityLabel={meta} testID={`media-${item.id}`}>
          <Image
            source={{ uri: item.media?.urls.sm ?? item.media?.urls.original }}
            placeholder={item.media?.blurhash ? { blurhash: item.media.blurhash } : undefined}
            style={{ width: tile, height: tile, borderRadius: radius.input / 2 }}
            contentFit="cover"
          />
        </Pressable>
      );
    }
    if (kind === 'VOICE') {
      return (
        <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`media-${item.id}`}>
          <AppText variant="caption" color="textMuted">
            {meta}
          </AppText>
          <VoiceMessagePlayer message={item} mine={item.sender.id === me} />
        </View>
      );
    }
    const link = kind === 'LINK' ? firstLink(item.text) : null;
    const Icon = kind === 'LINK' ? Link2 : FileText;
    const title = kind === 'LINK' ? (link ?? item.text ?? '') : (item.media?.fileName ?? t('chat.kind.FILE'));
    return (
      <Pressable
        onPress={() => {
          const url = link ?? item.media?.urls.original;
          if (url) void Linking.openURL(url);
        }}
        onLongPress={() => openContext(item)}
        accessibilityRole="link"
        accessibilityHint={t('chat.media.longPressHint')}
        style={[styles.row, styles.rowInline, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID={`media-${item.id}`}
      >
        <Icon size={22} color={colors.primary} strokeWidth={iconStroke} />
        <View style={styles.flex}>
          <AppText numberOfLines={2}>{title}</AppText>
          <AppText variant="caption" color="textMuted">
            {meta}
            {item.media?.sizeBytes ? ` · ${formatNumber(Math.max(1, Math.round(item.media.sizeBytes / 1024)), locale)} KB` : ''}
          </AppText>
        </View>
      </Pressable>
    );
  };

  const empty = emptyStateText('S-44', locale);
  let body;
  if (query.isLoading) body = <ScreenState kind="loading" rows={4} />;
  else if (query.isError) body = <ScreenState kind="error" onRetry={() => void query.refetch()} />;
  else if (items.length === 0) body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.back()} />;
  else
    body = (
      <FlatList
        key={kind === 'IMAGE' ? 'grid' : 'list'}
        data={items}
        numColumns={kind === 'IMAGE' ? COLUMNS : 1}
        columnWrapperStyle={kind === 'IMAGE' ? styles.gridRow : undefined}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onEndReached={() => query.hasNextPage && void query.fetchNextPage()}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : undefined}
        renderItem={renderItem}
        testID="chat-media-list"
      />
    );

  return (
    <StackScreen title={t('chat.media.title')} testID="screen-S-44">
      <View style={styles.tabs}>
        <SegmentedTabs<ChatMediaKind>
          options={[
            { key: 'IMAGE', label: t('chat.media.images') },
            { key: 'FILE', label: t('chat.media.files') },
            { key: 'VOICE', label: t('chat.media.voice') },
            { key: 'LINK', label: t('chat.media.links') },
          ]}
          value={kind}
          onChange={setKind}
          testID="chat-media-tabs"
        />
      </View>
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xs },
  list: { padding: spacing.screen, gap: spacing.xs },
  gridRow: { gap: spacing.xxs },
  row: { borderWidth: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xxs },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
