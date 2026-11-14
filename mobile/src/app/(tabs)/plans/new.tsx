import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  CATEGORIES,
  createPlan,
  type DatePlan,
  invalidatePlans,
  type PlanScope,
  RECURRENCES,
  TITLE_MAX,
  updatePlan,
  usePlan,
} from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { CityPicker } from '@/components/CityPicker';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { tomorrowIn } from '@/domain/planTime';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import {
  applyPlanDraft,
  buildPlanCreate,
  buildPlanUpdate,
  emptyPlanForm,
  parsePlanDraft,
  type PlanForm,
  planFormFrom,
  REMINDER_DAY,
  REMINDER_HOUR,
  validatePlanForm,
} from '@/plans/planForm';
import { usePlanFormat } from '@/plans/usePlanFormat';
import { spacing } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * S-54 болзоо төлөвлөх/засах (FR-7.2, FR-7.4, FR-7.10): гарчиг, огноо+цаг (хэрэглэгчийн
 * бүсээр — UTC болгож илгээнэ, AC-34), газар, төсөв, сануулга, давталт, бэлтгэлийн жагсаалт.
 * `?draft=` — санаа/wishlist-ээс бөглөгдсөн (AC-110); `?id` — засвар.
 */
export default function PlanFormScreen() {
  const t = useT();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ id?: string; occurrenceOn?: string; draft?: string }>();
  const id = first(params.id);
  const occurrenceOn = first(params.occurrenceOn) ?? null;
  const existing = usePlan(id, occurrenceOn);
  const title = id ? t('plans.form.editTitle') : t('plans.form.newTitle');
  let body;
  if (!id) body = <PlanFormBody draft={first(params.draft)} />;
  else if (existing.data) body = <PlanFormBody plan={existing.data} occurrenceOn={occurrenceOn} />;
  else if (existing.isError) body = <ScreenState kind="error" message={errorText(existing.error)} onRetry={() => void existing.refetch()} />;
  else body = <ScreenState kind="loading" rows={4} />;
  return (
    <StackScreen title={title} testID="screen-S-54-form">
      {body}
    </StackScreen>
  );
}

