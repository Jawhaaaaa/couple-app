import { type Href, router } from 'expo-router';
import { Bell, CircleUser, Database, FileText, Heart, HeartCrack, Info, Lock, Palette, Scale, UserX } from 'lucide-react-native';
import { ScrollView, StyleSheet } from 'react-native';

import { useCoupleQuery } from '@/api/queries/pairing';
import { SettingsRow, SettingsSection } from '@/components/settings/SettingsRow';
import { TabScreen } from '@/components/TabScreen';
import { useT } from '@/i18n';
import { spacing } from '@/theme/tokens';

/**
 * S-80 Тохиргоо (spec §5: Тохиргоо → S-81…S-91): акаунт (S-81 профайл, S-84 нууцлал, S-83 мэдэгдэл,
 * S-85 өгөгдөл), хос (S-82), апп (S-88 харагдах байдал), тухай (S-90 бодлого, S-89 лиценз, S-91 тухай),
 * анхааралтай (S-86 хосоо салгах — хостой үед, S-87 акаунт устгах).
 */
export default function SettingsScreen() {
  const t = useT();
  const couple = useCoupleQuery().data;
  const paired = couple?.kind === 'COUPLE' && couple.status !== 'ORPHANED';
  const go = (href: Href) => () => router.push(href);
  return (
    <TabScreen title={t('common.settings')} testID="screen-S-80">
      <ScrollView contentContainerStyle={styles.list}>
        <SettingsSection title={t('settings.sections.account')}>
          <SettingsRow icon={CircleUser} label={t('settings.profile')} onPress={go('/settings/profile')} testID="settings-profile" />
          <SettingsRow icon={Lock} label={t('settings.security')} onPress={go('/settings/security')} testID="settings-security" />
          <SettingsRow icon={Bell} label={t('settings.notifications')} onPress={go('/settings/notifications')} testID="settings-notifications" />
          <SettingsRow icon={Database} label={t('settings.data')} onPress={go('/settings/data')} testID="settings-data" />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.couple')}>
          <SettingsRow icon={Heart} label={t('settings.couple')} onPress={go('/settings/couple')} testID="settings-couple" />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.app')}>
          <SettingsRow icon={Palette} label={t('settings.appearance')} onPress={go('/settings/appearance')} testID="settings-appearance" />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.about')}>
          <SettingsRow icon={FileText} label={t('settings.policies')} onPress={go('/settings/policies')} testID="settings-policies" />
          <SettingsRow icon={Scale} label={t('settings.licenses')} onPress={go('/settings/licenses')} testID="settings-licenses" />
          <SettingsRow icon={Info} label={t('settings.about')} onPress={go('/settings/about')} testID="settings-about" />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.danger')}>
          {paired ? (
            <SettingsRow icon={HeartCrack} label={t('settings.breakup')} onPress={go('/settings/breakup')} danger testID="settings-breakup" />
          ) : null}
          <SettingsRow icon={UserX} label={t('settings.deleteAccount')} onPress={go('/settings/delete-account')} danger testID="settings-delete-account" />
        </SettingsSection>
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.lg },
});
