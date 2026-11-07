import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

/** S-40 — дэлгэцийн агуулга дараагийн нэгжид; одоохондоо хоосон төлөв (ANIM-11). */
export default function ChatScreen() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const empty = emptyStateText('S-40', locale);
  return (
    <TabScreen title={t('tabs.chat')} testID="screen-S-40">
      <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => {}} />
    </TabScreen>
  );
}
