import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ApiRequestError } from '@/api/client';
import { fetchCurrentPolicy, register } from '@/api/queries/auth';
import { birthDateIssue, parseBirthDateInput } from '@/auth/birthDate';
import { deviceTimezone } from '@/auth/device';
import { passwordIssue } from '@/auth/passwordStrength';
import { firstParam, isEmail } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AuthScreen } from '@/components/AuthScreen';
import { BirthDateField } from '@/components/auth/BirthDateField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { PolicyCheckbox } from '@/components/auth/PolicyCheckbox';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { todayIn, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';

const FALLBACK_TIMEZONE = 'Asia/Ulaanbaatar';

/**
 * S-04 Бүртгүүлэх (FR-1.1): нэр, имэйл, нууц үг (хүчний хэмжүүр — AC-164), төрсөн
 * огноо (18+ — AC-04), бодлогын зөвшөөрөл (сонгоогүй бол товч идэвхгүй — AC-63).
 * Зөвшөөрсөн бодлогын хувилбарыг `GET /policies/current`-аас авч илгээнэ.
 */
export default function RegisterScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const { disabled: offline } = useOnlineOnly();
  const params = useLocalSearchParams<{ email?: string }>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(firstParam(params.email) ?? '');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [timezone] = useState(() => deviceTimezone() ?? FALLBACK_TIMEZONE);

  const policy = useQuery({ queryKey: ['policies', locale], queryFn: () => fetchCurrentPolicy(locale), retry: 1 });

  const birthDate = parseBirthDateInput(birth);
  const birthIssue = birthDateIssue(birthDate, todayIn(timezone));
  const pwIssue = passwordIssue(password, email);
  const valid = !!name.trim() && isEmail(email) && !pwIssue && !birthIssue;

  const mutation = useMutation({
    mutationFn: (acceptedPolicyVersion: string) =>
      register({
        email: email.trim(),
        password,
        displayName: name.trim(),
        birthDate: birthDate ?? '',
        locale,
        timezone,
        acceptedPolicyVersion,
      }),
    onSuccess: () => router.push({ pathname: '/verify-email', params: { email: email.trim(), fresh: '1' } }),
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'POLICY_NOT_ACCEPTED') {
        setAccepted(false);
        void policy.refetch();
      }
    },
  });

  /** Талбар засахад серверийн өмнөх алдааг арилгана. */
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (mutation.error) mutation.reset();
  };

  function submit() {
    setSubmitted(true);
    if (!valid || !accepted || !policy.data) return;
    mutation.mutate(policy.data.version);
  }

  const serverCode = mutation.error instanceof ApiRequestError ? mutation.error.code : undefined;
  const nameError = submitted && !name.trim() ? t('auth.validation.nameRequired') : null;
  const emailError = submitted && !isEmail(email) ? t('auth.validation.emailInvalid') : null;
  const passwordError =
    serverCode === 'PASSWORD_WEAK' || serverCode === 'PASSWORD_COMMON'
      ? errorText(mutation.error)
      : submitted && pwIssue
        ? t(`auth.password.${pwIssue}`)
        : null;
  // 18+ мессежийг огноо бүрэн оруулмагц шууд харуулна (AC-04)
  const birthError =
    serverCode === 'AGE_RESTRICTED' || birthIssue === 'underage'
      ? t('auth.validation.ageRestricted')
      : birthIssue === 'invalid'
        ? t('auth.validation.birthDateInvalid')
        : submitted && birthIssue === 'incomplete'
          ? t('auth.validation.birthDateIncomplete')
          : null;
  const fieldServerError = serverCode === 'PASSWORD_WEAK' || serverCode === 'PASSWORD_COMMON' || serverCode === 'AGE_RESTRICTED';
  const formError = mutation.error && !fieldServerError ? errorText(mutation.error) : null;

  return (
    <AuthScreen title={t('auth.register.title')} subtitle={t('auth.register.subtitle')} testID="screen-S-04">
      {offline ? <FormMessage kind="info" text={t('auth.register.offline')} testID="register-offline" /> : null}
      {formError ? <FormMessage text={formError} testID="register-error" /> : null}
      <TextField
        label={t('auth.fields.name')}
        value={name}
        onChangeText={edit(setName)}
        maxLength={50}
        autoComplete="name"
        textContentType="givenName"
        error={nameError}
        testID="register-name"
      />
      <TextField
        label={t('auth.fields.email')}
        value={email}
        onChangeText={edit(setEmail)}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
        error={emailError}
        testID="register-email"
      />
      <TextField
        label={t('auth.fields.password')}
        value={password}
        onChangeText={edit(setPassword)}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        error={passwordError}
        testID="register-password"
      />
      <PasswordStrength password={password} email={email} />
      <BirthDateField value={birth} onChange={edit(setBirth)} error={birthError} />
      {policy.isError ? (
        <>
          <FormMessage text={t('auth.register.policyError')} testID="policy-error" />
          <AppButton variant="secondary" label={t('common.retry')} onPress={() => void policy.refetch()} testID="policy-retry" />
        </>
      ) : null}
      <PolicyCheckbox checked={accepted} onChange={setAccepted} policy={policy.data} />
      <AppButton
        label={t('auth.register.submit')}
        onPress={submit}
        disabled={!accepted || !policy.data || offline}
        loading={mutation.isPending}
        testID="register-submit"
      />
      <AppButton variant="ghost" label={t('auth.register.haveAccount')} onPress={() => router.replace('/login')} testID="register-login" />
    </AuthScreen>
  );
}
