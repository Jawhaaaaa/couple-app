import { router } from 'expo-router';
import { CircleAlert, Maximize2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { MemoryMediaItem } from '@/api/queries/memories';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

import { MemoryCover } from './MemoryCover';
import { MemoryVideo } from './MemoryVideo';

/** Боловсруулж буй / бүтэлгүйтсэн медиагийн орлуулга (`PROCESSING` → «Боловсруулж байна»). */
export function MediaStatus({ item, height }: { item: MemoryMediaItem; height: number }) {
  const t = useT();
  const colors = useColors();
  const failed = item.media.status === 'FAILED';
  return (
    <View style={[styles.status, { height, backgroundColor: colors.surfaceRaised }]} testID={failed ? 'media-failed' : 'media-processing'}>
      {failed ? <CircleAlert size={28} color={colors.danger} strokeWidth={iconStroke} /> : <ActivityIndicator color={colors.primary} />}
      <AppText color="textMuted">{failed ? t('memories.media.failed') : t('memories.media.processing')}</AppText>
    </View>
  );
}

/**
 * S-31-ийн медиа carousel: зураг товшвол S-33 (бүтэн дэлгэц, `?index`), READY видео шууд
 * тоглуулагчтай; боловсруулж буйг тэмдэглэнэ. Зураг бүр alt тайлбартай (NFR-07).
 */
export function MediaCarousel({ memoryId, items, title }: { memoryId: string; items: MemoryMediaItem[]; title: string }) {
  const t = useT();
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const height = Math.max(240, Math.round(width * 0.75));
  const open = (i: number) => router.push(`/media/${memoryId}?index=${i}`);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="media-carousel">
      {width > 0 ? (
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(m) => m.media.id}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => {
            const alt = item.altText || t('memories.media.alt', { title, index: i + 1, total: items.length });
            if (item.media.status !== 'READY') {
              return (
                <View style={{ width }}>
                  <MediaStatus item={item} height={height} />
                </View>
              );
            }
            if (item.media.kind === 'VIDEO') {
              return (
                <View style={{ width, height }}>
                  <MemoryVideo media={item.media} label={alt} style={{ width, height }} testID="media-video" />
                  <Pressable
                    onPress={() => open(i)}
                    accessibilityRole="button"
                    accessibilityLabel={t('memories.media.fullscreen')}
                    style={[styles.expand, { backgroundColor: colors.surface }]}
                    testID="media-expand"
                  >
                    <Maximize2 size={20} color={colors.text} strokeWidth={iconStroke} />
                  </Pressable>
                </View>
              );
            }
            return (
              <Pressable
                onPress={() => open(i)}
                accessibilityRole="imagebutton"
                accessibilityLabel={alt}
                accessibilityHint={t('memories.media.openHint')}
                testID={`media-item-${i}`}
                style={{ width, height }}
              >
                <MemoryCover media={item.media} size="lg" style={{ width, height }} />
              </Pressable>
            );
          }}
        />
      ) : (
        <View style={{ height: 240 }} />
      )}
      {items.length > 1 ? (
        <View style={styles.dots} accessible accessibilityLabel={t('memories.media.position', { index: index + 1, total: items.length })}>
          {items.map((m, i) => (
            <View key={m.media.id} style={[styles.dot, { backgroundColor: i === index ? colors.primary : colors.border }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { width: '100%', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.image },
  expand: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xxs, paddingTop: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
});
