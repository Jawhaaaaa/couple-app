import { FileText, Heart, Image as ImageIcon, MapPin, Mic, Paperclip, Pencil, Reply, SendHorizontal, Smile, X } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { Message } from '@/api/queries/chat';
import { AppText } from '@/components/AppText';
import { MESSAGE_MAX } from '@/chat/sendMessage';
import type { VoiceMode, VoicePhase } from '@/chat/useVoiceRecording';
import { MicGesture } from '@/chat/micGesture';
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
export type AttachKind = 'image' | 'file' | 'location';

export const QUICK_EMOJI = ['💗', '🥰', '😘', '🤗', '😂', '😮', '😢', '✨'] as const;

interface Props {
  replyTo: Message | null;
  editing: Message | null;
  partnerName: string;
  onCancelContext: () => void;
  onSend: (text: string) => void;
  onAttach: (kind: AttachKind) => void;
  attaching?: boolean;
  /** Дуу бичих (T-46, S-45) — өгвөл микрофоны товч гарна. */
  voice?: VoiceControls;
  /** Бичлэгийн overlay идэвхтэй үед input-ийн оронд (микрофоны товч байрандаа үлдэнэ). */
  overlay?: ReactNode;
}

export interface VoiceControls {
  phase: VoicePhase;
  mode: VoiceMode;
  start: (mode: VoiceMode) => void;
  cancel: () => void;
  finish: () => void;
  lock: () => void;
}

/**
 * S-45 микрофоны товч (`MicGesture`): дарж байх хооронд бичнэ (суллавал илгээнэ), зүүн тийш
 * гулсуулбал цуцална, дээш түлхвэл түгжинэ. Богино товшилт — гар чөлөөтэй горим; дэлгэц уншигчид мөн.
 */
function VoiceMicButton({ voice, color, label }: { voice: VoiceControls; color: string; label: string }) {
  const [gesture] = useState(() => new MicGesture());
  useEffect(() => {
    gesture.setHandlers(voice);
  }, [gesture, voice]);
  return (
    <View
      {...gesture.responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => voice.start('locked')}
      testID="composer-voice"
      style={styles.icon}
    >
      <Mic size={22} color={color} strokeWidth={iconStroke} />
    </View>
  );
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
export function ChatComposer({ replyTo, editing, partnerName, onCancelContext, onSend, onAttach, attaching, voice, overlay }: Props) {
  const t = useT();
  const colors = useColors();
  const { offline } = useNetworkStatus();
  // Засах горимд эх текстээр эхэлнэ — эцэг нь `key`-ээр шинэчилнэ
  const [text, setText] = useState(editing?.text ?? '');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
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
      {attachOpen && !editing ? (
        <View style={styles.emojiRow} testID="composer-attach-menu">
          {(
            [
              ['image', ImageIcon, t('chat.attach.image')],
              ['file', FileText, t('chat.attach.file')],
              ['location', MapPin, t('chat.attach.location')],
            ] as const
          ).map(([kind, Icon, label]) => (
            <Pressable
              key={kind}
              onPress={() => {
                setAttachOpen(false);
                onAttach(kind);
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              testID={`composer-attach-${kind}`}
              style={[styles.attachItem, { backgroundColor: colors.surfaceRaised }]}
            >
              <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
              <AppText variant="label">{label}</AppText>
            </Pressable>
          ))}
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
      {/* Байрлал тогтмол: [оролт эсвэл overlay] · [микрофон] · [илгээх/зүрх] — бичиж эхлэхэд микрофон
          дахин mount болохгүй тул удаан даралтын gesture тасрахгүй */}
      <View style={styles.row}>
        {overlay ?? (
          <>
            {!editing ? (
              <IconButton label={t('chat.attach.title')} onPress={() => setAttachOpen((o) => !o)} disabled={attaching} testID="composer-attach">
                <Paperclip size={22} color={colors.textMuted} strokeWidth={iconStroke} />
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
          </>
        )}
        {voice && !editing && (overlay ? voice.mode === 'hold' : !text.trim()) ? (
          <VoiceMicButton voice={voice} color={overlay ? colors.primary : colors.textMuted} label={t('chat.voice.record')} />
        ) : null}
        {overlay ? null : text.trim() ? (
          <IconButton label={editing ? t('chat.saveEdit') : t('chat.send')} onPress={submit} testID="composer-send">
            <SendHorizontal size={22} color={colors.primary} strokeWidth={iconStroke} />
          </IconButton>
        ) : (
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
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, paddingHorizontal: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.xs, gap: spacing.xs },
  context: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.input, paddingLeft: spacing.sm },
  contextText: { flex: 1 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  attachItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, minHeight: touchTarget, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  note: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xxs },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.input, borderWidth: 1, paddingLeft: spacing.sm },
  input: { flex: 1, minHeight: touchTarget, maxHeight: 140, paddingVertical: spacing.xs },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  heart: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
