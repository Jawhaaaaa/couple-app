import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { type AnyIdea, type DateIdea, IDEAS_KEY, isLibraryIdea, MAX_BUDGETS, pickRandomIdea, type RandomFilters, SETTINGS } from '@/api/queries/ideas';
import { CATEGORIES } from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { IdeaCard } from '@/components/plans/IdeaCard';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { loosenFilters, pickRandom } from '@/domain/randomFilter';
import { useErrorText } from '@/hooks/useErrorText';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { formatMoney, useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { planDraftFromIdea } from '@/plans/ideaForm';
import { usePrefsStore } from '@/stores/prefsStore';
import { motion, spacing } from '@/theme/tokens';

type Outcome = { idea: AnyIdea; candidates: number | null } | 'none';

/** ANIM-17 «Санамсаргүй сонго»: карт эргэлдэж буугаад тогтоно; reduce motion-д fade л. */
function Shuffle({ pickKey, children }: { pickKey: number; children: ReactNode }) {
  const level = useMotionPreference();
  const turn = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (level !== 'full') return;
    turn.value = withSequence(withTiming(-8, { duration: motion.duration.feedback }), withTiming(8, { duration: motion.duration.feedback }), withSpring(0, motion.springBouncy));
    scale.value = withSequence(withTiming(0.92, { duration: motion.duration.feedback }), withSpring(1, motion.springBouncy));
  }, [level, pickKey, scale, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${turn.value}deg` }, { scale: scale.value }] }));
  return (
    <AnimatedMoment anim="ANIM-17" playing>
      {() => (
        <Animated.View key={pickKey} entering={level === 'off' ? undefined : FadeIn} style={style}>
          {children}
        </Animated.View>
      )}
    </AnimatedMoment>
  );
}

/**
 * S-56 санамсаргүй сонго (FR-7.8, AC-98): шүүлтэд (ангилал, гэр/гадаа, ≤ төсөв, сан) тохирох
 * санаанаас л; тохирох алга бол «Шүүлтэд тохирох санаа алга» + «Шүүлт сулруулах». Offline үед
 * кэшийн санаанаас ижил дүрмээр.
 */
export default function RandomScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const { offline } = useNetworkStatus();
  const [filters, setFilters] = useState<RandomFilters>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pickKey, setPickKey] = useState(0);

  const pick = useMutation({
    mutationFn: async (f: RandomFilters): Promise<Outcome> => {
      if (offline) {
        const cached = queryClient.getQueriesData<DateIdea[]>({ queryKey: IDEAS_KEY }).flatMap(([, data]) => data ?? []);
        const unique = [...new Map(cached.map((i) => [i.id, i])).values()];
        const idea = pickRandom(unique, f);
        return idea ? { idea, candidates: null } : 'none';
      }
      const result = await pickRandomIdea(f);
      return result ? { idea: result.idea, candidates: result.candidates } : 'none';
    },
    onSuccess: (next) => {
      setOutcome(next);
      if (next !== 'none') {
        setPickKey((k) => k + 1);
        playHaptic('ANIM-17');
      }
    },
  });

  const run = (f: RandomFilters) => {
    setFilters(f);
    pick.mutate(f);
  };
  const set = (patch: Partial<RandomFilters>) => {
    setOutcome(null);
    setFilters((f) => ({ ...f, ...patch }));
  };
  const loosened = loosenFilters(filters);

  return (
    <StackScreen title={t('plans.random.title')} testID="screen-S-56">
      <ScrollView contentContainerStyle={styles.body}>
        <ChipRow>
          <Chip label={t('plans.ideas.all')} selected={!filters.category} onPress={() => set({ category: undefined })} testID="random-category-all" />
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`plans.category.${c}`)} selected={filters.category === c} onPress={() => set({ category: filters.category === c ? undefined : c })} testID={`random-category-${c}`} />
          ))}
        </ChipRow>
        <ChipRow wrap>
          {SETTINGS.map((s) => (
            <Chip key={s} label={t(`plans.setting.${s}`)} selected={filters.setting === s} onPress={() => set({ setting: filters.setting === s ? undefined : s })} testID={`random-setting-${s}`} />
          ))}
          {MAX_BUDGETS.map((b) => (
            <Chip
              key={b}
              label={b === 0 ? t('plans.ideas.free') : t('plans.ideas.upTo', { amount: formatMoney(b, locale) })}
              selected={filters.maxBudget === b}
              onPress={() => set({ maxBudget: filters.maxBudget === b ? undefined : b })}
              testID={`random-budget-${b}`}
            />
          ))}
          <Chip label={t('plans.random.includeLibrary')} selected={!!filters.includeLibrary} onPress={() => set({ includeLibrary: !filters.includeLibrary })} testID="random-library" />
        </ChipRow>
        <AppButton label={outcome && outcome !== 'none' ? t('plans.random.again') : t('plans.random.pick')} onPress={() => run(filters)} loading={pick.isPending} testID="random-pick" />
        {pick.error ? <FormMessage text={errorText(pick.error)} testID="random-error" /> : null}
        {outcome === 'none' ? (
          <View style={styles.none} testID="random-no-match">
            <ScreenState
              kind="empty"
              text={`${t('plans.random.noMatch')}. ${emptyStateText('S-56', locale).text}`}
              actionLabel={t('plans.random.loosen')}
              onAction={() => (loosened ? run(loosened) : setOutcome(null))}
            />
          </View>
        ) : null}
        {outcome && outcome !== 'none' ? (
          <Shuffle pickKey={pickKey}>
            <IdeaCard
              idea={outcome.idea}
              testID="random-result"
              footer={
                <>
                  {outcome.candidates != null ? (
                    <AppText variant="caption" color="textMuted">
                      {t('plans.random.candidates', { count: outcome.candidates })}
                    </AppText>
                  ) : null}
                  {!isLibraryIdea(outcome.idea) ? (
                    <AppButton
                      variant="secondary"
                      label={t('plans.ideas.toPlan')}
                      onPress={() => router.push({ pathname: '/plans/new', params: { draft: planDraftFromIdea(outcome.idea as DateIdea) } })}
                      testID="random-to-plan"
                    />
                  ) : (
                    <AppButton
                      variant="secondary"
                      label={t('plans.ideas.toPlan')}
                      onPress={() =>
                        router.push({
                          pathname: '/plans/new',
                          params: { draft: JSON.stringify({ title: outcome.idea.title, description: outcome.idea.description, category: outcome.idea.category }) },
                        })
                      }
                      testID="random-to-plan"
                    />
                  )}
                </>
              }
            />
          </Shuffle>
        ) : null}
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  none: { minHeight: 280 },
});
