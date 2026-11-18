import { type Href, router } from 'expo-router';
import { CalendarHeart, Camera, type LucideIcon, Smile } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-20-ийн хурдан үйлдэл (NFR-08, AC-198, GAP-21): дурсамж нэмэх, болзоо санал болгох, check-in нь
 * нүүрнээс нэг товшилтоор үүсгэх дэлгэцээ нээнэ — үйлдэл бүр ≤ 3 товшилт (зураг сонгох, хадгалах г.м.).
 * Зүрхний картын доор байрлах тул дэлгэцийн доод 2/3-д орно.
 */
const ACTIONS: { key: 'memory' | 'plan' | 'checkin'; href: Href; Icon: LucideIcon }[] = [
  { key: 'memory', href: '/memory-editor', Icon: Camera },
  { key: 'plan', href: '/plans/new', Icon: CalendarHeart },
  { key: 'checkin', href: '/together/checkin', Icon: Smile },
];

export function QuickActions() {
  const t = useT();
  const colors = useColors();
  return (
    <View style={styles.row} testID="home-quick-actions">
      {ACTIONS.map(({ key, href, Icon }) => (
        <Pressable
          key={key}
          onPress={() => router.push(href)}
          accessibilityRole="button"
          accessibilityLabel={t(`home.quick.${key}`)}
          testID={`home-quick-${key}`}
          style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon size={22} color={colors.primary} strokeWidth={iconStroke} />
          <AppText variant="label" style={styles.label}>
            {t(`home.quick.${key}`)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    minHeight: touchTarget + spacing.lg,
    borderWidth: 1,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  label: { textAlign: 'center' },
});
