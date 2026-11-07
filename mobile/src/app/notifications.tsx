import { router } from 'expo-router';

import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

/** S-24 Мэдэгдлийн жагсаалт — өгөгдөл T-25-д; одоохондоо хоосон төлөв. */
export default function NotificationsScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const empty = emptyStateText('S-24', locale);
  return (
    <TabScreen title={t('common.notifications')} testID="screen-S-24">
      <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.back()} />
    </TabScreen>
  );
}
