import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import type { Me } from '@/api/queries/auth';
import { useMeQuery } from '@/api/queries/bootstrap';
import { mediaThumb } from '@/api/queries/pairing';
import { patchMe } from '@/api/queries/profile';
import { maskBirthDateInput, parseBirthDateInput } from '@/auth/birthDate';
import { deviceTimezone } from '@/auth/device';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { formatPolicyVersion } from '@/components/auth/PolicyCheckbox';
import { AvatarCropper } from '@/components/AvatarCropper';
import { Card } from '@/components/Card';
import { CityPicker } from '@/components/CityPicker';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDate, todayIn, useT } from '@/i18n';
import { draftFromMe, draftIssues, type ProfileDraft, profilePatch } from '@/profile/profileForm';
import { type Locale, usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing, touchTarget } from '@/theme/tokens';

/** `YYYY-MM-DD` → маск `YYYY.MM.DD`. */
const toMasked = (date: string | null) => (date ? date.replace(/-/g, '.') : '');

/**
 * S-81 Профайл тохиргоо (FR-1.4, AC-62): нэр, дуудах нэр, төрсөн огноо, цагийн бүс,
 * мэдэгдлийн хэл, хот (`GET /geo/cities`, 503-д тайлбар), онлайн/бичиж буйг харуулах,
 * профайл зураг (дугуй тайралт, ≤ 10 MB). `PATCH /me` зөвхөн өөрчлөгдсөн талбарыг
 * илгээнэ; хамтрагчид `profile.updated` realtime-аар ≤ 5 с-д хүрнэ. Бодлогын зөвшөөрсөн хувилбар ба огноо
 * (`Me.policyVersionAccepted`, `Me.policyAcceptedAt` — FR-14.9, AC-130), бүтэн текст нь S-90.
 */
export default function ProfileSettingsScreen() {
  const t = useT();
  const errorText = useErrorText();
  const me = useMeQuery();

  if (me.isPending) {
    return (
      <AuthScreen title={t('profileSettings.title')} mascot={false} testID="screen-S-81">
        <ScreenState kind="loading" rows={6} />
      </AuthScreen>
    );
  }
  if (!me.data) {
    return (
      <AuthScreen title={t('profileSettings.title')} mascot={false} testID="screen-S-81">
        <ScreenState kind="error" message={errorText(me.error)} onRetry={() => void me.refetch()} />
      </AuthScreen>
    );
  }
  return <ProfileForm me={me.data} />;
}

function ProfileForm({ me }: { me: Me }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const [initial, setInitial] = useState<ProfileDraft>(() => draftFromMe(me));
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [birthInput, setBirthInput] = useState(() => toMasked(me.birthDate));
  const [deviceZone] = useState(deviceTimezone);
  const [message, setMessage] = useState<'saved' | 'noChanges' | null>(null);

  const issues = draftIssues(draft, todayIn(draft.timezone.trim() || me.timezone));
  const valid = !issues.displayName && !issues.birthDate && !issues.timezone;
  const patch = profilePatch(initial, draft);
  const dirty = Object.keys(patch).length > 0;

  const update = (change: Partial<ProfileDraft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setMessage(null);
  };

  const save = useMutation({
    mutationFn: () => patchMe(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated);
      const next = draftFromMe(updated);
      setInitial(next);
      setDraft(next);
      setBirthInput(toMasked(updated.birthDate));
      setMessage('saved');
    },
  });

  const onSave = () => {
    if (!dirty) {
      setMessage('noChanges');
      return;
    }
    save.mutate();
  };

  const birthError =
    issues.birthDate === 'underage'
      ? t('auth.validation.ageRestricted')
      : issues.birthDate === 'invalid' || issues.birthDate === 'incomplete'
        ? t('auth.validation.birthDateInvalid')
        : null;

  return (
    <AuthScreen title={t('profileSettings.title')} mascot={false} testID="screen-S-81">
      <AvatarCropper currentUri={mediaThumb(me.avatar)} disabled={offline} onSaved={(updated) => queryClient.setQueryData(['me'], updated)} />

      <TextField
        label={t('profileSettings.displayName')}
        value={draft.displayName}
        onChangeText={(displayName) => update({ displayName })}
        maxLength={50}
        error={issues.displayName ? t('profileSettings.displayNameRequired') : null}
        testID="settings-display-name"
      />
      <TextField
        label={t('setup.profile.callName')}
        hint={t('setup.profile.callNameHint')}
        value={draft.callName}
        onChangeText={(callName) => update({ callName })}
        maxLength={50}
        testID="settings-call-name"
      />
      <TextField
        label={t('profileSettings.birthDate')}
        placeholder={t('auth.fields.birthDatePlaceholder')}
        value={birthInput}
        onChangeText={(raw) => {
          const masked = maskBirthDateInput(raw);
          setBirthInput(masked);
          update({ birthDate: parseBirthDateInput(masked) });
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={10}
        error={birthError}
        testID="settings-birth-date"
      />
      <TextField
        label={t('profileSettings.timezone')}
        hint={t('profileSettings.timezoneHint')}
        value={draft.timezone}
        onChangeText={(timezone) => update({ timezone })}
        autoCapitalize="none"
        autoCorrect={false}
        error={issues.timezone ? t('profileSettings.timezoneInvalid') : null}
        testID="settings-timezone"
      />
      {deviceZone && deviceZone !== draft.timezone.trim() ? (
        <AppButton
          variant="ghost"
          label={t('profileSettings.useDeviceZone', { zone: deviceZone })}
          onPress={() => update({ timezone: deviceZone })}
          testID="settings-device-zone"
        />
      ) : null}

      <LocalePicker value={draft.locale} onChange={(locale) => update({ locale })} />

      <CityPicker value={draft.city} onChange={(city) => update({ city, ...(city ? { timezone: city.timezone } : {}) })} disabled={offline} />

      <ToggleRow
        label={t('profileSettings.onlineVisible')}
        value={draft.onlineVisible}
        onChange={(onlineVisible) => update({ onlineVisible })}
        testID="settings-online-visible"
      />
      <ToggleRow
        label={t('profileSettings.typingVisible')}
        value={draft.typingVisible}
        onChange={(typingVisible) => update({ typingVisible })}
        testID="settings-typing-visible"
      />

      <PolicyConsent me={me} />

      {save.error ? <FormMessage text={errorText(save.error)} testID="settings-profile-error" /> : null}
      {message === 'saved' ? <FormMessage kind="success" text={t('profileSettings.saved')} testID="settings-profile-saved" /> : null}
      {message === 'noChanges' ? <FormMessage kind="info" text={t('profileSettings.noChanges')} testID="settings-profile-unchanged" /> : null}
      <AppButton
        label={t('profileSettings.save')}
        onPress={onSave}
        disabled={offline || !valid}
        loading={save.isPending}
        testID="settings-profile-save"
      />
      <AppButton variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} testID="settings-profile-back" />
    </AuthScreen>
  );
}

