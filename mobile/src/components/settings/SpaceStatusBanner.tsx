import { router } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { daysLeft, readOnlyDeadline } from '@/api/queries/couple';
import { type Couple, useCoupleQuery } from '@/api/queries/pairing';
import { AppText } from '@/components/AppText';
import { useNow } from '@/hooks/useNow';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing, touchTarget } from '@/theme/tokens';

/**
 * Зөвхөн харах/экспорт горимын зурвас (DD-AURA-034) — бүх дэлгэцийн дээд талд:
 * хос тасалсан (`BREAKING`, AC-127 — S-86 руу) эсвэл хамтрагч акаунтаа устгасан
 * (`ORPHANED`, AC-128/GAP-14 — S-85 экспорт руу). Үлдсэн хоногийг харуулна.
 */
export function SpaceStatusBanner() {
  const couple = useCoupleQuery().data;
  if (couple?.status !== 'BREAKING' && couple?.status !== 'ORPHANED') return null;
  // Төлөв солигдох үед шинээр mount хийгдэж `useNow` тэр агшнаас эхэлнэ — апп нээгдэх үеийн хуучин цагаар
  // тоолбол тасалсны дараах эхний минутад «15 хоног» гарч S-86-ийн «14»-тэй зөрдөг байв (AC-185).
  return <ReadOnlyBar key={`${couple.status}:${readOnlyDeadline(couple) ?? ''}`} couple={couple} />;
}

function ReadOnlyBar({ couple }: { couple: Couple }) {
  const t = useT();
  const colors = useColors();
  const now = useNow();
  const orphaned = couple.status === 'ORPHANED';
  const count = daysLeft(readOnlyDeadline(couple), now);
  const text = t(orphaned ? 'spaceBanner.orphaned' : 'spaceBanner.breaking', { count });
  return (
    <Pressable
      onPress={() => router.push(orphaned ? '/settings/data' : '/settings/breakup')}
      accessibilityRole="button"
      accessibilityLabel={`${text} ${t('spaceBanner.open')}`}
      testID={orphaned ? 'space-banner-orphaned' : 'space-banner-breaking'}
      style={({ pressed }) => [styles.bar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <ShieldAlert size={16} color={colors.warning} strokeWidth={iconStroke} />
      <AppText variant="caption" style={styles.text}>
        {text}
      </AppText>
      <AppText variant="caption" color="primary">
        {t('spaceBanner.open')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  text: { flex: 1 },
});
