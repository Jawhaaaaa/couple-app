import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { ApiRequestError } from '@/api/client';
import { partnerName, proposeStartDate, useCoupleQuery } from '@/api/queries/pairing';
import { maskBirthDateInput, parseBirthDateInput } from '@/auth/birthDate';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { FormMessage } from '@/components/FormMessage';
import { StartDateProposals } from '@/components/pairing/StartDateProposals';
import { ScreenState } from '@/components/ScreenState';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { todayIn, useT } from '@/i18n';
import { startDateIssue, startDateView } from '@/pairing/startDate';
import { usePrefsStore } from '@/stores/prefsStore';

/**
 * S-11 Эхэлсэн өдөр (FR-2.3, AC-65): хоёулаа санал болгоно (`PUT /couple/start-date`);
 * зөрвөл хоёр огноо зэрэгцэн харагдаж, хамтрагчийнхыг батлах эсвэл засах боломжтой.
 * Хамтрагчийн өөрчлөлт `couple.updated` realtime-аар `['couple']`-ийг шинэчилнэ.
 * Ирээдүйн огноо хориотой (сервер ч 400).
 */
export default function StartDateScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const couple = useCoupleQuery();
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const propose = useMutation({
    mutationFn: proposeStartDate,
    onSuccess: (updated) => {
      queryClient.setQueryData(['couple'], updated);
      setEditing(false);
      setSubmitted(false);
      setInput('');
    },
  });

  if (couple.isPending) {
    return (
      <AuthScreen title={t('pairing.startDate.title')} mascot={false} testID="screen-S-11">
        <ScreenState kind="loading" rows={2} />
      </AuthScreen>
    );
  }
  if (couple.isError && !couple.data) {
    return (
      <AuthScreen title={t('pairing.startDate.title')} mascot={false} testID="screen-S-11">
        <ScreenState kind="error" message={errorText(couple.error)} onRetry={() => void couple.refetch()} />
      </AuthScreen>
    );
  }

  const data = couple.data;
  const view = startDateView(data);
  const name = partnerName(data) ?? t('pairing.startDate.partnerFallback');
  const date = parseBirthDateInput(input);
  const issue = startDateIssue(date, todayIn(data.timezone));
  const serverIssue = propose.error instanceof ApiRequestError && propose.error.code === 'VALIDATION_FAILED';
  const fieldError =
    issue === 'future'
      ? t('pairing.startDate.future')
      : issue === 'invalid' || (submitted && issue === 'incomplete')
        ? t('pairing.startDate.invalid')
        : null;
  const showForm = view.kind === 'none' || editing;
  const canEdit = !showForm && view.kind !== 'confirmed';

  const submit = () => {
    setSubmitted(true);
    if (issue || !date) return;
    propose.mutate(date);
  };

  return (
    <AuthScreen title={t('pairing.startDate.title')} subtitle={t('pairing.startDate.subtitle')} testID="screen-S-11">
      <StartDateProposals
        view={view}
        partnerName={name}
        dateFormat={dateFormat}
        onAccept={(value) => propose.mutate(value)}
        disabled={offline}
        pending={propose.isPending && !showForm}
      />
      {showForm ? (
        <>
          <TextField
            label={t('pairing.startDate.label')}
            placeholder={t('auth.fields.birthDatePlaceholder')}
            value={input}
            onChangeText={(raw) => setInput(maskBirthDateInput(raw))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10}
            error={fieldError}
            testID="start-date-input"
          />
          <AppButton
            label={t('pairing.startDate.submit')}
            onPress={submit}
            disabled={offline || issue === 'future' || issue === 'invalid'}
            loading={propose.isPending}
            testID="start-date-submit"
          />
        </>
      ) : null}
      {propose.error && !serverIssue ? <FormMessage text={errorText(propose.error)} testID="start-date-error" /> : null}
      {serverIssue ? <FormMessage text={t('pairing.startDate.future')} testID="start-date-error" /> : null}
      {canEdit ? (
        <AppButton variant="secondary" label={t('pairing.startDate.edit')} onPress={() => setEditing(true)} testID="start-date-edit" />
      ) : null}
      <AppButton
        variant={view.kind === 'confirmed' ? 'primary' : 'ghost'}
        label={view.kind === 'confirmed' ? t('pairing.startDate.continue') : t('pairing.startDate.later')}
        onPress={() => router.replace('/')}
        testID="start-date-continue"
      />
    </AuthScreen>
  );
}
