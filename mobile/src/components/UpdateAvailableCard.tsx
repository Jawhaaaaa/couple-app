import { Sparkles } from 'lucide-react-native';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { useVersionQuery } from '@/api/queries/version';
import { isUpdateAvailable, isUpdateRequired, updateUrl } from '@/domain/versionCompare';
import { useT } from '@/i18n';
import { buildInfo } from '@/platform/buildInfo';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Card } from './Card';

/** Вэбэд татах холбоосгүй (сервер буцаахгүй) — хуудсыг дахин ачаалж шинэ bundle авна (SW шинэчлэл — T-83). */
function reloadWeb() {
  (globalThis as { location?: { reload?: () => void } }).location?.reload?.();
}

/** Татах хуудас (DEV) / store (prod) нээх; вэбэд дахин ачаална. Нээж чадаагүй бол чимээгүй (дараа дахин). */
export function openUpdate(url: string | null) {
  if (url) void Linking.openURL(url).catch(() => undefined);
  else if (Platform.OS === 'web') reloadWeb();
}

/**
 * «Шинэ хувилбар бэлэн» карт (FR-17.5, AC-141) — S-20 нүүр ба S-91 «Тухай». `['version']`-ээс
 * (`GET /version?current=`): апп-ын хувилбар `latest`-ээс бага бол гарна; товшвол татах хуудас/store.
 * Шинэчлэх шаардлагатай (S-97) үед бүх апп хаагддаг тул энэ карт хэрэггүй.
 */
export function UpdateAvailableCard({ testID = 'update-available' }: { testID?: string }) {
  const t = useT();
  const colors = useColors();
  const info = useVersionQuery().data;
  const current = buildInfo().version;
  if (!info || !isUpdateAvailable(info, current) || isUpdateRequired(info, current)) return null;
  const url = updateUrl(info);
  // Native-д холбоосгүй бол товшоод очих газаргүй — картыг харуулахгүй (хоосон үйлдэл 0, AC-72)
  if (!url && Platform.OS !== 'web') return null;
  return (
    <Card testID={testID}>
      <View style={styles.row}>
        <Sparkles size={22} color={colors.primary} strokeWidth={iconStroke} />
        <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
          {t('version.availableTitle')}
        </AppText>
      </View>
      <AppText color="textMuted" testID={`${testID}-body`}>
        {t('version.availableBody', { latest: info.latest, current })}
      </AppText>
      <AppButton label={t('version.update')} onPress={() => openUpdate(url)} testID={`${testID}-open`} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
});
