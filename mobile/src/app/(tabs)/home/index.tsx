import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

/** S-20 — дэлгэцийн агуулга дараагийн нэгжид; одоохондоо хоосон төлөв (ANIM-11). */
export default function HomeScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const empty = emptyStateText('S-20', locale);
  return (
    <TabScreen title={t('tabs.home')} testID="screen-S-20">
      <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => {}} />
    </TabScreen>
  );
}
