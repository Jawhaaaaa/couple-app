import { Heart, ImagePlus, Mic, Pencil, Reply, SendHorizontal, Smile, X } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { Message } from '@/api/queries/chat';
import { AppText } from '@/components/AppText';
import { MESSAGE_MAX } from '@/chat/sendMessage';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { ParticleBurst } from '@/motion/ParticleBurst';
import { sendTyping } from '@/realtime';
import { sendSignal } from '@/signals/sendSignal';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';
import { typeScale } from '@/theme/typography';

/** «Бичиж байна»-г хамгийн олондоо 3 с тутам илгээнэ; 4 с бичихгүй бол унтраана. */
const TYPING_THROTTLE_MS = 3000;
const TYPING_IDLE_MS = 4000;
export const QUICK_EMOJI = ['💗', '🥰', '😘', '🤗', '😂', '😮', '😢', '✨'] as const;

interface Props {
  replyTo: Message | null;
  editing: Message | null;
  partnerName: string;
  onCancelContext: () => void;
  onSend: (text: string) => void;
  onAttach: () => void;
  attaching?: boolean;
  /** Дуу бичих (T-46, S-45) — өгвөл микрофоны товч гарна. */
  onVoice?: () => void;
  /** Бичлэгийн overlay идэвхтэй үед input-ийн оронд. */
  overlay?: ReactNode;
}

function IconButton({ label, onPress, children, disabled, testID }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.icon, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/**
 * S-40 input (FR-6.1, FR-6.10): текст, зураг, emoji, дуу, «Хайртай» (FR-4.1-тэй ижил `POST /signals`,
 * AC-178), reply/засварын мөр. Бичих үед `/app/typing` (ANIM-08, AC-177).
 */
export function ChatComposer({ replyTo, editing, partnerName, onCancelContext, onSend, onAttach, attaching, onVoice, overlay }: Props) {
  const t = useT();
  const colors = useColors();
  const { offline } = useNetworkStatus();
  // Засах горимд эх текстээр эхэлнэ — эцэг нь `key`-ээр шинэчилнэ
  const [text, setText] = useState(editing?.text ?? '');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const [heartNote, setHeartNote] = useState<string | null>(null);
  const [cooling, setCooling] = useState(false);
  const lastTyping = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      sendTyping(false);
    },
    [],
  );

  const stopTyping = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (lastTyping.current) sendTyping(false);
    lastTyping.current = 0;
  };

  const change = (value: string) => {
    setText(value);
    const now = Date.now();
    if (value.length > 0 && now - lastTyping.current > TYPING_THROTTLE_MS) {
      lastTyping.current = now;
      sendTyping(true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    setEmojiOpen(false);
    stopTyping();
  };

  const heart = async () => {
    if (cooling) return;
    setBurst((b) => b + 1);
    playHaptic('ANIM-01');
    const outcome = await sendSignal({ kind: 'HEART' }, { offline });
    if (outcome.status === 'cooldown') {
      setCooling(true);
      setHeartNote(t('chat.heartCooldown', { seconds: outcome.seconds }));
      setTimeout(() => {
        setCooling(false);
        setHeartNote(null);
      }, outcome.seconds * 1000);
    } else if (outcome.status === 'failed') {
      setHeartNote(t('chat.heartFailed'));
    } else {
      setHeartNote(outcome.status === 'queued' ? t('home.heart.queued') : null);
    }
  };

  const context = editing ?? replyTo;
  return (
    <View style={[styles.root, { borderTopColor: colors.border, backgroundColor: colors.bg }]} testID="chat-composer">
      {context ? (
        <View style={[styles.context, { backgroundColor: colors.surfaceRaised }]} testID={editing ? 'composer-editing' : 'composer-reply'}>
          {editing ? <Pencil size={16} color={colors.primary} strokeWidth={iconStroke} /> : <Reply size={16} color={colors.primary} strokeWidth={iconStroke} />}
          <View style={styles.contextText}>
            <AppText variant="label" color="primary">
              {editing ? t('chat.editing') : t('chat.replyingTo', { name: replyTo?.sender.displayName === partnerName ? partnerName : (replyTo?.sender.displayName ?? '') })}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {context.text ?? t(`chat.kind.${context.kind}`)}
            </AppText>
          </View>
          <IconButton label={t('common.cancel')} onPress={onCancelContext} testID="composer-cancel">
            <X size={18} color={colors.textMuted} strokeWidth={iconStroke} />
          </IconButton>
        </View>
      ) : null}
      {emojiOpen ? (
        <View style={styles.emojiRow} testID="composer-emoji">
          {QUICK_EMOJI.map((e) => (
            <Pressable key={e} onPress={() => change(text + e)} accessibilityRole="button" accessibilityLabel={e} style={styles.icon}>
              <AppText variant="h3">{e}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {heartNote ? (
        <AppText variant="caption" color="textMuted" style={styles.note} accessibilityLiveRegion="polite" testID="composer-heart-note">
          {heartNote}
        </AppText>
      ) : null}
      {overlay ?? (
        <View style={styles.row}>
          {!editing ? (
            <IconButton label={t('chat.attachImage')} onPress={onAttach} disabled={attaching} testID="composer-attach">
              <ImagePlus size={22} color={colors.textMuted} strokeWidth={iconStroke} />
            </IconButton>
          ) : null}
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <TextInput
              value={text}
              onChangeText={change}
              onBlur={stopTyping}
              placeholder={t('chat.placeholder', { name: partnerName })}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MESSAGE_MAX}
              accessibilityLabel={t('chat.inputLabel')}
              style={[typeScale.body, styles.input, { color: colors.text }]}
              testID="composer-input"
            />
            <IconButton label={t('chat.emoji')} onPress={() => setEmojiOpen((o) => !o)} testID="composer-emoji-toggle">
              <Smile size={20} color={colors.textMuted} strokeWidth={iconStroke} />
            </IconButton>
          </View>
          {text.trim() ? (
            <IconButton label={editing ? t('chat.saveEdit') : t('chat.send')} onPress={submit} testID="composer-send">
              <SendHorizontal size={22} color={colors.primary} strokeWidth={iconStroke} />
            </IconButton>
          ) : (
            <>
              {onVoice && !editing ? (
                <IconButton label={t('chat.voice.record')} onPress={onVoice} testID="composer-voice">
                  <Mic size={22} color={colors.textMuted} strokeWidth={iconStroke} />
                </IconButton>
              ) : null}
              <AnimatedMoment anim="ANIM-01" playing={burst > 0}>
                {() => (
                  <View>
                    {burst > 0 ? <ParticleBurst burstKey={`chat-heart-${burst}`} count={6} distance={48} /> : null}
                    <Pressable
                      onPress={() => void heart()}
                      disabled={cooling}
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.heart')}
                      accessibilityState={{ disabled: cooling }}
                      testID="composer-heart"
                      style={[styles.heart, { backgroundColor: colors.primary, opacity: cooling ? 0.5 : 1 }]}
                    >
                      <Heart size={22} color={colors.onPrimary} fill={colors.onPrimary} />
                    </Pressable>
                  </View>
                )}
              </AnimatedMoment>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, paddingHorizontal: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.xs, gap: spacing.xs },
  context: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.input, paddingLeft: spacing.sm },
  contextText: { flex: 1 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  note: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xxs },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.input, borderWidth: 1, paddingLeft: spacing.sm },
  input: { flex: 1, minHeight: touchTarget, maxHeight: 140, paddingVertical: spacing.xs },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  heart: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
