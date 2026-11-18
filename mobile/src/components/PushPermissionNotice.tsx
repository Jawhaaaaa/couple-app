import { router } from 'expo-router';
import { BellOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { pushPermission, type PushPermission, pushSupport } from '@/pwa/subscribePush';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Card } from './Card';

/**
 * Зөвшөөрлийн төлөв (LLD §4.3 «З — мэдэгдэл → S-101»): push зөвшөөрөгдөөгүй/татгалзсан үед
 * «Мэдэгдэл унтраастай» ба S-101 руу товч. Апп доторх жагсаалт (S-24) үргэлж ажилладаг.
 * Дэмжихгүй хөтөчид (асаах арга байхгүй) харагдахгүй.
 */
export function PushPermissionNotice({ testID = 'push-permission-notice' }: { testID?: string }) {
  const t = useT();
  const colors = useColors();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const support = pushSupport();

  // Системийн тохиргооноос буцаж ирэхэд (апп урд гарах) дахин шалгана
  useEffect(() => {
    let alive = true;
    const check = () => void pushPermission().then((p) => alive && setPermission(p));
    check();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (support === 'unsupported' || permission === null || permission === 'granted') return null;
  return (
    <Card testID={testID}>
      <View style={styles.row}>
        <BellOff size={20} color={colors.textMuted} strokeWidth={iconStroke} />
        <AppText style={styles.flex}>{t(permission === 'denied' ? 'pushPermission.noticeDenied' : 'pushPermission.noticeOff')}</AppText>
      </View>
      <AppButton variant="secondary" label={t('pushPermission.noticeAction')} onPress={() => router.push('/push-permission')} testID={`${testID}-open`} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
