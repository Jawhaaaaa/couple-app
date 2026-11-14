import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { COUNTER_MAX, invalidatePlans, respondToPlan } from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { closeSheet, SheetScreen } from '@/components/SheetScreen';
import { TextField } from '@/components/TextField';
import { isValidTime, tomorrowIn } from '@/domain/planTime';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { isCalendarDate, useT } from '@/i18n';
import { counterOptions, DEFAULT_TIME } from '@/plans/planForm';
import { usePlanFormat } from '@/plans/usePlanFormat';
import { spacing } from '@/theme/tokens';

interface Row {
  date: string;
  time: string;
}

/**
 * S-55 «Өөр цаг» (FR-7.2, AC-33): 1–3 цаг (хэрэглэгчийн бүсээр, UTC болгож илгээнэ) —
 * `POST /plans/{id}/respond COUNTER`. Offline-д идэвхгүй.
 */
export default function CounterSheet() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const { tz } = usePlanFormat();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? '';
  const [rows, setRows] = useState<Row[]>(() => [{ date: tomorrowIn(tz, Date.now()), time: DEFAULT_TIME }]);
  const [showErrors, setShowErrors] = useState(false);
  const send = useMutation({
    mutationFn: (options: string[]) => respondToPlan(id, 'COUNTER', options),
    onSuccess: async () => {
      await invalidatePlans(queryClient);
      closeSheet();
    },
  });
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = () => {
    setShowErrors(true);
    const options = counterOptions(rows, tz);
    if (options) send.mutate(options);
  };

  return (
    <SheetScreen title={t('plans.counter.title')} testID="screen-S-55">
      <AppText color="textMuted">{t('plans.counter.hint')}</AppText>
      {rows.map((row, i) => (
        <View key={i} style={styles.option} testID={`counter-option-${i}`}>
          <AppText variant="label">{t('plans.counter.option', { n: i + 1 })}</AppText>
          <View style={styles.pair}>
            <View style={styles.flex}>
              <TextField
                label={t('plans.form.date')}
                value={row.date}
                onChangeText={(v) => setRow(i, { date: v.trim() })}
                error={showErrors && !isCalendarDate(row.date) ? t('plans.form.dateInvalid') : null}
                testID={`counter-date-${i}`}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label={t('plans.form.time')}
                value={row.time}
                onChangeText={(v) => setRow(i, { time: v.trim() })}
                error={showErrors && !isValidTime(row.time) ? t('plans.form.timeInvalid') : null}
                testID={`counter-time-${i}`}
              />
            </View>
          </View>
          {rows.length > 1 ? (
            <AppButton variant="ghost" label={t('plans.counter.remove')} onPress={() => setRows((rs) => rs.filter((_, j) => j !== i))} testID={`counter-remove-${i}`} />
          ) : null}
        </View>
      ))}
      {rows.length < COUNTER_MAX ? (
        <AppButton
          variant="secondary"
          label={t('plans.counter.add')}
          onPress={() => setRows((rs) => [...rs, { date: rs[rs.length - 1]?.date ?? tomorrowIn(tz, Date.now()), time: DEFAULT_TIME }])}
          testID="counter-add"
        />
      ) : null}
      <AppText variant="caption" color="textMuted">
        {t('plans.form.timezoneNote', { zone: tz })}
      </AppText>
      {send.error ? <FormMessage text={errorText(send.error)} testID="counter-error" /> : null}
      <AppButton label={t('plans.counter.submit')} onPress={submit} loading={send.isPending} disabled={offline || !id} testID="counter-submit" />
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  option: { gap: spacing.xs },
  pair: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
});
