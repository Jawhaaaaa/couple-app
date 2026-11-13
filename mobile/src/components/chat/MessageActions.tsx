import type { LucideIcon } from 'lucide-react-native';
import { Pencil, Reply, Trash2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import type { Message, ReactionEmoji } from '@/api/queries/chat';
import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { myReaction, REACTION_GLYPH, REACTIONS } from '@/memories/reactions';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

export interface MessageAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  danger?: boolean;
}

interface Props {
  message: Message | null;
  mine: boolean;
  onClose: () => void;
  onReact: (m: Message, emoji: ReactionEmoji | null) => void;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  /** Нэмэлт үйлдэл (S-41: pin, хуулах, дурсамж/санаа/жагсаалт болгох — T-48). */
  extra?: MessageAction[];
  footer?: ReactNode;
}

/**
 * Мессеж дээр удаан дарахад (S-41): дээр нь 6 реакц (ANIM-07, сонгосныг дахин дарвал болино),
 * доор нь reply, өөрийнхөө текстийг засах, өөрийнхөө мессежийг устгах (INV-03).
 */
export function MessageActions({ message, mine, onClose, onReact, onReply, onEdit, onDelete, extra = [], footer }: Props) {
  const t = useT();
  const colors = useColors();
  if (!message) return null;
  const mineReaction = myReaction(message.reactions);
  const actions: MessageAction[] = [
    { key: 'reply', label: t('chat.actions.reply'), icon: Reply, onPress: () => onReply(message) },
    ...(mine && message.kind === 'TEXT' ? [{ key: 'edit', label: t('chat.actions.edit'), icon: Pencil, onPress: () => onEdit(message) }] : []),
    ...extra,
    ...(mine ? [{ key: 'delete', label: t('chat.actions.delete'), icon: Trash2, onPress: () => onDelete(message), danger: true }] : []),
  ];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="message-actions-scrim">
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="message-actions">
          <AppText variant="h3" accessibilityRole="header">
            {t('chat.actions.title')}
          </AppText>
          <AnimatedMoment anim="ANIM-07" playing>
            {() => (
              <View style={styles.reactions}>
                {REACTIONS.map((emoji) => {
                  const selected = emoji === mineReaction;
                  return (
                    <Pressable
                      key={emoji}
                      onPress={() => onReact(message, selected ? null : emoji)}
                      accessibilityRole="button"
                      accessibilityLabel={t(`memories.reactions.${emoji}`)}
                      accessibilityState={{ selected }}
                      testID={`message-react-${emoji}`}
                      style={[styles.emoji, { backgroundColor: selected ? colors.primary : colors.surfaceRaised }]}
                    >
                      <AppText variant="h3">{REACTION_GLYPH[emoji]}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </AnimatedMoment>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={a.onPress}
              accessibilityRole="button"
              testID={`message-action-${a.key}`}
              style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
            >
              <a.icon size={20} color={a.danger ? colors.danger : colors.text} strokeWidth={iconStroke} />
              <AppText color={a.danger ? 'danger' : 'text'}>{a.label}</AppText>
            </Pressable>
          ))}
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderWidth: 1, padding: spacing.lg, gap: spacing.xs, width: '100%', maxWidth: 560, alignSelf: 'center' },
  reactions: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  emoji: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
});
