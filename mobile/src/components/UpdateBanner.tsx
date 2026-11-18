import { Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { usePwaStore } from '@/pwa/pwaStore';
import { applyUpdate } from '@/pwa/registerSW';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

/**
 * «Шинэ хувилбар бэлэн — шинэчлэх» (FR-19.9, AC-191): шинэ service worker `waiting` төлөвт орсон
 * үед бүх дэлгэцийн дээд талд. Товшвол ноорог хадгалагдсан хэвээр дахин ачаална (`applyUpdate`).
 */
export function UpdateBanner() {
  const t = useT();
  const colors = useColors();
  const waiting = usePwaStore((s) => s.waiting);
  const [busy, setBusy] = useState(false);
  if (!waiting) return null;
  const update = async () => {
    setBusy(true);
    if (!(await applyUpdate())) setBusy(false);
  };
  return (
    <View style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} accessibilityRole="alert" testID="pwa-update-banner">
      <Sparkles size={16} color={colors.primary} strokeWidth={iconStroke} />
      <AppText variant="caption" style={styles.text}>
        {t('pwa.update.ready')}
      </AppText>
      <AppButton variant="ghost" label={t('pwa.update.action')} onPress={() => void update()} loading={busy} testID="pwa-update-apply" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.screen, borderBottomWidth: 1 },
  text: { flex: 1 },
});
