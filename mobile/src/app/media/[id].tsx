import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Download, X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type MemoryMediaItem, useMemory } from '@/api/queries/memories';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { MediaStatus } from '@/components/memories/MediaCarousel';
import { MemoryVideo } from '@/components/memories/MemoryVideo';
import { ZoomableImage } from '@/components/memories/ZoomableImage';
import { ScreenState } from '@/components/ScreenState';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { saveFile } from '@/media/saveFile';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4' };

/** Хадгалах файлын нэр: эх нэр, үгүй бол «aura-2026-11-07-2.jpg». */
function mediaFileName(item: MemoryMediaItem, occurredOn: string, index: number): string {
  if (item.media.fileName) return item.media.fileName;
  const ext = EXT[item.media.mime] ?? item.media.mime.split('/')[1] ?? 'bin';
  return `aura-${occurredOn}-${index + 1}.${ext}`;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/memories');
}

/**
 * S-33 Медиа үзэгч (`fullScreenModal`, `/media/{memoryId}?index=`): зургийг томруулж
 * (pinch, хоёр товшилт), видеог тоглуулна; хажуу тийш гүйлгэж солино. «Хадгалах» — native-д
 * хуваалцах цонхоор (зургийн сан, Files), вэбд татах холбоос.
 */
export default function MediaViewerScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const memory = useMemory(id);
  const { width, height } = useWindowDimensions();
  const items = memory.data?.media ?? [];
  const initial = Math.min(Math.max(Number(index) || 0, 0), Math.max(items.length - 1, 0));
  const [page, setPage] = useState(initial);
  const [zoomed, setZoomed] = useState(false);
  const current = items[page];
  const stageHeight = Math.max(200, height - 2 * (touchTarget + spacing.lg) - 64);

  const save = useMutation({
    mutationFn: (item: MemoryMediaItem) =>
      saveFile({ url: item.media.urls.original, fileName: mediaFileName(item, memory.data?.occurredOn ?? 'memory', page), mime: item.media.mime }),
  });

  let body;
  if (memory.isPending) body = <ScreenState kind="loading" rows={1} />;
  else if (!memory.data) body = <ScreenState kind="error" message={errorText(memory.error)} onRetry={() => void memory.refetch()} />;
  else {
    const title = memory.data.title;
    body = (
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        initialScrollIndex={initial}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => m.media.id}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => {
          const alt = item.altText || t('memories.media.alt', { title, index: i + 1, total: items.length });
          return (
            <View style={[styles.page, { width, height: stageHeight }]} testID={`viewer-item-${i}`}>
              {item.media.status !== 'READY' ? (
                <MediaStatus item={item} height={stageHeight} />
              ) : item.media.kind === 'VIDEO' ? (
                <MemoryVideo media={item.media} label={alt} style={{ width, height: stageHeight }} />
              ) : (
                <ZoomableImage media={item.media} alt={alt} width={width} height={stageHeight} onZoomChange={setZoomed} />
              )}
            </View>
          );
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} testID="screen-S-33">
      <View style={styles.bar}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.icon} testID="viewer-close">
          <X size={26} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
        <AppText variant="label" style={styles.counter} testID="viewer-position">
          {items.length > 0 ? t('memories.media.position', { index: page + 1, total: items.length }) : ''}
        </AppText>
        <Pressable
          onPress={() => current && save.mutate(current)}
          disabled={!current || current.media.status !== 'READY' || save.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('memories.media.save')}
          accessibilityState={{ disabled: !current || current.media.status !== 'READY', busy: save.isPending }}
          style={[styles.icon, { opacity: current?.media.status === 'READY' ? 1 : 0.5 }]}
          testID="viewer-save"
        >
          <Download size={24} color={colors.text} strokeWidth={iconStroke} />
        </Pressable>
      </View>
      <View style={styles.stage}>{body}</View>
      <View style={styles.caption}>
        {current?.altText ? (
          <AppText color="textMuted" numberOfLines={3} testID="viewer-alt">
            {current.altText}
          </AppText>
        ) : null}
        {save.isSuccess ? <FormMessage kind="success" text={t('memories.media.saved')} testID="viewer-saved" /> : null}
        {save.error ? <FormMessage text={errorText(save.error)} testID="viewer-save-error" /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, gap: spacing.xs },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  counter: { flex: 1, textAlign: 'center' },
  stage: { flex: 1, justifyContent: 'center' },
  page: { alignItems: 'center', justifyContent: 'center' },
  caption: { padding: spacing.screen, gap: spacing.xs, minHeight: 64 },
});
