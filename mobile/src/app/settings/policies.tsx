import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet } from 'react-native';

import { fetchCurrentPolicy } from '@/api/queries/auth';
import { useMeQuery } from '@/api/queries/bootstrap';
import { PolicyText } from '@/components/auth/PolicyCheckbox';
import { AppText } from '@/components/AppText';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

/**
 * S-90 Нууцлалын бодлого ба нөхцөл — тохиргооноос унших (FR-14.2, FR-14.9, AC-130): одоогийн хэлээр,
 * миний зөвшөөрсөн хувилбартай. Шинэ хувилбарын хаалга нь `(auth)/policy-update.tsx`.
 */
export default function PoliciesScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const me = useMeQuery().data;
  const policy = useQuery({ queryKey: ['policies', locale], queryFn: () => fetchCurrentPolicy(locale) });

  let body;
  if (policy.isPending) body = <ScreenState kind="loading" rows={6} />;
  else if (policy.isError) body = <ScreenState kind="error" message={errorText(policy.error)} onRetry={() => void policy.refetch()} />;
  else
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <AppText color="textMuted" testID="policies-accepted">
          {me?.policyVersionAccepted
            ? t('settings.policiesAccepted', { version: me.policyVersionAccepted })
            : t('settings.policiesNotAccepted')}
        </AppText>
        <PolicyText policy={policy.data} maxHeight={2000} />
      </ScrollView>
    );

  return (
    <StackScreen title={t('settings.policies')} testID="screen-S-90">
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
});
