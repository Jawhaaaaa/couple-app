import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { CalendarHeart, ChevronRight, Gift, Images, type LucideIcon, Mail, MessageCircle, Sparkles } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  answerSurvey,
  type Dashboard,
  DASHBOARD_KEY,
  type DatePlanSummary,
  type LetterTeaser,
  type MemorySummary,
  type OccasionSummary,
} from '@/api/queries/dashboard';
import { mediaThumb } from '@/api/queries/pairing';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { Mascot } from '@/components/Mascot';
import { emptyStateText } from '@/content/emptyStates';
import { countdownTo, formatCountdown } from '@/domain/partnerTime';
import { useErrorText } from '@/hooks/useErrorText';
import { formatDate, formatTime, useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** Хэсгийн хоосон төлөв (AC-72 (б)): маскот + 1 өгүүлбэр + холбогдох таб руу товч (ANIM-11). */
export function EmptySection({
  name,
  title,
  text,
  actionLabel,
  href,
}: {
  name: string;
  title: string;
  text: string;
  actionLabel: string;
  href: Href;
}) {
  return (
    <Card testID={`home-section-${name}-empty`}>
      <AppText variant="h3" accessibilityRole="header">
        {title}
      </AppText>
      <AnimatedMoment anim="ANIM-11" playing style={styles.emptyRow}>
        {() => (
          <>
            <Mascot size={56} pose="wave" />
            <AppText color="textMuted" style={styles.flex}>
              {text}
            </AppText>
          </>
        )}
      </AnimatedMoment>
      <AppButton variant="secondary" label={actionLabel} onPress={() => router.push(href)} testID={`home-section-${name}-action`} />
    </Card>
  );
}

function Section({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <Card testID={`home-section-${name}`}>
      <AppText variant="h3" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </Card>
  );
}

/** Товшиход холбогдох дэлгэц рүү очих мөр (≥ 44). */
function LinkRow({
  icon: Icon,
  label,
  detail,
  href,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string | null;
  href: Href;
  testID: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="link"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      testID={testID}
      style={({ pressed }) => [styles.link, { backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.85 : 1 }]}
    >
      <Icon size={22} color={colors.primary} strokeWidth={iconStroke} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="caption" color="textMuted">
            {detail}
          </AppText>
        ) : null}
      </View>
      <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
    </Pressable>
  );
}

export function NextDateSection({ plan, now }: { plan: DatePlanSummary | null | undefined; now: number }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  if (!plan) {
    const empty = emptyStateText('S-50', locale);
    return <EmptySection name="next-date" title={t('home.nextDate.title')} text={empty.text} actionLabel={empty.action} href="/plans" />;
  }
  const starts = new Date(plan.startsAt);
  const countdown = countdownTo(starts, now);
  const when = `${formatDate(starts, dateFormat, plan.timezone)} ${formatTime(starts, locale, plan.timezone)}`;
  return (
    <Section name="next-date" title={t('home.nextDate.title')}>
      <LinkRow
        icon={CalendarHeart}
        label={plan.title}
        detail={countdown ? `${when} · ${t('home.nextDate.in', { when: formatCountdown(countdown, t) })}` : when}
        href="/plans"
        testID="home-next-date"
      />
    </Section>
  );
}

export function UpcomingSection({ items }: { items: OccasionSummary[] }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  if (items.length === 0) {
    const empty = emptyStateText('S-61', locale);
    return <EmptySection name="upcoming" title={t('home.upcoming.title')} text={empty.text} actionLabel={empty.action} href="/together" />;
  }
  return (
    <Section name="upcoming" title={t('home.upcoming.title')}>
      {items.slice(0, 3).map((o) => (
        <LinkRow
          key={o.occasionKey}
          icon={o.kind === 'BIRTHDAY' ? Gift : Sparkles}
          label={o.title}
          detail={`${formatDate(o.nextOn, dateFormat)} · ${
            o.daysUntil === 0 ? t('home.upcoming.today') : t('home.upcoming.daysLeft', { count: o.daysUntil })
          }`}
          href={{ pathname: '/together/occasions/[key]', params: { key: o.occasionKey } }}
          testID="home-upcoming-item"
        />
      ))}
    </Section>
  );
}