/** Зөвшөөрсөн бодлогын хувилбар ба огноо (хэрэглэгчийн цагийн бүсээр), S-90 руу холбоос. */
function PolicyConsent({ me }: { me: Me }) {
  const t = useT();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const version = me.policyVersionAccepted;
  const acceptedAt = me.policyAcceptedAt;
  return (
    <Card testID="settings-policy">
      <AppText variant="h3" accessibilityRole="header">
        {t('profileSettings.policyTitle')}
      </AppText>
      {version ? (
        <AppText testID="settings-policy-version">{t('profileSettings.policyVersion', { version: formatPolicyVersion(version, dateFormat) })}</AppText>
      ) : (
        <AppText color="textMuted" testID="settings-policy-none">
          {t('profileSettings.policyNone')}
        </AppText>
      )}
      {version && acceptedAt ? (
        <AppText color="textMuted" testID="settings-policy-accepted-at">
          {t('profileSettings.policyAcceptedAt', { date: formatDate(new Date(acceptedAt), dateFormat, me.timezone) })}
        </AppText>
      ) : null}
      <AppButton variant="secondary" label={t('profileSettings.policyOpen')} onPress={() => router.push('/settings/policies')} testID="settings-policy-open" />
    </Card>
  );
}

function LocalePicker({ value, onChange }: { value: Locale; onChange: (locale: Locale) => void }) {
  const t = useT();
  const colors = useColors();
  const options: { locale: Locale; label: string }[] = [
    { locale: 'mn', label: t('profileSettings.localeMn') },
    { locale: 'en', label: t('profileSettings.localeEn') },
  ];
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={t('profileSettings.locale')}>
      <AppText variant="label" color="textMuted">
        {t('profileSettings.locale')}
      </AppText>
      <View style={styles.segment}>
        {options.map((o) => {
          const selected = o.locale === value;
          return (
            <Pressable
              key={o.locale}
              onPress={() => onChange(o.locale)}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              testID={`settings-locale-${o.locale}`}
              style={[
                styles.segmentItem,
                { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.surfaceRaised : colors.surface },
              ]}
            >
              <AppText variant={selected ? 'label' : 'body'}>{o.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (value: boolean) => void; testID: string }) {
  const colors = useColors();
  return (
    <View style={styles.toggle}>
      <AppText style={styles.flex}>{label}</AppText>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityRole="switch"
        trackColor={{ true: colors.primary, false: colors.border }}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: spacing.xxs },
  segment: { flexDirection: 'row', gap: spacing.xs },
  segmentItem: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.input,
  },
  toggle: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
