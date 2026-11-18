import { Image } from 'expo-image';
import { Check, CheckCheck, Clock, FileText, Heart, MapPin, Mic, Timer } from 'lucide-react-native';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Message } from '@/api/queries/chat';
import { mediaPlaceholder } from '@/api/queries/memories';
import { AppText } from '@/components/AppText';
import { remainingSeconds } from '@/chat/disappearing';
import { formatTime, useT } from '@/i18n';
import { REACTION_GLYPH } from '@/memories/reactions';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

/** S-40 мөрийн загвар: сервер мессеж эсвэл outbox-д хүлээгдэж буй (`sending`). */
export interface BubbleModel {
  key: string;
  message: Message;
  sending?: boolean;
}

interface Props {
  model: BubbleModel;
  mine: boolean;
  now: number;
  partnerName: string;
  onLongPress?: (m: Message) => void;
  onQuotePress?: (id: string) => void;
  onOpen?: (m: Message) => void;
  highlighted?: boolean;
  /** Дуут мессежийн тоглуулагч (T-46) — өгөөгүй бол энгийн шошго. */
  renderVoice?: (m: Message, mine: boolean) => ReactNode;
}

export function formatRemaining(seconds: number): string {
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)} h`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
  return `${seconds} s`;
}

function StatusIcon({ status, sending, color, accent }: { status: Message['status']; sending?: boolean; color: string; accent: string }) {
  if (sending) return <Clock size={12} color={color} strokeWidth={iconStroke} />;
  if (status === 'SENT') return <Check size={12} color={color} strokeWidth={iconStroke} />;
  return <CheckCheck size={12} color={status === 'READ' ? accent : color} strokeWidth={iconStroke} />;
}

/**
 * Чатын бөмбөлөг (FR-6.1…6.3, AC-88, AC-176): текст/зураг/дуу/файл/байршил/«Хайртай», reply-ийн
 * ишлэл (товшвол эх рүү), «засварласан», «Мессеж устгагдсан», өөрийн мессежийн 4 төлөв
 * (илгээгдэж байна → илгээгдсэн → хүргэгдсэн → уншсан), реакц, алга болох хугацаа.
 */
export const MessageBubble = memo(function MessageBubble({
  model,
  mine,
  now,
  partnerName,
  onLongPress,
  onQuotePress,
  onOpen,
  highlighted,
  renderVoice,
}: Props) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const m = model.message;
  const fg = mine ? colors.onPrimary : colors.text;
  const muted = mine ? colors.onPrimary : colors.textMuted;
  const status = model.sending ? 'SENDING' : m.status;
  const remaining = m.disappearSeconds ? remainingSeconds(m.expiresAt, now) : null;
  const time = formatTime(new Date(m.createdAt), locale);
  const canAct = !model.sending && !m.deleted;

  const body = (): ReactNode => {
    if (m.deleted) {
      return (
        <AppText style={[styles.deleted, { color: muted }]} testID="message-deleted">
          {t('chat.deleted')}
        </AppText>
      );
    }
    switch (m.kind) {
      case 'HEART':
        return (
          <View style={styles.inline}>
            <Heart size={28} color={mine ? colors.onPrimary : colors.primary} fill={mine ? colors.onPrimary : colors.primary} />
            {m.text ? <AppText style={{ color: fg }}>{m.text}</AppText> : null}
          </View>
        );
      case 'IMAGE':
        return (
          <View style={styles.media}>
            {m.media ? (
              <Pressable onPress={() => onOpen?.(m)} accessibilityRole="imagebutton" accessibilityLabel={t('chat.kind.IMAGE')}>
                <Image accessibilityLabel=""
                  source={{ uri: m.media.urls.md ?? m.media.urls.original }}
                  placeholder={mediaPlaceholder(m.media, 'md')}
                  style={styles.image}
                  contentFit="cover"
                />
              </Pressable>
            ) : null}
            {m.text ? <AppText style={{ color: fg }}>{m.text}</AppText> : null}
          </View>
        );
      case 'VOICE':
        return renderVoice ? (
          renderVoice(m, mine)
        ) : (
          <View style={styles.inline}>
            <Mic size={18} color={fg} strokeWidth={iconStroke} />
            <AppText style={{ color: fg }}>{t('chat.kind.VOICE')}</AppText>
          </View>
        );
      case 'FILE':
        return (
          <Pressable onPress={() => onOpen?.(m)} style={styles.inline} accessibilityRole="link" accessibilityLabel={m.media?.fileName ?? t('chat.kind.FILE')}>
            <FileText size={18} color={fg} strokeWidth={iconStroke} />
            <AppText style={[styles.shrink, { color: fg }]} numberOfLines={2}>
              {m.media?.fileName ?? t('chat.kind.FILE')}
            </AppText>
          </Pressable>
        );
      case 'LOCATION':
        return (
          <Pressable onPress={() => onOpen?.(m)} style={styles.inline} accessibilityRole="link" accessibilityLabel={m.location?.name ?? t('chat.kind.LOCATION')} testID="message-location">
            <MapPin size={18} color={fg} strokeWidth={iconStroke} />
            <AppText style={[styles.shrink, { color: fg }]}>{m.location?.name ?? t('chat.kind.LOCATION')}</AppText>
          </Pressable>
        );
      default:
        return (
          <AppText style={{ color: fg }} selectable testID="message-text">
            {m.text}
          </AppText>
        );
    }
  };

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        onLongPress={() => canAct && onLongPress?.(m)}
        delayLongPress={350}
        accessibilityHint={canAct ? t('chat.longPressHint') : undefined}
        accessibilityActions={canAct ? [{ name: 'longpress', label: t('chat.actions.title') }] : undefined}
        onAccessibilityAction={() => canAct && onLongPress?.(m)}
        testID={`message-${m.clientMessageId}`}
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: colors.primary, borderBottomRightRadius: spacing.xxs }
            : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: spacing.xxs },
          highlighted ? { borderColor: colors.secondary, borderWidth: 2 } : null,
          model.sending ? styles.sending : null,
        ]}
      >
        {m.replyTo && !m.deleted ? (
          <Pressable
            onPress={() => onQuotePress?.(m.replyTo!.id)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.quoteA11y', { text: m.replyTo.text ?? '' })}
            testID="message-quote"
            style={[styles.quote, { borderLeftColor: mine ? colors.onPrimary : colors.primary, backgroundColor: mine ? colors.glow : colors.surfaceRaised }]}
          >
            <AppText variant="label" style={{ color: muted }} numberOfLines={1}>
              {m.replyTo.senderId === m.sender.id ? m.sender.displayName : partnerName}
            </AppText>
            <AppText variant="caption" style={{ color: muted }} numberOfLines={2}>
              {m.replyTo.deleted ? t('chat.deleted') : (m.replyTo.text ?? t(`chat.kind.${m.replyTo.kind}`))}
            </AppText>
          </Pressable>
        ) : null}
        {body()}
        <View style={styles.meta}>
          {m.disappearSeconds && !m.deleted ? (
            <View style={styles.inline} testID="message-timer">
              <Timer size={11} color={muted} strokeWidth={iconStroke} />
              <AppText variant="caption" style={{ color: muted }}>
                {remaining !== null ? t('chat.disappearing.remaining', { time: formatRemaining(remaining) }) : t('chat.disappearing.waiting')}
              </AppText>
            </View>
          ) : null}
          {m.editedAt && !m.deleted ? (
            <AppText variant="caption" style={{ color: muted }} testID="message-edited">
              {t('chat.edited')}
            </AppText>
          ) : null}
          <AppText variant="caption" style={{ color: muted }}>
            {time}
          </AppText>
          {mine ? (
            <View
              accessible
              accessibilityLabel={t(`chat.status.${status}`)}
              accessibilityValue={{ text: status }}
              testID="message-status"
              {...({ dataSet: { status } } as object)}
            >
              <StatusIcon status={m.status} sending={model.sending} color={muted} accent={colors.secondary} />
            </View>
          ) : null}
        </View>
      </Pressable>
      {m.reactions.length > 0 && !m.deleted ? (
        <View style={[styles.reactions, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} testID="message-reactions">
          {m.reactions.map((r) => (
            <AppText key={r.emoji} variant="caption" accessibilityLabel={`${REACTION_GLYPH[r.emoji]} ${r.count}`}>
              {REACTION_GLYPH[r.emoji]}
              {r.count > 1 ? ` ${r.count}` : ''}
            </AppText>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.screen, marginVertical: spacing.xxs },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: radius.input + 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xxs },
  sending: { opacity: 0.7 },
  deleted: { fontStyle: 'italic' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  shrink: { flexShrink: 1 },
  media: { gap: spacing.xxs },
  image: { width: 220, height: 220, borderRadius: radius.image },
  quote: { borderLeftWidth: 3, borderRadius: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  reactions: { flexDirection: 'row', gap: spacing.xxs, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.xs, marginTop: -spacing.xxs },
});
