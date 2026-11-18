import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { fetchCurrentPolicy } from '@/api/queries/auth';
import { useMeQuery } from '@/api/queries/bootstrap';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { formatPolicyVersion } from '@/components/auth/PolicyCheckbox';
import { Card } from '@/components/Card';
import { MarkdownText } from '@/components/MarkdownText';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { StackScreen } from '@/components/StackScreen';
import { useErrorText } from '@/hooks/useErrorText';
import { formatDate, useT } from '@/i18n';
import { type Locale, usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

type Doc = 'privacy' | 'terms';

/**
 * S-90 Нууцлалын бодлого ба нөхцөл — тохиргооноос унших (FR-14.2, FR-14.9, AC-130): `GET /policies/current?locale`
 * бодит текстийг Монгол/Англиар (апп-ын хэлээр эхэлнэ, дэлгэц дээрээ сольж болно), бодлого/нөхцөл гэсэн хоёр
 * хэсэгтэй, markdown-ыг гарчиг, догол мөрөөр. Профайлын (`Me.policyVersionAccepted`) зөвшөөрсөн хувилбарыг
 * харуулж, одоогийнхоос хуучин бол шинэ хувилбарын хаалга (`(auth)/policy-update.tsx`, AC-63) руу хөтөлнө.
 */
export default function PoliciesScreen() {
  const t = useT();
  const errorText = useErrorText();
  const appLocale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const [locale, setLocale] = useState<Locale>(appLocale);
  const [doc, setDoc] = useState<Doc>('privacy');
  const me = useMeQuery().data;
  const policy = useQuery({ queryKey: ['policies', locale], queryFn: () => fetchCurrentPolicy(locale), placeholderData: (prev) => prev });

  let body;
  if (policy.isPending) body = <ScreenState kind="loading" rows={6} />;
  else if (policy.isError) body = <ScreenState kind="error" message={errorText(policy.error)} onRetry={() => void policy.refetch()} />;
  else {
    const current = policy.data;
    const accepted = me?.policyVersionAccepted ?? null;
    const outdated = !!me && (me.policyUpdateRequired || (accepted !== null && accepted !== current.version));
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <Card testID="policies-status">
          <AppText variant="bodyStrong" testID="policies-accepted">
            {accepted ? t('policy.accepted', { version: formatPolicyVersion(accepted, dateFormat) }) : t('policy.notAccepted')}
          </AppText>
          <AppText color="textMuted" testID="policies-current">
            {t('policy.current', {
              version: formatPolicyVersion(current.version, dateFormat),
              date: formatDate(new Date(current.publishedAt), dateFormat),
            })}
          </AppText>
          {outdated ? (
            <>
              <AppText color="textMuted">{t('policy.outdated')}</AppText>
              <AppButton label={t('policy.reviewNew')} onPress={() => router.push('/policy-update')} testID="policies-review-new" />
            </>
          ) : null}
        </Card>
        <SegmentedTabs
          options={[
            { key: 'mn', label: t('policy.langMn') },
            { key: 'en', label: t('policy.langEn') },
          ]}
          value={locale}
          onChange={setLocale}
          testID="policies-locale"
        />
        <SegmentedTabs
          options={[
            { key: 'privacy', label: t('auth.policyUpdate.privacy') },
            { key: 'terms', label: t('auth.policyUpdate.terms') },
          ]}
          value={doc}
          onChange={setDoc}
          testID="policies-doc"
        />
        <MarkdownText markdown={doc === 'privacy' ? current.privacyMarkdown : current.termsMarkdown} testID={`policies-${doc}`} />
      </ScrollView>
    );
  }

  return (
    <StackScreen title={t('settings.policies')} testID="screen-S-90">
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
