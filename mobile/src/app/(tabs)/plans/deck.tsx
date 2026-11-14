import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { DECK_KEY, DECK_MATCHES_KEY, type DeckMatch, swipeDeck, useDeck, useDeckMatches } from '@/api/queries/ideas';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { IdeaCard } from '@/components/plans/IdeaCard';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { CelebrationOverlay } from '@/motion/CelebrationOverlay';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

/**
 * S-57 нууц санал нэгдэл (FR-7.9, AC-36, GAP-22): хосын санаа + сан, хоёулаа swipe хийгээгүйнх.
 * Сонголт нууц — хариунд зөвхөн тохирол ирнэ, нөгөөгийн «тийм/үгүй» хэзээ ч харагдахгүй.
 * Хоёулаа «Тийм» бол хоёуланд ANIM-18 (хамтрагчийнх `deck.matched`-ээр). Offline-д идэвхгүй.
 */
export default function DeckScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const deck = useDeck();
  const matches = useDeckMatches();
  const [index, setIndex] = useState(0);
  const [celebrating, setCelebrating] = useState<DeckMatch | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const endCelebration = useCallback(() => setCelebrating(null), []);

  // Хамтрагчийн swipe-аар үүссэн шинэ тохирол (realtime `deck.matched` → `['deck']`)
  useEffect(() => {
    if (!matches.data) return;
    if (seen.current === null) {
      seen.current = new Set(matches.data.map((m) => m.ideaRef));
      return;
    }
    const known = seen.current;
    const fresh = matches.data.find((m) => !known.has(m.ideaRef));
    matches.data.forEach((m) => known.add(m.ideaRef));
    if (fresh) setCelebrating(fresh);
  }, [matches.data]);

  const swipe = useMutation({
    mutationFn: ({ ideaRef, liked }: { ideaRef: string; liked: boolean }) => swipeDeck(ideaRef, liked),
    onSuccess: async (result) => {
      if (result.matched && result.match) {
        seen.current?.add(result.match.ideaRef);
        setCelebrating(result.match);
        await queryClient.invalidateQueries({ queryKey: DECK_MATCHES_KEY });
      }
      setIndex((i) => i + 1);
    },
  });

  const cards = deck.data ?? [];
  const card = cards[index];
  const refill = () => {
    setIndex(0);
    void queryClient.invalidateQueries({ queryKey: [...DECK_KEY, 'next'] });
  };

  let body;
  if (deck.isError && !deck.data) body = <ScreenState kind="error" message={errorText(deck.error)} onRetry={() => void deck.refetch()} />;
  else if (deck.isPending) body = <ScreenState kind="loading" rows={2} />;
  else if (!card) {
    const empty = emptyStateText('S-57', locale);
    body = cards.length > 0 ? (
      <AppButton variant="secondary" label={t('plans.random.again')} onPress={refill} testID="deck-refill" />
    ) : (
      <View style={styles.empty}>
        <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/plans/library')} />
      </View>
    );
  } else {
    body = (
      <Animated.View key={card.ideaRef} entering={FadeIn} style={styles.card}>
        <IdeaCard idea={card.idea} testID="deck-card" />
        <View style={styles.buttons}>
          <AppButton
            variant="secondary"
            label={t('plans.deck.no')}
            onPress={() => swipe.mutate({ ideaRef: card.ideaRef, liked: false })}
            disabled={offline || swipe.isPending}
            testID="deck-no"
            style={styles.flex}
          />
          <AppButton
            label={t('plans.deck.yes')}
            onPress={() => swipe.mutate({ ideaRef: card.ideaRef, liked: true })}
            disabled={offline || swipe.isPending}
            testID="deck-yes"
            style={styles.flex}
          />
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={styles.root}>
      <StackScreen title={t('plans.deck.title')} testID="screen-S-57">
        <ScrollView contentContainerStyle={styles.body}>
          <AppText color="textMuted">{t('plans.deck.hint')}</AppText>
          {body}
          {swipe.error ? <FormMessage text={errorText(swipe.error)} testID="deck-error" /> : null}
          {(matches.data?.length ?? 0) > 0 ? (
            <View style={styles.matches} testID="deck-matches">
              <AppText variant="h3" accessibilityRole="header">
                {t('plans.deck.matches')}
              </AppText>
              {matches.data?.map((m) => (
                <IdeaCard key={m.ideaRef} idea={m.idea} testID={`deck-match-${m.ideaRef}`} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </StackScreen>
      <CelebrationOverlay anim="ANIM-18" visible={!!celebrating} onDismiss={endCelebration}>
        <View style={styles.celebration} testID="deck-match-celebration">
          <AppText variant="display">{t('plans.deck.match')}</AppText>
          <AppText variant="h3" style={styles.center}>
            {t('plans.deck.matchBody', { title: celebrating?.idea.title ?? '' })}
          </AppText>
        </View>
      </CelebrationOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  empty: { minHeight: 300 },
  matches: { gap: spacing.sm },
  celebration: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  center: { textAlign: 'center' },
});
