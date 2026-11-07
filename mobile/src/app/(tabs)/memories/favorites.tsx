import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { useMemoriesInfinite } from '@/api/queries/memories';
import { MemoryTile } from '@/components/memories/MemoryCard';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { playHaptic } from '@/motion/haptics';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

const COLUMNS = 3;
const FILTERS = { favorite: true } as const;

/**
 * S-36 Дуртай (FR-5.10, AC-83): миний дуртай болгосон дурсамжуудын сүлжээ. Дуртай нь хүн
 * тус бүрийнх — хамтрагчийн жагсаалтад нөлөөлөхгүй.
 */
export default function FavoritesScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const list = useMemoriesInfinite(FILTERS);
  const [width, setWidth] = useState(0);
  const size = width > 0 ? Math.floor((width - spacing.screen * 2 - spacing.xs * (COLUMNS - 1)) / COLUMNS) : 0;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  let body;
  if (list.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (list.isError && items.length === 0) body = <ScreenState kind="error" message={errorText(list.error)} onRetry={() => void list.refetch()} />;
  else if (items.length === 0) {
    const empty = emptyStateText('S-36', locale);
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/memories')} />;
  } else if (size > 0) {
    body = (
      <FlatList
        data={items}
        numColumns={COLUMNS}
        keyExtractor={(m) => m.id}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.grid}
        testID="favorites-grid"
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => {
              playHaptic('ANIM-09');
              void list.refetch();
            }}
          />
        }
        renderItem={({ item }) => <MemoryTile memory={item} size={size} />}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.footer} /> : undefined}
      />
    );
  }

  return (
    <StackScreen title={t('memories.favorites.title')} testID="screen-S-36">
      <View style={styles.fill} onLayout={(e) => setWidth(Math.min(e.nativeEvent.layout.width, 720))}>
        {body}
      </View>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  grid: { padding: spacing.screen, gap: spacing.sm },
  columns: { gap: spacing.xs },
  footer: { padding: spacing.md },
});
