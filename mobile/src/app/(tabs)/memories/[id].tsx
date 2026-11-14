import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { FolderHeart, Heart, Lock, MapPin, Pencil, Tag, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  deleteMemory,
  type DeletePreview,
  fetchDeletePreview,
  invalidateMemoryLists,
  type Memory,
  MEMORIES_KEY,
  memoryKey,
  patchSummaryInLists,
  setFavorite,
  useMemory,
} from '@/api/queries/memories';
import { displayUser } from '@/api/queries/couple';
import { mediaThumb, partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { CommentsSection } from '@/components/memories/CommentsSection';
import { MediaCarousel } from '@/components/memories/MediaCarousel';
import { PerspectiveCard } from '@/components/memories/PerspectiveCard';
import { ReactionBar } from '@/components/memories/ReactionBar';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { UserAvatar } from '@/components/UserAvatar';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDateLong, possessive, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-31 Дурсамжийн дэлгэрэнгүй (FR-5.4, FR-5.5, FR-5.9, FR-5.10): медиа, гарчиг/огноо/газар/
 * зохиогч, тайлбар, шошго, цомог, хоёр өнцөг (AC-82), реакц (ANIM-07), дуртай, сэтгэгдэл.
 * Засах ба устгах нь зөвхөн зохиогчид (INV-03); устгахын өмнө хамтрагчийн хэдэн сэтгэгдэл
 * хамт явахыг хэлнэ (AC-174) — дараа нь хогийн сав (S-37).
 */
export default function MemoryDetailScreen() {
  const t = useT();
  const errorText = useErrorText();
  const { id } = useLocalSearchParams<{ id: string }>();
  const memory = useMemory(id);

  if (memory.isPending) {
    return (
      <StackScreen title={t('memories.detail.title')} testID="screen-S-31">
        <ScreenState kind="loading" rows={3} />
      </StackScreen>
    );
  }
  if (!memory.data) {
    return (
      <StackScreen title={t('memories.detail.title')} testID="screen-S-31">
        <ScreenState kind="error" message={errorText(memory.error)} onRetry={() => void memory.refetch()} />
      </StackScreen>
    );
  }
  return (
    <StackScreen title={memory.data.title} testID="screen-S-31">
      <MemoryDetail memory={memory.data} />
    </StackScreen>
  );
}

function MemoryDetail({ memory }: { memory: Memory }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const userId = useSessionStore((s) => s.userId);
  const { disabled: offline } = useOnlineOnly();
  const couple = useCoupleQuery();
  const own = memory.author.id === userId;
  const author = displayUser(couple.data, memory.author);
  const [preview, setPreview] = useState<DeletePreview | null>(null);

  const minePerspective = memory.perspectives.find((p) => p.author.id === userId) ?? null;
  const partnerPerspective = memory.perspectives.find((p) => p.author.id !== userId) ?? null;
  const partner = partnerPerspective?.author.displayName ?? partnerName(couple.data) ?? (own ? null : memory.author.displayName);
  const partnerLabel = partner ?? t('home.partnerFallback');
  const favorite = memory.myFavorite ?? memory.favorite;

  const toggleFavorite = useMutation({
    mutationFn: (next: boolean) => setFavorite(memory.id, next),
    onMutate: (next) => {
      queryClient.setQueryData<Memory>(memoryKey(memory.id), (m) => (m ? { ...m, myFavorite: next, favorite: next } : m));
      patchSummaryInLists(queryClient, memory.id, { favorite: next });
    },
    onError: (_e, next) => {
      queryClient.setQueryData<Memory>(memoryKey(memory.id), (m) => (m ? { ...m, myFavorite: !next, favorite: !next } : m));
      patchSummaryInLists(queryClient, memory.id, { favorite: !next });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MEMORIES_KEY }),
  });

  const loadPreview = useMutation({ mutationFn: () => fetchDeletePreview(memory.id), onSuccess: setPreview });
  const remove = useMutation({
    mutationFn: () => deleteMemory(memory.id),
    onSuccess: () => {
      setPreview(null);
      invalidateMemoryLists(queryClient);
      queryClient.removeQueries({ queryKey: memoryKey(memory.id) });
      router.replace('/memories/trash');
    },
  });

  const previewName = preview?.partnerName ?? partnerLabel;
  const partnerComments =
    preview && preview.partnerCommentCount > 0
      ? t('memories.delete.partnerComments', { owner: possessive(previewName, locale), count: preview.partnerCommentCount })
      : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID="memory-detail">
      {memory.media.length > 0 ? <MediaCarousel memoryId={memory.id} items={memory.media} title={memory.title} /> : null}

      <View style={styles.block}>
        <AppText variant="h1" testID="memory-title">
          {memory.title}
        </AppText>
        <AppText color="textMuted" testID="memory-date">
          {formatDateLong(memory.occurredOn, locale)}
        </AppText>
        {memory.location ? (
          <View style={styles.row}>
            <MapPin size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText color="textMuted" testID="memory-place">
              {memory.location.name}
            </AppText>
          </View>
        ) : null}
        <View style={styles.row}>
          <UserAvatar uri={mediaThumb(author.avatar)} label={author.name} size={32} />
          <AppText variant="label" testID="memory-author">
            {t('memories.card.by', { name: author.name })}
          </AppText>
        </View>
        {memory.visibility === 'PRIVATE' ? (
          <View style={styles.row} testID="memory-private">
            <Lock size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText variant="caption" color="textMuted">
              {t('memories.detail.privateNote')}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <IconAction
          icon={Heart}
          active={favorite}
          label={favorite ? t('memories.detail.unfavorite') : t('memories.detail.favorite')}
          onPress={() => toggleFavorite.mutate(!favorite)}
          testID="memory-favorite"
        />
        {own ? (
          <>
            <IconAction
              icon={Pencil}
              label={t('memories.detail.edit')}
              onPress={() => router.push({ pathname: '/memory-editor', params: { id: memory.id } })}
              testID="memory-edit"
            />
            <IconAction
              icon={Trash2}
              label={t('memories.detail.delete')}
              onPress={() => loadPreview.mutate()}
              disabled={offline || loadPreview.isPending}
              testID="memory-delete"
            />
          </>
        ) : null}
      </View>
      {toggleFavorite.error ? <FormMessage text={errorText(toggleFavorite.error)} /> : null}
      {loadPreview.error ? <FormMessage text={errorText(loadPreview.error)} testID="memory-delete-error" /> : null}

      {memory.description ? <AppText testID="memory-description">{memory.description}</AppText> : null}

      {memory.tags.length > 0 ? (
        <ChipRow wrap testID="memory-tags">
          {memory.tags.map((tag) => (
            <Chip
              key={tag}
              icon={Tag}
              label={tag}
              accessibilityLabel={t('memories.detail.tagA11y', { tag })}
              onPress={() => router.push({ pathname: '/memories/search', params: { tag } })}
            />
          ))}
        </ChipRow>
      ) : null}
      {memory.groups.length > 0 ? (
        <ChipRow wrap testID="memory-groups">
          {memory.groups.map((g) => (
            <Chip
              key={g.id}
              icon={FolderHeart}
              label={g.name}
              accessibilityLabel={t('memories.detail.groupA11y', { name: g.name })}
              onPress={() => router.push(`/memories/groups/${g.id}`)}
            />
          ))}
        </ChipRow>
      ) : null}

      <ReactionBar memoryId={memory.id} reactions={memory.reactions} />

      <View style={styles.block} testID="perspectives">
        <AppText variant="h3" accessibilityRole="header">
          {t('memories.perspective.title')}
        </AppText>
        <PerspectiveCard
          key={`mine-${minePerspective?.version ?? 0}`}
          memoryId={memory.id}
          perspective={minePerspective}
          ownerName={t('memories.perspective.mine')}
          mine
          disabled={offline}
        />
        {partner || partnerPerspective ? (
          <PerspectiveCard memoryId={memory.id} perspective={partnerPerspective} ownerName={partnerLabel} mine={false} />
        ) : null}
      </View>

      <CommentsSection memoryId={memory.id} comments={memory.comments} offline={offline} />

      <ConfirmSheet
        visible={!!preview}
        title={t('memories.delete.title')}
        body={partnerComments ?? t('memories.delete.body')}
        confirmLabel={t('memories.delete.confirm')}
        onConfirm={() => remove.mutate()}
        onCancel={() => setPreview(null)}
        loading={remove.isPending}
        testID="memory-delete-confirm"
      >
        {partnerComments ? <AppText color="textMuted">{t('memories.delete.body')}</AppText> : null}
        {remove.error ? <FormMessage text={errorText(remove.error)} /> : null}
      </ConfirmSheet>
    </ScrollView>
  );
}

function IconAction({
  icon: Icon,
  label,
  onPress,
  active = false,
  disabled,
  testID,
}: {
  icon: typeof Heart;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  testID: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.iconAction,
        { borderColor: colors.border, backgroundColor: active ? colors.surfaceRaised : colors.surface, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Icon size={20} color={active ? colors.primary : colors.text} fill={active ? colors.primary : 'none'} strokeWidth={iconStroke} />
      <AppText variant="label">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: spacing.xxl },
  block: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  iconAction: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
