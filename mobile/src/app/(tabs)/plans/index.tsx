import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

/** S-50 — дэлгэцийн агуулга дараагийн нэгжид; одоохондоо хоосон төлөв (ANIM-11). */
export default function PlansScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const empty = emptyStateText('S-50', locale);
  return (
    <TabScreen title={t('tabs.plans')} testID="screen-S-50">
      <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => {}} />
    </TabScreen>
  );
}
