import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { capsuleKey, createCapsule, invalidateCapsules } from '@/api/queries/capsules';
import { AppButton } from '@/components/AppButton';
import { FormMessage } from '@/components/FormMessage';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { CAPSULE_TITLE_MAX } from '@/domain/letters';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { compareCalendarDates, isCalendarDate, todayIn, useT } from '@/i18n';
import { useCouplePeople } from '@/plans/people';
import { spacing } from '@/theme/tokens';

/**
 * S-68 цагийн капсул үүсгэх (FR-10.5, GAP-15): гарчиг, нээх огноо (маргаашаас хойш). Үүсгэгч
 * хамтрагчаа урина — капсул хоёуланд харагдаж тус бүр өөрийн хэсгээ бичиж битүүмжилнэ.
 */
export default function NewCapsuleScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const tz = useUserTimezone();
  const { partner } = useCouplePeople();
  const { disabled: offline } = useOnlineOnly();
  const [title, setTitle] = useState('');
  const [openOn, setOpenOn] = useState('');
  const [errors, setErrors] = useState<{ title?: string; openOn?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next: typeof errors = {};
    if (!title.trim()) next.title = t('capsule.form.titleRequired');
    const date = openOn.trim();
    if (!isCalendarDate(date)) next.openOn = t('capsule.form.dateInvalid');
    else if (compareCalendarDates(date, todayIn(tz)) <= 0) next.openOn = t('capsule.form.dateFuture');
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setError(null);
    try {
      const capsule = await createCapsule(title.trim(), date);
      queryClient.setQueryData(capsuleKey(capsule.id), capsule);
      void invalidateCapsules(queryClient);
      router.replace({ pathname: '/together/capsules/[id]', params: { id: capsule.id } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StackScreen title={t('capsule.form.title')} testID="screen-S-68-new">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error ? <FormMessage text={error} /> : null}
        <FormMessage kind="info" text={t('capsule.form.invite', { name: partner?.name || t('letters.partnerFallback') })} testID="capsule-invite-note" />
        <TextField label={t('capsule.form.name')} value={title} onChangeText={setTitle} maxLength={CAPSULE_TITLE_MAX} error={errors.title} testID="capsule-form-title" />
        <TextField label={t('capsule.form.openOn')} value={openOn} onChangeText={setOpenOn} error={errors.openOn} placeholder="2027-11-07" testID="capsule-form-open-on" />
        <AppButton label={t('capsule.form.save')} onPress={() => void save()} loading={saving} disabled={offline} testID="capsule-form-save" />
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
});
