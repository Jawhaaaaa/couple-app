import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  ANNIVERSARY_KINDS,
  type Anniversary,
  type AnniversaryKind,
  createAnniversary,
  deleteAnniversary,
  invalidateOccasions,
  OCCASION_NOTE_MAX,
  REMINDER_OPTIONS,
  updateAnniversary,
  useAnniversary,
} from '@/api/queries/anniversaries';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { isCalendarDate, useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const TITLE_MAX = 120;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

interface Form {
  title: string;
  date: string;
  kind: AnniversaryKind;
  recurring: boolean;
  note: string;
  reminderDays: number[];
}

function formFrom(a: Anniversary | undefined): Form {
  if (!a) return { title: '', date: '', kind: 'ANNIVERSARY', recurring: true, note: '', reminderDays: [7, 1, 0] };
  return { title: a.title, date: a.date, kind: a.kind, recurring: a.recurring, note: a.note ?? '', reminderDays: a.reminderDays };
}

/**
 * S-62 ой нэмэх/засах (`?id`, FR-8.1, FR-8.4, AC-181): нэр, огноо, төрөл («Анх уулзсан» г.м.),
 * жил бүр давтагдах эсэх, сануулга 7/1/0, тэмдэглэл.
 */
export default function OccasionEditScreen() {
  const t = useT();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = first(params.id);
  const existing = useAnniversary(id);
  let body;
  if (!id) body = <EditForm />;
  else if (existing.data) body = <EditForm anniversary={existing.data} />;
  else if (existing.isError) body = <ScreenState kind="error" message={errorText(existing.error)} onRetry={() => void existing.refetch()} />;
  else body = <ScreenState kind="loading" rows={3} />;
  return (
    <StackScreen title={id ? t('occasions.editor.editTitle') : t('occasions.editor.newTitle')} testID="screen-S-62">
      {body}
    </StackScreen>
  );
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/together/occasions');
}

function EditForm({ anniversary }: { anniversary?: Anniversary }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const [form, setForm] = useState<Form>(() => formFrom(anniversary));
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const titleError = showErrors && !form.title.trim();
  const dateError = showErrors && !isCalendarDate(form.date.trim());

  const save = useMutation({
    mutationFn: () => {
      const note = form.note.trim();
      const base = { title: form.title.trim(), date: form.date.trim(), kind: form.kind, recurring: form.recurring, reminderDays: form.reminderDays };
      return anniversary
        ? updateAnniversary(anniversary.id, { ...base, note: note || null, version: anniversary.version })
        : createAnniversary({ ...base, ...(note ? { note } : {}) });
    },
    onSuccess: async () => {
      await invalidateOccasions(queryClient);
      leave();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteAnniversary(anniversary?.id ?? ''),
    onSuccess: async () => {
      setConfirmDelete(false);
      await invalidateOccasions(queryClient);
      router.replace('/together/occasions');
    },
  });
  const submit = () => {
    setShowErrors(true);
    if (form.title.trim() && isCalendarDate(form.date.trim())) save.mutate();
  };
  const toggleReminder = (d: number) =>
    update({ reminderDays: form.reminderDays.includes(d) ? form.reminderDays.filter((x) => x !== d) : [...form.reminderDays, d].sort((a, b) => b - a) });

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <TextField
        label={t('occasions.editor.title')}
        value={form.title}
        onChangeText={(v) => update({ title: v.slice(0, TITLE_MAX) })}
        error={titleError ? t('occasions.editor.titleRequired') : null}
        testID="occasion-form-title"
      />
      <TextField
        label={t('occasions.editor.date')}
        value={form.date}
        onChangeText={(v) => update({ date: v.trim() })}
        autoCorrect={false}
        error={dateError ? t('occasions.editor.dateInvalid') : null}
        testID="occasion-form-date"
      />
      <AppText variant="label" color="textMuted">
        {t('occasions.editor.kind')}
      </AppText>
      <ChipRow wrap>
        {ANNIVERSARY_KINDS.map((k) => (
          <Chip key={k} label={t(`occasions.kind.${k}`)} selected={form.kind === k} onPress={() => update({ kind: k })} testID={`occasion-form-kind-${k}`} />
        ))}
      </ChipRow>
      <View style={styles.row}>
        <AppText style={styles.flex}>{t('occasions.editor.recurring')}</AppText>
        <Switch
          value={form.recurring}
          onValueChange={(recurring) => update({ recurring })}
          trackColor={{ true: colors.primary, false: colors.border }}
          accessibilityLabel={t('occasions.editor.recurring')}
          testID="occasion-form-recurring"
        />
      </View>
      <AppText variant="label" color="textMuted">
        {t('occasions.reminders')}
      </AppText>
      <ChipRow wrap>
        {REMINDER_OPTIONS.map((d) => (
          <Chip key={d} label={t(`occasions.reminder.r${d}`)} selected={form.reminderDays.includes(d)} onPress={() => toggleReminder(d)} testID={`occasion-form-reminder-${d}`} />
        ))}
      </ChipRow>
      <TextField
        label={t('occasions.editor.note')}
        value={form.note}
        onChangeText={(v) => update({ note: v.slice(0, OCCASION_NOTE_MAX) })}
        multiline
        testID="occasion-form-note"
      />
      {save.error ? <FormMessage text={errorText(save.error)} testID="occasion-form-error" /> : null}
      <AppButton label={t('occasions.editor.save')} onPress={submit} loading={save.isPending} disabled={offline} testID="occasion-form-save" />
      {anniversary ? <AppButton variant="ghost" label={t('occasions.editor.delete')} onPress={() => setConfirmDelete(true)} disabled={offline} testID="occasion-form-delete" /> : null}
      <ConfirmSheet
        visible={confirmDelete}
        title={t('occasions.editor.deleteTitle')}
        confirmLabel={t('occasions.editor.delete')}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
        loading={remove.isPending}
        testID="occasion-delete-confirm"
      >
        {remove.error ? <FormMessage text={errorText(remove.error)} testID="occasion-delete-error" /> : null}
      </ConfirmSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  flex: { flex: 1 },
});
