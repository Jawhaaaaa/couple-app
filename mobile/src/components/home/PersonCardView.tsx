import { StyleSheet, View } from 'react-native';

import type { PersonCard } from '@/api/queries/dashboard';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { formatOffset, localClock } from '@/domain/partnerTime';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { WeatherCard } from './WeatherCard';

interface Props {
  card: PersonCard;
  role: 'me' | 'partner';
  /** Одоогийн агшин (мс) — дэлгэц минут тутам шинэчилнэ. */
  now: number;
}

/**
 * Хүний карт (FR-3.2): нэр, онлайн төлөв (нуугаагүй бол, INV-06), орон нутгийн цаг,
 * хамтрагчийнх бол надаас зөрүү (AC-14), цаг агаар (байхгүй бол нуугдана, AC-71),
 * «Тайван цаг» идэвхтэй бол 🌙 тэмдэг.
 */
export function PersonCardView({ card, role, now }: Props) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const time = localClock(card.utcOffsetMinutes, now, locale);
  const quiet = card.quietUntil && Date.parse(card.quietUntil) > now;
  const online = card.onlineStatus;
  const offset = role === 'partner' ? formatOffset(card.offsetFromMeMinutes, t) : null;
  return (
    <Card testID={`person-${role}`} style={styles.card}>
      <View style={styles.header}>
        {online ? (
          <View
            style={[styles.dot, { backgroundColor: online === 'ONLINE' ? colors.success : colors.tertiary }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={online === 'ONLINE' ? t('home.person.online') : t('home.person.offline')}
            testID={`person-${role}-online-${online}`}
          />
        ) : null}
        <AppText variant="h3" numberOfLines={1} style={styles.flex} testID={`person-${role}-name`}>
          {role === 'me' ? t('home.person.me') : card.name}
        </AppText>
      </View>
      <AppText variant="h2" testID={`person-${role}-time`} accessibilityLabel={t('home.person.timeA11y', { name: card.name, time })}>
        {time}
      </AppText>
      {offset ? (
        <AppText variant="caption" color="textMuted" testID={`person-${role}-offset`}>
          {offset}
        </AppText>
      ) : null}
      <WeatherCard weather={card.weather} testID={`weather-${role}`} />
      {quiet ? (
        <View style={[styles.badge, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} testID={`person-${role}-quiet`}>
          <AppText variant="caption">{t('home.person.quiet')}</AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, width: 'auto', minWidth: 150 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.pill, borderWidth: 1 },
});
