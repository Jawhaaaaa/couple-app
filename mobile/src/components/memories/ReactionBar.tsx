import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { type Memory, memoryKey, type ReactionEmoji, type ReactionSummary, setReaction } from '@/api/queries/memories';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { applyReaction, myReaction, nextReaction, REACTION_GLYPH, REACTIONS } from '@/memories/reactions';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { type MotionLevel, useMotionPreference } from '@/motion/useMotionPreference';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const ARC_RADIUS = 96;
const ARC_HEIGHT = ARC_RADIUS + touchTarget + spacing.xs;
const ARC_WIDTH = ARC_RADIUS * 2 + touchTarget;

/** Нумын байрлал: 160°-аас 20° хүртэл тэнцүү (зүүнээс баруун). */
export function arcPosition(index: number, total: number) {
  const angle = ((160 - (140 * index) / Math.max(total - 1, 1)) * Math.PI) / 180;
  return { left: ARC_RADIUS + ARC_RADIUS * Math.cos(angle), bottom: ARC_RADIUS * Math.sin(angle) };
}

function ArcItem({ emoji, index, level, selected, label, onPick }: {
  emoji: ReactionEmoji;
  index: number;
  level: MotionLevel;
  selected: boolean;
  label: string;
  onPick: (e: ReactionEmoji) => void;
}) {
  const colors = useColors();
  const progress = useSharedValue(level === 'off' ? 1 : 0);
  useEffect(() => {
    if (level === 'off') return;
    const duration = level === 'full' ? 220 : 120;
    progress.value = withDelay(level === 'full' ? index * 35 : 0, withTiming(1, { duration, easing: Easing.out(Easing.back(1.6)) }));
  }, [index, level, progress]);
  const style = useAnimatedStyle(() =>
    level === 'full' ? { opacity: progress.value, transform: [{ scale: 0.4 + 0.6 * progress.value }] } : { opacity: progress.value },
  );
  const pos = arcPosition(index, REACTIONS.length);
  return (
    <Animated.View style={[styles.arcItem, { left: pos.left, bottom: pos.bottom }, style]}>
      <Pressable
        onPress={() => onPick(emoji)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        testID={`reaction-pick-${emoji}`}
        style={[styles.emojiButton, { backgroundColor: selected ? colors.primary : colors.surfaceRaised, borderColor: colors.border }]}
      >
        <AppText variant="h3">{REACTION_GLYPH[emoji]}</AppText>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Дурсамжийн реакц (FR-5.4, AC-173): товшвол ❤️ тавих/болих, удаан дарвал 6 реакцын нум
 * (ANIM-07, `selection` haptic). Дэлгэц уншигчид удаан дарах үйлдлийг `accessibilityActions`-оор.
 */
export function ReactionBar({ memoryId, reactions, disabled }: { memoryId: string; reactions: ReactionSummary[]; disabled?: boolean }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const level = useMotionPreference();
  const userId = useSessionStore((s) => s.userId) ?? '';
  const [open, setOpen] = useState(false);
  const mine = myReaction(reactions);

  const mutation = useMutation({
    mutationFn: (next: ReactionEmoji | null) => setReaction(memoryId, next),
    onMutate: (next) => {
      const previous = queryClient.getQueryData<Memory>(memoryKey(memoryId));
      if (previous) queryClient.setQueryData<Memory>(memoryKey(memoryId), { ...previous, reactions: applyReaction(previous.reactions, userId, next) });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(memoryKey(memoryId), ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: memoryKey(memoryId) }),
  });

  const apply = (picked: ReactionEmoji | 'TOGGLE') => {
    setOpen(false);
    playHaptic('ANIM-07');
    mutation.mutate(nextReaction(mine, picked));
  };
  const openArc = () => {
    if (disabled) return;
    playHaptic('ANIM-07');
    setOpen(true);
  };

  return (
    <View style={styles.root} testID="reaction-bar">
      {open ? (
        <AnimatedMoment anim="ANIM-07" playing={level === 'full'} style={styles.arc}>
          {() =>
            REACTIONS.map((emoji, i) => (
              <ArcItem
                key={emoji}
                emoji={emoji}
                index={i}
                level={level}
                selected={mine === emoji}
                label={t(`memories.reactions.${emoji}`)}
                onPick={apply}
              />
            ))
          }
        </AnimatedMoment>
      ) : null}
      <View style={styles.row}>
        <Pressable
          onPress={() => (open ? setOpen(false) : apply('TOGGLE'))}
          onLongPress={openArc}
          delayLongPress={350}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={mine ? t('memories.reactions.remove') : t('memories.reactions.add')}
          accessibilityHint={t('memories.reactions.hint')}
          accessibilityState={{ selected: !!mine, disabled: !!disabled }}
          accessibilityActions={[{ name: 'longpress', label: t('memories.reactions.more') }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'longpress') openArc();
          }}
          testID="reaction-main"
          style={({ pressed }) => [
            styles.main,
            { backgroundColor: mine ? colors.primary : colors.surfaceRaised, borderColor: colors.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          {mine ? (
            <AppText variant="h3">{REACTION_GLYPH[mine]}</AppText>
          ) : (
            <Heart size={22} color={colors.text} strokeWidth={iconStroke} />
          )}
        </Pressable>
        <View style={styles.summary} testID="reaction-summary">
          {reactions.map((r) => (
            <View
              key={r.emoji}
              style={[styles.pill, { borderColor: r.mine ? colors.primary : colors.border }]}
              accessible
              accessibilityLabel={t('memories.reactions.count', { reaction: t(`memories.reactions.${r.emoji}`), count: r.count })}
              testID={`reaction-count-${r.emoji}`}
            >
              <AppText>{REACTION_GLYPH[r.emoji]}</AppText>
              <AppText variant="label">{String(r.count)}</AppText>
            </View>
          ))}
        </View>
      </View>
      {mutation.error ? <FormMessage text={errorText(mutation.error)} testID="reaction-error" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  arc: { width: ARC_WIDTH, height: ARC_HEIGHT },
  arcItem: { position: 'absolute' },
  emojiButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  main: {
    width: touchTarget + spacing.xs,
    height: touchTarget + spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.pill, borderWidth: 1 },
});
