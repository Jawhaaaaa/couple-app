import { Platform, StyleSheet, View } from 'react-native';

import { useVersionQuery } from '@/api/queries/version';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Mascot } from '@/components/Mascot';
import { openUpdate } from '@/components/UpdateAvailableCard';
import { updateUrl } from '@/domain/versionCompare';
import { useT } from '@/i18n';
import { buildInfo } from '@/platform/buildInfo';
import { useColors } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * S-97 Шинэчлэх шаардлагатай (spec §6.1, R-2, FR-17.5): серверийн `minVersion` апп-аас шинэ бол бүх апп
 * хаагдана — `SplashGate` (`_layout.tsx`) навигацийн оронд зөвхөн энэ дэлгэцийг рендэрлэнэ, буцах зам
 * байхгүй. Товч нь татах хуудас (DEV) / store (prod) нээнэ; вэбэд дахин ачаална.
 */
export default function UpdateRequiredScreen() {
  const t = useT();
  const colors = useColors();
  const info = useVersionQuery().data;
  const url = updateUrl(info);
  const canAct = !!url || Platform.OS === 'web';
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="screen-S-97" accessibilityRole="alert">
      <Mascot size={110} pose="tilt" />
      <AppText variant="h2" style={styles.text}>
        {t('version.requiredTitle')}
      </AppText>
      <AppText color="textMuted" style={styles.text}>
        {t('version.requiredBody')}
      </AppText>
      {info ? (
        <AppText variant="caption" color="textMuted" style={styles.text} testID="update-required-versions">
          {t('version.requiredVersions', { current: buildInfo().version, min: info.minVersion })}
        </AppText>
      ) : null}
      {canAct ? (
        <AppButton label={t('version.update')} onPress={() => openUpdate(url)} testID="update-required-open" />
      ) : (
        <AppText color="textMuted" style={styles.text} testID="update-required-store-hint">
          {t('version.storeHint')}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  text: { textAlign: 'center', maxWidth: 480 },
});