function PlanFormBody({ plan, occurrenceOn = null, draft }: { plan?: DatePlan; occurrenceOn?: string | null; draft?: string }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const { tz } = usePlanFormat();
  const [clientId] = useState(() => uuidv7());
  const [form, setForm] = useState<PlanForm>(() =>
    plan ? planFormFrom(plan, tz) : applyPlanDraft(emptyPlanForm(tomorrowIn(tz, Date.now())), parsePlanDraft(draft)),
  );
  const [checkItem, setCheckItem] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const recurringEdit = !!plan && plan.recurrence !== 'NONE' && !!occurrenceOn;
  const [scope, setScope] = useState<PlanScope>(recurringEdit ? 'OCCURRENCE' : 'SERIES');
  const errors = showErrors ? validatePlanForm(form) : [];
  const update = (patch: Partial<PlanForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      plan ? updatePlan(plan.id, buildPlanUpdate(form, tz, plan.version, scope, occurrenceOn)) : createPlan(buildPlanCreate(form, tz, clientId)),
    onSuccess: async (saved) => {
      await invalidatePlans(queryClient);
      if (plan) {
        if (router.canGoBack()) router.back();
        return;
      }
      router.replace({ pathname: '/plans/[id]', params: { id: saved.id } });
    },
  });

  const submit = () => {
    setShowErrors(true);
    if (validatePlanForm(form).length === 0) save.mutate();
  };

  const toggleReminder = (minutes: number) =>
    update({ reminderOffsets: form.reminderOffsets.includes(minutes) ? form.reminderOffsets.filter((m) => m !== minutes) : [...form.reminderOffsets, minutes] });

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <TextField
        label={t('plans.form.title')}
        value={form.title}
        onChangeText={(v) => update({ title: v.slice(0, TITLE_MAX) })}
        error={errors.includes('TITLE') ? t('plans.form.titleRequired') : null}
        testID="plan-form-title"
      />
      <TextField
        label={t('plans.form.description')}
        value={form.description}
        onChangeText={(v) => update({ description: v })}
        multiline
        testID="plan-form-description"
      />
      <AppText variant="label" color="textMuted">
        {t('plans.form.category')}
      </AppText>
      <ChipRow>
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={t(`plans.category.${c}`)}
            selected={form.category === c}
            onPress={() => update({ category: form.category === c ? null : c })}
            testID={`plan-form-category-${c}`}
          />
        ))}
      </ChipRow>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <TextField
            label={t('plans.form.date')}
            value={form.date}
            onChangeText={(v) => update({ date: v.trim() })}
            autoCorrect={false}
            error={errors.includes('DATE') ? t('plans.form.dateInvalid') : null}
            testID="plan-form-date"
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={t('plans.form.time')}
            value={form.time}
            onChangeText={(v) => update({ time: v.trim() })}
            autoCorrect={false}
            error={errors.includes('TIME') ? t('plans.form.timeInvalid') : null}
            testID="plan-form-time"
          />
        </View>
      </View>
      <AppText variant="caption" color="textMuted" testID="plan-form-timezone">
        {t('plans.form.timezoneNote', { zone: tz })}
      </AppText>
      <TextField
        label={t('plans.form.venue')}
        hint={t('plans.form.venueHint')}
        value={form.venue}
        onChangeText={(v) => update({ venue: v.slice(0, 200) })}
        error={errors.includes('PLACE') ? t('plans.form.placeNeedsCity') : null}
        testID="plan-form-venue"
      />
      <CityPicker value={form.city} onChange={(city) => update({ city })} disabled={offline} />
      <TextField
        label={t('plans.form.budget')}
        value={form.budget}
        onChangeText={(v) => update({ budget: v.replace(/[^\d\s]/g, '') })}
        keyboardType="number-pad"
        error={errors.includes('BUDGET') ? t('plans.form.budgetInvalid') : null}
        testID="plan-form-budget"
      />
      <AppText variant="label" color="textMuted">
        {t('plans.form.reminders')}
      </AppText>
      <ChipRow wrap>
        <Chip label={t('plans.form.reminderDay')} selected={form.reminderOffsets.includes(REMINDER_DAY)} onPress={() => toggleReminder(REMINDER_DAY)} testID="plan-form-reminder-day" />
        <Chip label={t('plans.form.reminderHour')} selected={form.reminderOffsets.includes(REMINDER_HOUR)} onPress={() => toggleReminder(REMINDER_HOUR)} testID="plan-form-reminder-hour" />
      </ChipRow>
      {!recurringEdit || scope === 'SERIES' ? (
        <>
          <AppText variant="label" color="textMuted">
            {t('plans.form.recurrence')}
          </AppText>
          <ChipRow wrap>
            {RECURRENCES.map((r) => (
              <Chip key={r} label={t(`plans.recurrence.${r}`)} selected={form.recurrence === r} onPress={() => update({ recurrence: r })} testID={`plan-form-recurrence-${r}`} />
            ))}
          </ChipRow>
          {form.recurrence !== 'NONE' ? (
            <TextField
              label={t('plans.form.until')}
              value={form.until}
              onChangeText={(v) => update({ until: v.trim() })}
              error={errors.includes('UNTIL') ? t('plans.form.dateInvalid') : null}
              testID="plan-form-until"
            />
          ) : null}
        </>
      ) : null}
      {recurringEdit ? (
        <>
          <AppText variant="label" color="textMuted">
            {t('plans.form.scope')}
          </AppText>
          <ChipRow wrap>
            <Chip label={t('plans.form.scopeOne')} selected={scope === 'OCCURRENCE'} onPress={() => setScope('OCCURRENCE')} testID="plan-form-scope-one" />
            <Chip label={t('plans.form.scopeAll')} selected={scope === 'SERIES'} onPress={() => setScope('SERIES')} testID="plan-form-scope-all" />
          </ChipRow>
        </>
      ) : null}
      {!plan ? (
        <>
          <AppText variant="label" color="textMuted">
            {t('plans.form.checklist')}
          </AppText>
          {form.checklist.map((item, i) => (
            <Chip
              key={`${item}-${i}`}
              label={item}
              selected
              onPress={() => update({ checklist: form.checklist.filter((_, j) => j !== i) })}
              accessibilityLabel={`${t('plans.checklist.remove')}: ${item}`}
              testID={`plan-form-check-${i}`}
            />
          ))}
          <View style={styles.pair}>
            <View style={styles.flex}>
              <TextField
                label={t('plans.checklist.itemLabel')}
                placeholder={t('plans.checklist.placeholder')}
                value={checkItem}
                onChangeText={(v) => setCheckItem(v.slice(0, 200))}
                testID="plan-form-check-input"
              />
            </View>
            <AppButton
              variant="secondary"
              label={t('plans.checklist.add')}
              disabled={!checkItem.trim()}
              onPress={() => {
                update({ checklist: [...form.checklist, checkItem.trim()] });
                setCheckItem('');
              }}
              testID="plan-form-check-add"
            />
          </View>
        </>
      ) : null}
      {save.error ? <FormMessage text={errorText(save.error)} testID="plan-form-error" /> : null}
      <AppButton
        label={plan ? t('plans.form.save') : t('plans.form.submit')}
        onPress={submit}
        loading={save.isPending}
        disabled={offline}
        testID="plan-form-submit"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  pair: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-end' },
  flex: { flex: 1 },
});
