import { Platform, StyleSheet, View } from 'react-native';

import { APPLE_SIGN_IN_ENABLED, GOOGLE_SIGN_IN_ENABLED } from '@/config';
import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

import { AppButton } from '../AppButton';
import { AppText } from '../AppText';

interface Props {
  onGoogle: () => void;
  onApple?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Тест/тохиргоонд дарж бичих (анхдагч — `EXPO_PUBLIC_OAUTH_GOOGLE`). */
  googleEnabled?: boolean;
  appleEnabled?: boolean;
}

/**
 * Google / Apple нэвтрэлт (FR-1.5, AC-06). Google тохируулаагүй бол товч харагдахгүй;
 * Apple нь зөвхөн iOS-д ба энэ гаргалтад идэвхгүй (`APPLE_SIGN_IN_ENABLED=false`).
 */
export function OAuthButtons({
  onGoogle,
  onApple,
  disabled,
  loading,
  googleEnabled = GOOGLE_SIGN_IN_ENABLED,
  appleEnabled = APPLE_SIGN_IN_ENABLED,
}: Props) {
  const t = useT();
  const showApple = appleEnabled && Platform.OS === 'ios' && !!onApple;
  if (!googleEnabled && !showApple) return null;
  return (
    <View style={styles.root}>
      <AppText color="textMuted" style={styles.or}>
        {t('auth.login.or')}
      </AppText>
      {googleEnabled ? (
        <AppButton variant="secondary" label={t('auth.login.google')} onPress={onGoogle} disabled={disabled} loading={loading} testID="login-google" />
      ) : null}
      {showApple ? (
        <AppButton variant="secondary" label={t('auth.login.apple')} onPress={onApple} disabled={disabled} testID="login-apple" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  or: { textAlign: 'center' },
});
