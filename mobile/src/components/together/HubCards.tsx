import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight, Footprints, HeartPulse, Mail, ShieldCheck, Target } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCheckIns } from '@/api/queries/checkins';
import { useGoals } from '@/api/queries/goals';
import { useLetters } from '@/api/queries/letters';
import { useStats } from '@/api/queries/stats';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { GoalCard } from '@/components/together/GoalCard';
import { MOOD_EMOJI } from '@/components/together/MoodPicker';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { addDays, formatDateLong, formatNumber, todayIn, useT } from '@/i18n';
import { useCouplePeople } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** Хабын карт: толгой (дүрс, гарчиг → хэсгийн дэлгэц) + бодит өгөгдөл эсвэл үйлдэлтэй хоосон төлөв. */
function HubCard({ icon: Icon, title, href, testID, children }: { icon: LucideIcon; title: string; href: string; testID: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      <Pressable
        onPress={() => router.push(href as never)}
        accessibilityRole="link"
        accessibilityLabel={title}
        testID={`${testID}-open`}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
        <AppText variant="h3" style={styles.flex}>
          {title}
        </AppText>
        <ChevronRight size={20} color={colors.textMuted} strokeWidth={iconStroke} />
      </Pressable>
      {children}
    </View>
  );
}

/** Daily Resonance (S-69): хамтрагчийн өнөөдөр хуваалцсан сэтгэл ба миний өнөөдрийн check-in. */
export function ResonanceCard() {
  const t = useT();
  const tz = useUserTimezone();
  const today = todayIn(tz);
  const { partner } = useCouplePeople();
  const series = useCheckIns(addDays(today, -6), today);
  const name = partner?.name || t('letters.partnerFallback');
  const partnerToday = series.data?.partner?.find((c) => c.localDate === today);
  const mineToday = series.data?.mine?.find((c) => c.localDate === today);
  return (
    <HubCard icon={HeartPulse} title={t('together.hub.resonance')} href="/together/checkin" testID="hub-resonance">
      <AppText testID="hub-resonance-partner">
        {partnerToday
          ? t('together.hub.partnerMood', { name, emoji: MOOD_EMOJI[partnerToday.level], mood: t(`checkin.level.${partnerToday.level}`) })
          : t('together.hub.partnerNoMood', { name })}
      </AppText>
      {partnerToday?.note ? (
        <AppText variant="quote" numberOfLines={2}>
          {partnerToday.note}
        </AppText>
      ) : null}
      {mineToday ? (
        <AppText variant="caption" color="textMuted" testID="hub-resonance-mine">
          {t('together.hub.myMood', { emoji: MOOD_EMOJI[mineToday.level], mood: t(`checkin.level.${mineToday.level}`) })}
        </AppText>
      ) : (
        <AppButton variant="secondary" label={t('together.hub.checkIn')} onPress={() => router.push('/together/checkin')} testID="hub-resonance-action" />
      )}
    </HubCard>
  );
}

/** Letterbox (S-65): ирэх захидлын тэмдэг (агуулгагүй), уншаагүй захидал; хоосон бол «Захидал бичих». */
export function LetterboxCard() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const tz = useUserTimezone();
  const upcoming = useLetters('upcoming');
  const inbox = useLetters('inbox');
  const next = upcoming.data?.[0];
  const unread = (inbox.data ?? []).filter((l) => l.status === 'DELIVERED').length;
  const when = next ? next.occasionLabel || (next.deliverAt ? formatDateLong(new Date(next.deliverAt), locale, tz) : t('letters.soon')) : null;
  return (
    <HubCard icon={Mail} title={t('together.hub.letterbox')} href="/together/letters" testID="hub-letterbox">
      {when ? <AppText testID="hub-letter-teaser">{t('letters.teaser', { when })}</AppText> : null}
      {unread > 0 ? (
        <Pressable onPress={() => router.push({ pathname: '/together/letters', params: { box: 'inbox' } })} accessibilityRole="link" testID="hub-letter-unread">
          <AppText variant="bodyStrong" color="primary">
            {t('together.hub.unreadLetters', { count: unread })}
          </AppText>
        </Pressable>
      ) : null}
      {!when && unread === 0 ? (
        <AppText color="textMuted" testID="hub-letter-empty">
          {t('together.hub.noLetters')}
        </AppText>
      ) : null}
      <AppButton variant="secondary" label={t('letters.write')} onPress={() => router.push('/together/letters/compose')} testID="hub-letter-write" />
    </HubCard>
  );
}

/** Dreams & Goals (S-63, S-64): идэвхтэй 2 зорилго ба жагсаалтын товчлол. */
export function DreamsCard() {
  const t = useT();
  const goals = useGoals();
  const active = (goals.data ?? []).filter((g) => !g.completedAt).slice(0, 2);
  return (
    <HubCard icon={Target} title={t('together.hub.dreams')} href="/together/goals" testID="hub-dreams">
      <View style={styles.chips}>
        {(['bucket', 'todo', 'wishlist'] as const).map((kind) => (
          <Chip key={kind} label={t(`lists.kind.${kind}`)} onPress={() => router.push({ pathname: '/together/lists', params: { kind } })} testID={`hub-list-${kind}`} />
        ))}
      </View>
      {active.length > 0 ? (
        active.map((g) => <GoalCard key={g.id} goal={g} />)
      ) : (
        <>
          <AppText color="textMuted" testID="hub-goals-empty">
            {t('together.hub.noGoals')}
          </AppText>
          <AppButton variant="secondary" label={t('goals.add')} onPress={() => router.push('/together/goals/new')} testID="hub-goal-add" />
        </>
      )}
    </HubCard>
  );
}

/** Footsteps (S-70, S-71): серверийн бодит тоо — хамт байсан өдөр, дурсамж, болзоо, хот. */
export function FootstepsCard() {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const stats = useStats();
  const s = stats.data;
  const tiles = s
    ? [
        { key: 'days', value: s.daysTogether, label: t('together.hub.days') },
        { key: 'memories', value: s.memories, label: t('together.hub.memories') },
        { key: 'dates', value: s.dates, label: t('together.hub.dates') },
        { key: 'cities', value: s.cities, label: t('together.hub.cities', { countries: s.countries }) },
      ]
    : [];
  return (
    <HubCard icon={Footprints} title={t('together.hub.footsteps')} href="/together/stats" testID="hub-footsteps">
      {stats.isError && !s ? (
        <AppButton variant="ghost" label={t('common.retry')} onPress={() => void stats.refetch()} testID="hub-footsteps-retry" />
      ) : (
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <View key={tile.key} style={[styles.tile, { backgroundColor: colors.surfaceRaised }]} testID={`hub-stat-${tile.key}`}>
              <AppText variant="h2">{formatNumber(tile.value, locale)}</AppText>
              <AppText variant="caption" color="textMuted">
                {tile.label}
              </AppText>
            </View>
          ))}
        </View>
      )}
      <AppButton variant="secondary" label={t('together.hub.openMap')} onPress={() => router.push('/together/map')} testID="hub-open-map" />
    </HubCard>
  );
}

/** Нууцлал ба хамгаалалт (S-84): түгжээ, төхөөрөмж, нууцлал. */
export function PrivacyCard() {
  const t = useT();
  return (
    <HubCard icon={ShieldCheck} title={t('together.hub.privacy')} href="/settings/security" testID="hub-privacy">
      <AppText color="textMuted">{t('together.hub.privacyBody')}</AppText>
    </HubCard>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.input, padding: spacing.sm, gap: 2 },
});
