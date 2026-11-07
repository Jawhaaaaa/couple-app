import { View } from 'react-native';

import { TabScreen } from '@/components/TabScreen';
import { useT } from '@/i18n';

/** S-80 Тохиргоо — бүлгүүдийн жагсаалт T-79-д. */
export default function SettingsScreen() {
  const t = useT();
  return (
    <TabScreen title={t('common.settings')} testID="screen-S-80">
      <View />
    </TabScreen>
  );
}