export function RecentMemoriesSection({ items }: { items: MemorySummary[] }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  if (items.length === 0) {
    const empty = emptyStateText('S-30', locale);
    return <EmptySection name="memories" title={t('home.memories.title')} text={empty.text} actionLabel={empty.action} href="/memories" />;
  }
  return (
    <Section name="memories" title={t('home.memories.title')}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memories}>
        {items.slice(0, 5).map((m) => {
          const thumb = mediaThumb(m.cover);
          return (
            <Pressable
              key={m.id}
              onPress={() => router.push(`/memories/${m.id}`)}
              accessibilityRole="link"
              accessibilityLabel={`${m.title}. ${formatDate(m.occurredOn, dateFormat)}`}
              testID="home-memory"
              style={({ pressed }) => [styles.memory, { backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.85 : 1 }]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" accessible={false} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Images size={28} color={colors.textMuted} strokeWidth={iconStroke} />
                </View>
              )}
              <AppText variant="caption" numberOfLines={2}>
                {m.title}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </Section>
  );
}

export function UnreadMessagesSection({ count }: { count: number }) {
  const t = useT();
  if (count === 0) {
    return (
      <EmptySection
        name="messages"
        title={t('home.messages.title')}
        text={t('home.messages.emptyText')}
        actionLabel={t('home.messages.open')}
        href="/chat"
      />
    );
  }
  return (
    <Section name="messages" title={t('home.messages.title')}>
      <LinkRow icon={MessageCircle} label={t('home.messages.unread', { count })} href="/chat" testID="home-unread-messages" />
    </Section>
  );
}

export function OnThisDaySection({ data }: { data: Dashboard['onThisDay'] }) {
  const t = useT();
  if (!data) return null;
  return (
    <Section name="on-this-day" title={t('home.onThisDay.title')}>
      <LinkRow
        icon={Images}
        label={data.memories[0]?.title ?? t('home.onThisDay.title')}
        detail={t('home.onThisDay.count', { count: data.count })}
        href="/home/on-this-day"
        testID="home-on-this-day"
      />
    </Section>
  );
}

export function RecapSection({ data }: { data: Dashboard['recap'] }) {
  const t = useT();
  if (!data) return null;
  return (
    <Section name="recap" title={t('home.recap.title')}>
      <LinkRow icon={Sparkles} label={t('home.recap.label', { year: data.yearLabel })} href={`/recap/${data.id}`} testID="home-recap" />
    </Section>
  );
}

export function LettersSection({ items }: { items: LetterTeaser[] }) {
  const t = useT();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  if (items.length === 0) return null;
  return (
    <Section name="letters" title={t('home.letters.title')}>
      {items.map((l) => (
        <LinkRow
          key={l.id}
          icon={Mail}
          label={t('home.letters.incoming', {
            when: l.occasionLabel ?? (l.deliverAt ? formatDate(new Date(l.deliverAt), dateFormat) : t('home.letters.soon')),
          })}
          href="/together"
          testID="home-letter"
        />
      ))}
    </Section>
  );
}

/** Нэг удаагийн санал асуулга (AC-207, GAP-17): 1–5 эсвэл «Алгасах» (`score: null`). */
export function SurveySection({ due }: { due: boolean }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const answer = useMutation({
    mutationFn: answerSurvey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }),
  });
  if (!due || answer.isSuccess) return null;
  return (
    <Section name="survey" title={t('home.survey.title')}>
      <AppText color="textMuted">{t('home.survey.body')}</AppText>
      <View style={styles.scores}>
        {[1, 2, 3, 4, 5].map((score) => (
          <Pressable
            key={score}
            onPress={() => answer.mutate(score)}
            disabled={answer.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('home.survey.scoreA11y', { score })}
            testID={`home-survey-${score}`}
            style={({ pressed }) => [styles.score, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceRaised : colors.surface }]}
          >
            <AppText variant="bodyStrong">{String(score)}</AppText>
          </Pressable>
        ))}
      </View>
      {answer.error ? <FormMessage text={errorText(answer.error)} testID="home-survey-error" /> : null}
      <AppButton variant="ghost" label={t('common.skip')} onPress={() => answer.mutate(null)} disabled={answer.isPending} testID="home-survey-skip" />
    </Section>
  );
}

/** «Шинэ хувилбар бэлэн» (AC-141): татах хуудас (DEV) эсвэл store руу. */
export function UpdateSection({ data }: { data: Dashboard['update'] }) {
  const t = useT();
  const url = data?.storeUrl ?? data?.downloadUrl ?? null;
  if (!data?.updateAvailable || !url) return null;
  return (
    <Section name="update" title={t('home.update.title')}>
      <AppText color="textMuted">{t('home.update.body', { version: data.latest })}</AppText>
      <AppButton
        label={t('common.update')}
        // Нээж чадаагүй бол хэрэглэгч дараа нь Тохиргооноос шинэчилнэ — нэмэлт алдаа харуулахгүй
        onPress={() => void Linking.openURL(url).catch(() => undefined)}
        testID="home-update-open"
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.input,
  },
  memories: { gap: spacing.sm },
  memory: { width: 120, minHeight: touchTarget, gap: spacing.xxs, padding: spacing.xs, borderRadius: radius.input },
  thumb: { width: 104, height: 104, borderRadius: radius.image },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  scores: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  score: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
