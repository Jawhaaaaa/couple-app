import { router } from 'expo-router';
import { FileText, Scale } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Mascot } from '@/components/Mascot';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { StackScreen } from '@/components/StackScreen';
import { UpdateAvailableCard } from '@/components/UpdateAvailableCard';
import { useT } from '@/i18n';
import { buildInfo } from '@/platform/buildInfo';
import { spacing } from '@/theme/tokens';

/**
 * S-91 Aura-гийн тухай (FR-18.7, AC-190): semver + build + commit SHA (build-ийн бодит SHA —
 * `EXPO_PUBLIC_COMMIT_SHA`) ба «Шинэ хувилбар бэлэн» карт (`['version']`, AC-141) — товшвол татах хуудас/store.
 */
export default function AboutScreen() {
  const t = useT();
  const info = buildInfo();
  return (
    <StackScreen title={t('about.title')} testID="screen-S-91">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Mascot size={96} pose="wave" />
          <AppText variant="display">{t('app.name')}</AppText>
          <AppText color="textMuted">{t('app.tagline')}</AppText>
        </View>
        <Card testID="about-build">
          <InfoRow label={t('about.version')} value={info.version} testID="about-version" />
          <InfoRow label={t('about.build')} value={info.build} testID="about-build-number" />
          <InfoRow label={t('about.commit')} value={info.commit} testID="about-commit" />
        </Card>
        <UpdateAvailableCard testID="about-update" />
        <SettingsRow icon={FileText} label={t('about.policies')} onPress={() => router.push('/settings/policies')} testID="about-policies" />
        <SettingsRow icon={Scale} label={t('about.licenses')} onPress={() => router.push('/settings/licenses')} testID="about-licenses" />
      </ScrollView>
    </StackScreen>
  );
}

function InfoRow({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText color="textMuted" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" selectable testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  flex: { flex: 1 },
});
