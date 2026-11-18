import { router } from 'expo-router';
import { Heart, Lock, MapPin, MessageCircle } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useDisplayUser } from '@/api/queries/couple';
import type { MemorySummary } from '@/api/queries/memories';
import { AppText } from '@/components/AppText';
import { UserAvatar } from '@/components/UserAvatar';
import { mediaThumb } from '@/api/queries/pairing';
import { formatDateLong, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

import { MemoryCover } from './MemoryCover';

/** Карт/тайлны дэлгэц уншигчийн шошго: гарчиг, огноо, газар, хувийн/илгээгдэж буй төлөв. */
export function useMemoryLabel() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const display = useDisplayUser();
  return (m: MemorySummary) =>
    [
      m.title,
      formatDateLong(m.occurredOn, locale),
      m.location?.name,
      t('memories.card.by', { name: display(m.author).name }),
      m.visibility === 'PRIVATE' ? t('memories.card.private') : null,
      m.status === 'UPLOADING' ? t('memories.card.uploading') : null,
      m.favorite ? t('memories.card.favorite') : null,
      m.commentCount > 0 ? t('memories.card.comments', { count: m.commentCount }) : null,
    ]
      .filter(Boolean)
      .join(', ');
}

/**
 * S-30 timeline-ийн карт: нүүр зураг (blurhash), гарчиг, огноо, газар, нэмсэн хүн,
 * сэтгэгдлийн тоо, дуртай, «Хувийн» тэмдэг (R-4), «Илгээгдэж байна» төлөв.
 */
export function MemoryCard({ memory }: { memory: MemorySummary }) {
  const t = useT();
  // Хамтрагч бол миний өгсөн хоч, зураг (AC-137)
  const author = useDisplayUser()(memory.author);
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const label = useMemoryLabel();
  const uploading = memory.status === 'UPLOADING';
  return (
    <Pressable
      onPress={() => router.push(`/memories/${memory.id}`)}
      accessibilityRole="button"
      accessibilityLabel={label(memory)}
      testID={`memory-card-${memory.id}`}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.coverBox}>
        <MemoryCover media={memory.cover} style={styles.cover} />
        <View style={styles.badges}>
          {memory.visibility === 'PRIVATE' ? (
            <View style={[styles.badge, { backgroundColor: colors.surface }]} testID="memory-card-private">
              <Lock size={14} color={colors.text} strokeWidth={iconStroke} />
              <AppText variant="caption">{t('memories.card.private')}</AppText>
            </View>
          ) : null}
          {uploading ? (
            <View style={[styles.badge, { backgroundColor: colors.surface }]} testID="memory-card-uploading">
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText variant="caption">{t('memories.card.uploading')}</AppText>
            </View>
          ) : null}
        </View>
        {memory.mediaCount > 1 ? (
          <View style={[styles.count, { backgroundColor: colors.surface }]}>
            <AppText variant="caption">{`+${memory.mediaCount - 1}`}</AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <AppText variant="h3" numberOfLines={2}>
          {memory.title}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {formatDateLong(memory.occurredOn, locale)}
        </AppText>
        {memory.location ? (
          <View style={styles.row}>
            <MapPin size={14} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.flex}>
              {memory.location.name}
            </AppText>
          </View>
        ) : null}
        <View style={styles.footer}>
          <UserAvatar uri={mediaThumb(author.avatar)} label={t('memories.card.by', { name: author.name })} size={28} />
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.flex}>
            {author.name}
          </AppText>
          <View style={styles.row}>
            <MessageCircle size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText variant="caption" color="textMuted">
              {String(memory.commentCount)}
            </AppText>
          </View>
          {memory.favorite ? (
            <View testID="memory-card-favorite">
              <Heart size={18} color={colors.primary} fill={colors.primary} strokeWidth={iconStroke} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Сүлжээн (дуртай, цомог) жижиг тайл. */
export function MemoryTile({ memory, size }: { memory: MemorySummary; size: number }) {
  const colors = useColors();
  const label = useMemoryLabel();
  return (
    <Pressable
      onPress={() => router.push(`/memories/${memory.id}`)}
      accessibilityRole="button"
      accessibilityLabel={label(memory)}
      testID={`memory-tile-${memory.id}`}
      style={({ pressed }) => [styles.tile, { width: size, opacity: pressed ? 0.85 : 1 }]}
    >
      <MemoryCover media={memory.cover} size="sm" style={{ ...styles.tileCover, width: size, height: size, borderColor: colors.border }} />
      <AppText variant="caption" numberOfLines={1}>
        {memory.title}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: radius.card, overflow: 'hidden', minHeight: touchTarget },
  coverBox: { width: '100%', aspectRatio: 4 / 3 },
  cover: { width: '100%', height: '100%' },
  badges: { position: 'absolute', top: spacing.xs, left: spacing.xs, gap: spacing.xxs },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.pill },
  count: { position: 'absolute', bottom: spacing.xs, right: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.pill },
  body: { padding: spacing.md, gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  flex: { flex: 1 },
  tile: { gap: spacing.xxs, minHeight: touchTarget },
  tileCover: { borderRadius: radius.input, overflow: 'hidden', borderWidth: 1 },
});
