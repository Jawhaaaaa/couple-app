import { ScrollView, StyleSheet } from 'react-native';

import { LockSettings } from '@/components/lock/LockSettings';
import { DeviceSessions } from '@/components/security/DeviceSessions';
import { StackScreen } from '@/components/StackScreen';
import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

/** S-84 Нууцлал ба аюулгүй байдал (FR-14.1, FR-14.3, FR-14.4): апп түгжээ, идэвхтэй төхөөрөмжүүд. */
export default function SecurityScreen() {
  const t = useT();
  return (
    <StackScreen title={t('lock.settings.screenTitle')} testID="screen-S-84">
      <ScrollView contentContainerStyle={styles.body}>
        <LockSettings />
        <DeviceSessions />
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
});
