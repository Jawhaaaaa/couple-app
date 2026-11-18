import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createGoal, GOAL_MAX_STEPS, GOAL_TITLE_MAX, goalKey, invalidateGoals } from '@/api/queries/goals';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { parseAmount } from '@/domain/goalProgress';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { isCalendarDate, useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** S-64 зорилго тавих (FR-9.3, 9.4): гарчиг, алхмууд, заавал биш мөнгөн зорилт ба огноо. */
export default function NewGoalScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [step, setStep] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ title?: string; amount?: string; date?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    const s = step.trim();
    if (!s || steps.length >= GOAL_MAX_STEPS) return;
    setSteps([...steps, s.slice(0, GOAL_TITLE_MAX)]);
    setStep('');
  };

  const save = async () => {
    const next: typeof errors = {};
    if (!title.trim()) next.title = t('goals.form.titleRequired');
    const target = amount.trim() ? parseAmount(amount) : null;
    if (amount.trim() && target === null) next.amount = t('goals.form.amountInvalid');
    if (targetDate.trim() && !isCalendarDate(targetDate.trim())) next.date = t('goals.form.dateInvalid');
    setErrors(next);
    if (Object.keys(next).length) return;
    const allSteps = step.trim() ? [...steps, step.trim()] : steps;
    setSaving(true);
    setError(null);
    try {
      const goal = await createGoal({
        title: title.trim(),
        steps: allSteps,
        ...(target ? { targetAmountMnt: target } : {}),
        ...(targetDate.trim() ? { targetDate: targetDate.trim() } : {}),
      });
      queryClient.setQueryData(goalKey(goal.id), goal);
      void invalidateGoals(queryClient);
      router.replace({ pathname: '/together/goals/[id]', params: { id: goal.id } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StackScreen title={t('goals.form.title')} testID="screen-S-64-new">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error ? <FormMessage text={error} /> : null}
        <TextField label={t('goals.form.name')} value={title} onChangeText={setTitle} maxLength={GOAL_TITLE_MAX} error={errors.title} testID="goal-form-title" />
        <TextField
          label={t('goals.form.amount')}
          hint={t('goals.form.amountHint')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          error={errors.amount}
          testID="goal-form-amount"
        />
        <TextField label={t('goals.form.date')} value={targetDate} onChangeText={setTargetDate} error={errors.date} testID="goal-form-date" />
        <AppText variant="h3" accessibilityRole="header">
          {t('goals.steps')}
        </AppText>
        {steps.map((s, i) => (
          <View key={`${i}-${s}`} style={[styles.step, { borderColor: colors.border }]} testID={`goal-form-step-${i}`}>
            <AppText style={styles.flex}>{s}</AppText>
            <Pressable
              onPress={() => setSteps(steps.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={t('goals.removeStep')}
              style={styles.icon}
              testID={`goal-form-step-remove-${i}`}
            >
              <X size={18} color={colors.textMuted} strokeWidth={iconStroke} />
            </Pressable>
          </View>
        ))}
        <TextField label={t('goals.newStep')} value={step} onChangeText={setStep} onSubmitEditing={addStep} maxLength={GOAL_TITLE_MAX} testID="goal-form-step" />
        <AppButton variant="secondary" label={t('goals.addStep')} onPress={addStep} disabled={!step.trim()} testID="goal-form-step-add" />
        <AppButton label={t('goals.form.save')} onPress={() => void save()} loading={saving} disabled={offline} testID="goal-form-save" />
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  step: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.input, paddingLeft: spacing.sm },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
