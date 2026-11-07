import { router } from 'expo-router';
import { MessageCircleHeart } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useMeQuery } from '@/api/queries/bootstrap';
import { type Dashboard, type SignalSummary, useDashboard } from '@/api/queries/dashboard';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { CounterOdometer } from '@/components/home/CounterOdometer';
import { HeartButton } from '@/components/home/HeartButton';
import {
  LettersSection,
  NextDateSection,
  OnThisDaySection,
  RecapSection,
  RecentMemoriesSection,
  SurveySection,
  UnreadMessagesSection,
  UpcomingSection,
  UpdateSection,
} from '@/components/home/HomeSections';
import { LongDistanceBlock } from '@/components/home/LongDistance';
import { PersonCardView } from '@/components/home/PersonCardView';
import { QuestionTeaser } from '@/components/home/QuestionTeaser';
import { UnseenSignalsCard } from '@/components/home/UnseenSignalsCard';
import { Mascot } from '@/components/Mascot';
import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { useNow } from '@/hooks/useNow';
import { formatDate, useT } from '@/i18n';
import { LIVE_SUPPRESS_MS, useSignalFx } from '@/signals/sendSignal';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-20 Нүүр (FR-3, FR-4): тоолуур (ANIM-04) → S-21, хоёр хүний карт (цаг, зөрүү, цаг агаар,
 * тайван цаг), алс зай, зүрх/тэврэлт, «Чамайг бодож байна» → S-26, өдрийн асуулт → S-22,
 * дараагийн болзоо, ой, дурсамж, мессеж г.м. Хэсэг бүр байхгүй/хоосон бол өөрийн хоосон
 * төлөвтэй (AC-72). `['dashboard']` persist хийгддэг тул offline-д кэшээс нээгдэнэ.
 */
export default function HomeScreen() {
  const t = useT();
  const errorText = useErrorText();
  const dashboard = useDashboard();
  const me = useMeQuery().data;
  const now = useNow(30_000);
  const data = dashboard.data;

  let body: ReactNode;
  if (dashboard.isPending) body = <ScreenState kind="loading" rows={4} />;
  else if (dashboard.isError && !data) {
    body = <ScreenState kind="error" message={errorText(dashboard.error)} onRetry={() => void dashboard.refetch()} />;
  } else if (data) {
    const solo = me?.space.kind === 'SOLO' || !data.partner;
    body = (
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={dashboard.isRefetching} onRefresh={() => void dashboard.refetch()} />}
        testID="home-scroll"
      >
        <CounterBlock counter={data.counter} />
        {solo ? <SoloInvite name={me?.callName ?? me?.displayName ?? data.me.name} /> : <CoupleBody data={data} now={now} />}
      </ScrollView>
    );
  }

  return (
    <TabScreen title={t('tabs.home')} testID="screen-S-20">
      {body}
    </TabScreen>
  );
}

function CoupleBody({ data, now }: { data: Dashboard; now: number }) {
  const t = useT();
  const colors = useColors();
  const partner = data.partner;
  const name = partner?.name ?? t('home.partnerFallback');
  const liveAt = useSignalFx((s) => s.liveAt);

  // AC-18: нэгтгэсэн картын snapshot — дахин татахад алга болохгүй, нэг л удаа тоглоно.
  // Realtime overlay саяхан тоглосон бол тэр дохиог дахин үзүүлэхгүй.
  const [unseen, setUnseen] = useState<SignalSummary | null>(null);
  const incoming = data.unseenSignals;
  const liveRecently = liveAt !== null && now - liveAt < LIVE_SUPPRESS_MS;
  if (incoming && incoming.count > 0 && !unseen && !liveRecently) setUnseen(incoming);

  return (
    <>
      {unseen ? <UnseenSignalsCard summary={unseen} name={name} /> : null}
      <View style={styles.people}>
        <PersonCardView card={data.me} role="me" now={now} />
        {partner ? <PersonCardView card={partner} role="partner" now={now} /> : null}
      </View>
      {data.longDistance ? <LongDistanceBlock data={data.longDistance} now={now} /> : null}
      <Card testID="home-signals">
        <HeartButton />
        <Pressable
          onPress={() => router.push('/home/thinking')}
          accessibilityRole="button"
          accessibilityLabel={t('home.thinking.open')}
          testID="home-thinking-open"
          style={({ pressed }) => [styles.thinking, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <MessageCircleHeart size={20} color={colors.primary} strokeWidth={iconStroke} />
          <AppText variant="label">{t('home.thinking.open')}</AppText>
        </Pressable>
        <AppText color="textMuted" style={styles.center} testID="home-signals-today">
          {t('home.signalsToday', { sent: data.signalsToday.sent, received: data.signalsToday.received })}
        </AppText>
      </Card>
      <QuestionTeaser partnerName={name} />
      <NextDateSection plan={data.nextDate} now={now} />
      <UpcomingSection items={data.upcoming} />
      <RecentMemoriesSection items={data.recentMemories} />
      <UnreadMessagesSection count={data.unreadMessages} />
      <OnThisDaySection data={data.onThisDay} />
      <RecapSection data={data.recap} />
      <LettersSection items={data.incomingLetters} />
      <SurveySection due={!!data.survey?.due} />
      <UpdateSection data={data.update} />
    </>
  );
}

/** Тоолуур (FR-3.1): батлагдаагүй бол «Эхэлсэн өдрөө батлаарай» → S-11 (AC-65). */
function CounterBlock({ counter }: { counter: Dashboard['counter'] }) {
  const t = useT();
  const colors = useColors();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  if (!counter.confirmed || !counter.startDate) {
    return (
      <Card testID="home-counter-unconfirmed">
        <AppText variant="h2">{t('home.counter.confirmTitle')}</AppText>
        <AppText color="textMuted">{t('home.counter.confirmBody')}</AppText>
        <AppButton label={t('home.counter.confirm')} onPress={() => router.push('/start-date')} testID="home-counter-confirm" />
      </Card>
    );
  }
  const since = formatDate(counter.startDate, dateFormat);
  return (
    <Pressable
      onPress={() => router.push('/home/counter')}
      accessibilityRole="button"
      accessibilityLabel={t('home.counter.a11y', { count: counter.days, date: since })}
      accessibilityHint={t('home.counter.hint')}
      testID="home-counter"
      style={({ pressed }) => [styles.counter, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.counterRow}>
        <CounterOdometer value={counter.days} />
        <AppText variant="h3" style={styles.counterUnit}>
          {t('home.counter.unit')}
        </AppText>
      </View>
      <AppText color="textMuted" testID="home-counter-since">
        {t('home.counter.since', { date: since })}
      </AppText>
    </Pressable>
  );
}

/** Хосгүй (SOLO) үед: урилга руу (S-13). */
function SoloInvite({ name }: { name: string }) {
  const t = useT();
  return (
    <Card testID="home-solo">
      <View style={styles.soloRow}>
        <Mascot size={72} pose="wave" />
        <View style={styles.flex}>
          <AppText variant="h3">{t('home.solo.title', { name })}</AppText>
          <AppText color="textMuted">{t('home.solo.body')}</AppText>
        </View>
      </View>
      <AppButton label={t('home.solo.action')} onPress={() => router.push('/waiting')} testID="home-solo-invite" />
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  counter: { alignItems: 'center', gap: spacing.xxs, padding: spacing.lg, borderRadius: radius.card, borderWidth: 1, minHeight: touchTarget },
  counterRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  counterUnit: { paddingBottom: spacing.xs },
  thinking: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'center',
  },
  soloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
