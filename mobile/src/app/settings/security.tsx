import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { LockSettings } from '@/components/lock/LockSettings';
import { DeviceSessions } from '@/components/security/DeviceSessions';
import { StackScreen } from '@/components/StackScreen';
import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

/**
 * S-84 Нууцлал ба аюулгүй байдал (FR-14.1, FR-14.3, FR-14.4): апп түгжээ, идэвхтэй төхөөрөмжүүд.
 * Вэбэд түгжээний хэсэгт S-102 passkey руу холбоос (FR-19.6).
 */
export default function SecurityScreen() {
  const t = useT();
  const passkeySlot =
    Platform.OS === 'web' ? (
      <AppButton variant="secondary" label={t('passkey.open')} onPress={() => router.push('/settings/passkey')} testID="lock-passkey-open" />
    ) : undefined;
  return (
    <StackScreen title={t('lock.settings.screenTitle')} testID="screen-S-84">
      <ScrollView contentContainerStyle={styles.body}>
        <LockSettings passkeySlot={passkeySlot} />
        <DeviceSessions />
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
});
