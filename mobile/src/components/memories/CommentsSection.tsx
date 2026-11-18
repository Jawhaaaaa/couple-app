import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import { useDisplayUser } from '@/api/queries/couple';
import { type Comment, COMMENT_MAX, deleteComment, memoryKey, updateComment } from '@/api/queries/memories';
import { mediaThumb } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { UserAvatar } from '@/components/UserAvatar';
import { useErrorText } from '@/hooks/useErrorText';
import { formatDate, formatTime, useT } from '@/i18n';
import type { OutboxItem } from '@/offline/outbox';
import { outbox } from '@/offline/outboxRuntime';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** Outbox-д хүлээгдэж буй (илгээгдээгүй) зүйлс — offline-д бичсэн сэтгэгдэл харагдсаар. */
export function useOutboxItems(path: string): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    let alive = true;
    const pick = (all: OutboxItem[]) => all.filter((i) => i.method === 'POST' && i.path === path);
    outbox
      .items()
      .then((all) => alive && setItems(pick(all)))
      // Хадгалсан дараалал уншигдахгүй бол хоосон — дараагийн өөрчлөлтөөр шинэчлэгдэнэ
      .catch(() => undefined);
    const unsubscribe = outbox.subscribe((all) => setItems(pick(all)));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [path]);
  return items;
}

/**
 * S-31 сэтгэгдэл (FR-5.4, AC-173): хоёулаа бичнэ, зөвхөн өөрийнхөө сэтгэгдлийг засна/устгана
 * (INV-03). Бичсэн сэтгэгдэл outbox-оор (`clientId`) явна — offline-д ч алдагдахгүй.
 */
export function CommentsSection({ memoryId, comments, offline }: { memoryId: string; comments: Comment[]; offline: boolean }) {
  const t = useT();
  const colors = useColors();
  const queryClient = useQueryClient();
  const path = `/memories/${memoryId}/comments`;
  const pending = useOutboxItems(path);
  const [text, setText] = useState('');

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    const clientId = uuidv7();
    await outbox.enqueue({ method: 'POST', path, body: { text: trimmed, clientId }, clientId });
    // Сүлжээгүй бол outbox өөрөө дараа илгээнэ; амжилттай бол серверийн жагсаалтыг татна
    await outbox.flush().catch(() => 0);
    void queryClient.invalidateQueries({ queryKey: memoryKey(memoryId) });
  };

  return (
    <View style={styles.root} testID="comments">
      <AppText variant="h3" accessibilityRole="header">
        {t('memories.comments.title')}
      </AppText>
      {comments.length === 0 && pending.length === 0 ? (
        <AppText color="textMuted" testID="comments-empty">
          {t('memories.comments.empty')}
        </AppText>
      ) : null}
      {comments.map((c) => (
        <CommentRow key={c.id} memoryId={memoryId} comment={c} offline={offline} />
      ))}
      {pending.map((p) => (
        <View key={p.clientId} style={[styles.bubble, { backgroundColor: colors.surfaceRaised }]} testID="comment-pending">
          <AppText>{(p.body as { text?: string } | undefined)?.text ?? ''}</AppText>
          <View style={styles.meta}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <AppText variant="caption" color="textMuted">
              {t('memories.comments.pending')}
            </AppText>
          </View>
        </View>
      ))}
      <View style={styles.composer}>
        <View style={styles.flex}>
          <TextField
            label={t('memories.comments.label')}
            placeholder={t('memories.comments.placeholder')}
            value={text}
            onChangeText={(v) => setText(v.slice(0, COMMENT_MAX))}
            maxLength={COMMENT_MAX}
            multiline
            testID="comment-input"
          />
        </View>
        <Pressable
          onPress={() => void send()}
          disabled={text.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel={t('memories.comments.send')}
          accessibilityState={{ disabled: text.trim().length === 0 }}
          testID="comment-send"
          style={({ pressed }) => [styles.send, { backgroundColor: colors.primary, opacity: text.trim() ? (pressed ? 0.85 : 1) : 0.5 }]}
        >
          <Send size={20} color={colors.onPrimary} strokeWidth={iconStroke} />
        </Pressable>
      </View>
    </View>
  );
}

function CommentRow({ memoryId, comment, offline }: { memoryId: string; comment: Comment; offline: boolean }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const userId = useSessionStore((s) => s.userId);
  const own = comment.author.id === userId;
  const author = useDisplayUser()(comment.author);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(comment.text);
  const refresh = () => queryClient.invalidateQueries({ queryKey: memoryKey(memoryId) });

  const edit = useMutation({
    mutationFn: () => updateComment(comment.id, text.trim(), comment.version),
    onSuccess: () => {
      setEditing(false);
      void refresh();
    },
    onError: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: () => {
      setConfirming(false);
      void refresh();
    },
  });
  const created = new Date(comment.createdAt);

  return (
    <View style={[styles.bubble, { backgroundColor: own ? colors.surfaceRaised : colors.surface, borderColor: colors.border }]} testID="comment">
      <View style={styles.meta}>
        <UserAvatar uri={mediaThumb(author.avatar)} label={author.name} size={28} />
        <AppText variant="label" style={styles.flex}>
          {author.name}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {`${formatDate(created, dateFormat)} ${formatTime(created, locale)}`}
        </AppText>
      </View>
      {editing ? (
        <>
          <TextField
            label={t('memories.comments.editLabel')}
            value={text}
            onChangeText={(v) => setText(v.slice(0, COMMENT_MAX))}
            maxLength={COMMENT_MAX}
            multiline
            testID="comment-edit-input"
          />
          <View style={styles.actions}>
            <AppButton variant="secondary" label={t('common.cancel')} onPress={() => setEditing(false)} testID="comment-edit-cancel" />
            <AppButton
              label={t('common.save')}
              onPress={() => edit.mutate()}
              loading={edit.isPending}
              disabled={offline || !text.trim()}
              testID="comment-edit-save"
            />
          </View>
        </>
      ) : (
        <AppText testID="comment-text">{comment.text}</AppText>
      )}
      {comment.editedAt && !editing ? (
        <AppText variant="caption" color="textMuted">
          {t('memories.comments.edited')}
        </AppText>
      ) : null}
      {edit.error ? <FormMessage text={errorText(edit.error)} /> : null}
      {remove.error ? <FormMessage text={errorText(remove.error)} /> : null}
      {own && !editing ? (
        <View style={styles.actions}>
          <AppButton
            variant="ghost"
            label={t('memories.comments.edit')}
            onPress={() => {
              setText(comment.text);
              setEditing(true);
            }}
            disabled={offline}
            testID="comment-edit"
          />
          <AppButton variant="ghost" label={t('memories.comments.delete')} onPress={() => setConfirming(true)} disabled={offline} testID="comment-delete" />
        </View>
      ) : null}
      <ConfirmSheet
        visible={confirming}
        title={t('memories.comments.deleteTitle')}
        confirmLabel={t('memories.comments.delete')}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
        loading={remove.isPending}
        testID="comment-delete-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  bubble: { borderRadius: radius.input, padding: spacing.sm, gap: spacing.xxs, borderWidth: 1, borderColor: 'transparent' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs, flexWrap: 'wrap' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  send: { width: touchTarget + spacing.xxs, height: touchTarget + spacing.xxs, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
