import { StyleSheet, View } from 'react-native';

import { passwordStrength } from '@/auth/passwordStrength';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from '../AppText';

const BARS = [1, 2, 3, 4] as const;

/** Нууц үгийн хүчний хэмжүүр (AC-164): 4 зураас + шалтгаан/түвшин. */
export function PasswordStrength({ password, email }: { password: string; email?: string }) {
  const colors = useColors();
  const t = useT();
  if (!password) return null;
  const { score, issue } = passwordStrength(password, email);
  const tone = score <= 1 ? colors.danger : score === 2 ? colors.warning : colors.success;
  const level = t(`auth.password.level${score}`);
  const text = issue ? t(`auth.password.${issue}`) : t('auth.password.meter', { level });
  return (
    <View style={styles.root} testID="password-strength">
      <View
        style={styles.bars}
        accessibilityRole="progressbar"
        accessibilityLabel={t('auth.password.meter', { level })}
        accessibilityValue={{ min: 0, max: 4, now: score }}
      >
        {BARS.map((n) => (
          <View key={n} style={[styles.bar, { backgroundColor: n <= score ? tone : colors.border }]} />
        ))}
      </View>
      <AppText
        variant="caption"
        color={issue ? 'danger' : 'textMuted'}
        accessibilityLiveRegion="polite"
        testID={issue ? 'password-issue' : 'password-level'}
      >
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xxs },
  bars: { flexDirection: 'row', gap: spacing.xxs },
  bar: { flex: 1, height: 4, borderRadius: radius.pill },
});
