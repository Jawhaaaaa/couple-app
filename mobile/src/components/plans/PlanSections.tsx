import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, CloudSun, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  addChecklistItem,
  addExpense,
  type ChecklistItem,
  checklistProgress,
  chooseOption,
  type DatePlan,
  deleteChecklistItem,
  invalidatePlans,
  type PlanAction,
  respondToPlan,
  rsvpState,
  setChecklistDone,
  type WeatherForecast,
} from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { UserAvatar } from '@/components/UserAvatar';
import { planDay } from '@/domain/planTime';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatMoney, useT } from '@/i18n';
import type { Person } from '@/plans/people';
import { usePlanFormat } from '@/plans/usePlanFormat';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/** ≤ 14 хоногийн таамаг (AC-100) — харуулах эсэхийг дуудагч `visibleForecast`-оор шийднэ. */
export function WeatherRow({ weather }: { weather: WeatherForecast }) {
  const t = useT();
  const colors = useColors();
  return (
    <View style={styles.row} testID="plan-weather">
      <CloudSun size={20} color={colors.textMuted} strokeWidth={iconStroke} />
      <View style={styles.flex}>
        <AppText>{t('plans.weather.range', { min: Math.round(weather.tempMinC), max: Math.round(weather.tempMaxC) })}</AppText>
        <AppText variant="caption" color="textMuted">
          {weather.attribution}
        </AppText>
      </View>
    </View>
  );
}

/**
 * RSVP (FR-7.2, AC-33): B-д «Зөвшөөрөх / Өөр цаг / Татгалзах»; A-д B-гийн санал болгосон
 * цагууд; батлагдвал `onConfirmed` (ANIM-12).
 */
export function RsvpSection({ plan, myId, onConfirmed }: { plan: DatePlan; myId: string | null; onConfirmed: () => void }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const { when } = usePlanFormat();
  const state = rsvpState(plan, myId);
  const done = (next: DatePlan) => {
    if (next.status === 'CONFIRMED') onConfirmed();
    return invalidatePlans(queryClient);
  };
  const respond = useMutation({ mutationFn: (action: PlanAction) => respondToPlan(plan.id, action), onSuccess: done });
  const choose = useMutation({ mutationFn: (optionId: string) => chooseOption(plan.id, optionId), onSuccess: done });
  const error = respond.error ?? choose.error;

  if (state.kind === 'confirmed' || state.kind === 'closed') return null;
  return (
    <Card testID="plan-rsvp">
      <AppText variant="h3" accessibilityRole="header">
        {t('plans.rsvp.title')}
      </AppText>
      {state.kind === 'waiting' ? (
        <AppText color="textMuted" testID="plan-rsvp-waiting">
          {t('plans.rsvp.waiting')}
        </AppText>
      ) : null}
      {state.kind === 'respond' ? (
        <>
          <AppText color="textMuted">{t('plans.rsvp.yourTurn')}</AppText>
          <View style={styles.wrap}>
            <AppButton label={t('plans.rsvp.accept')} onPress={() => respond.mutate('ACCEPT')} loading={respond.isPending && respond.variables === 'ACCEPT'} disabled={offline} testID="plan-accept" />
            <AppButton
              variant="secondary"
              label={t('plans.rsvp.counter')}
              onPress={() => router.push({ pathname: '/plans/[id]/counter', params: { id: plan.id } })}
              disabled={offline}
              testID="plan-counter"
            />
            <AppButton variant="ghost" label={t('plans.rsvp.decline')} onPress={() => respond.mutate('DECLINE')} disabled={offline || respond.isPending} testID="plan-decline" />
          </View>
        </>
      ) : null}
      {state.kind === 'choose' ? (
        <>
          <AppText color="textMuted">{t('plans.rsvp.choose')}</AppText>
          {state.options.map((o) => (
            <AppButton
              key={o.id}
              variant="secondary"
              label={t('plans.rsvp.chooseOption', { when: when(o.startsAt) })}
              onPress={() => choose.mutate(o.id)}
              disabled={offline || choose.isPending}
              testID={`plan-option-${o.id}`}
            />
          ))}
        </>
      ) : null}
      {error ? <FormMessage text={errorText(error)} testID="plan-rsvp-error" /> : null}
    </Card>
  );
}

function ChecklistRow({ item, by, onToggle, onRemove, busy }: { item: ChecklistItem; by: Person | null; onToggle: () => void; onRemove: () => void; busy: boolean }) {
  const t = useT();
  const colors = useColors();
  return (
    <View style={styles.row} testID={`checklist-item-${item.id}`}>
      <Pressable
        onPress={onToggle}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled: busy }}
        aria-checked={item.done}
        accessibilityLabel={item.text}
        testID={`checklist-toggle-${item.id}`}
        style={[styles.box, { borderColor: item.done ? colors.primary : colors.border, backgroundColor: item.done ? colors.primary : 'transparent' }]}
      >
        {item.done ? <Check size={18} color={colors.onPrimary} strokeWidth={iconStroke} /> : null}
      </Pressable>
      <AppText style={[styles.flex, item.done && styles.struck]} color={item.done ? 'textMuted' : 'text'}>
        {item.text}
      </AppText>
      {item.done && by ? (
        <View testID={`checklist-done-by-${item.id}`}>
          <UserAvatar uri={by.avatarUri} label={t('plans.checklist.doneBy', { name: by.name })} size={28} />
        </View>
      ) : null}
      <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={t('plans.checklist.remove')} style={styles.icon} testID={`checklist-remove-${item.id}`}>
        <X size={18} color={colors.textMuted} strokeWidth={iconStroke} />
      </Pressable>
    </View>
  );
}

/**
 * Бэлтгэлийн жагсаалт (FR-7.6, AC-96): «2 / 4», хэн тэмдэглэснийг аватараар. Хамтрагчийн
 * тэмдэглэл `checklist.updated`-ээр бодит цагаар ирнэ (`eventRouter`).
 */
export function ChecklistSection({ plan, byId }: { plan: DatePlan; byId: (id: string | null | undefined) => Person | null }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const [text, setText] = useState('');
  const progress = checklistProgress(plan);
  const refresh = () => invalidatePlans(queryClient);
  const toggle = useMutation({ mutationFn: (item: ChecklistItem) => setChecklistDone(item, !item.done), onSettled: refresh });
  const remove = useMutation({ mutationFn: (item: ChecklistItem) => deleteChecklistItem(item.id), onSettled: refresh });
  const add = useMutation({
    mutationFn: () => addChecklistItem(plan.id, text.trim()),
    onSuccess: () => {
      setText('');
      return refresh();
    },
  });
  const error = toggle.error ?? remove.error ?? add.error;
  const items = [...plan.checklist].sort((a, b) => a.position - b.position);
  return (
    <Card testID="plan-checklist">
      <View style={styles.row}>
        <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
          {t('plans.checklist.title')}
        </AppText>
        <AppText variant="label" testID="plan-checklist-progress">
          {t('plans.checklist.progress', { done: progress.done, total: progress.total })}
        </AppText>
      </View>
      {items.length === 0 ? <AppText color="textMuted">{t('plans.checklist.empty')}</AppText> : null}
      {items.map((item) => (
        <ChecklistRow
          key={item.id}
          item={item}
          by={byId(item.doneBy)}
          busy={offline || (toggle.isPending && toggle.variables?.id === item.id)}
          onToggle={() => toggle.mutate(item)}
          onRemove={() => remove.mutate(item)}
        />
      ))}
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <TextField
            label={t('plans.checklist.itemLabel')}
            placeholder={t('plans.checklist.placeholder')}
            value={text}
            onChangeText={(v) => setText(v.slice(0, 200))}
            testID="checklist-input"
          />
        </View>
        <AppButton variant="secondary" label={t('plans.checklist.add')} onPress={() => add.mutate()} disabled={offline || !text.trim()} loading={add.isPending} testID="checklist-add" />
      </View>
      {error ? <FormMessage text={errorText(error)} testID="plan-checklist-error" /> : null}
    </Card>
  );
}

/** Болзооны төсөв (FR-7.7, AC-97): төлөвлөсөн/бодит, хэтэрсэн дүн, зардал ба төлсөн хүн. */
export function BudgetSection({ plan, me, partner, byId }: { plan: DatePlan; me: Person | null; partner: Person | null; byId: (id: string | null | undefined) => Person | null }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const { tz } = usePlanFormat();
  const { disabled: offline } = useOnlineOnly();
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const payerId = payer ?? me?.id ?? null;
  const add = useMutation({
    mutationFn: (amountMnt: number) => addExpense(plan.id, { amountMnt, payerId: payerId ?? '', spentOn: planDay(plan.startsAt, tz) }),
    onSuccess: () => {
      setAmount('');
      return invalidatePlans(queryClient);
    },
  });
  const submit = () => {
    const value = Number(amount.replace(/[\s,]/g, ''));
    if (!Number.isInteger(value) || value <= 0 || !payerId) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    add.mutate(value);
  };
  const { plannedMnt, actualMnt, overBy } = plan.budget;
  return (
    <Card testID="plan-budget">
      <AppText variant="h3" accessibilityRole="header">
        {t('plans.budget.title')}
      </AppText>
      {plannedMnt != null ? <AppText testID="plan-budget-planned">{t('plans.budget.planned', { amount: formatMoney(plannedMnt, locale) })}</AppText> : null}
      <AppText testID="plan-budget-actual">{t('plans.budget.actual', { amount: formatMoney(actualMnt, locale) })}</AppText>
      {overBy > 0 ? (
        <AppText color="danger" testID="plan-budget-over">
          {t('plans.budget.over', { amount: formatMoney(overBy, locale) })}
        </AppText>
      ) : plannedMnt != null && actualMnt > 0 ? (
        <AppText color="textMuted">{t('plans.budget.within')}</AppText>
      ) : null}
      {plan.expenses.map((e) => (
        <View key={e.id} style={styles.row} testID={`plan-expense-${e.id}`}>
          <AppText style={styles.flex}>{formatMoney(e.amountMnt, locale)}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('plans.budget.paidBy', { name: byId(e.payerId)?.name ?? '' })}
          </AppText>
        </View>
      ))}
      <TextField
        label={t('plans.budget.amount')}
        value={amount}
        onChangeText={(v) => setAmount(v.replace(/[^\d\s]/g, ''))}
        keyboardType="number-pad"
        error={invalid ? t('plans.budget.invalidAmount') : null}
        testID="expense-amount"
      />
      <AppText variant="label" color="textMuted">
        {t('plans.budget.payer')}
      </AppText>
      <ChipRow wrap>
        {me ? <Chip label={t('plans.budget.me')} selected={payerId === me.id} onPress={() => setPayer(me.id)} testID="expense-payer-me" /> : null}
        {partner ? <Chip label={partner.name} selected={payerId === partner.id} onPress={() => setPayer(partner.id)} testID="expense-payer-partner" /> : null}
      </ChipRow>
      <AppButton variant="secondary" label={t('plans.budget.addExpense')} onPress={submit} disabled={offline || !amount.trim()} loading={add.isPending} testID="expense-add" />
      {add.error ? <FormMessage text={errorText(add.error)} testID="plan-expense-error" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  flex: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  box: { width: 28, height: 28, borderRadius: radius.input / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center', margin: (touchTarget - 28) / 2 },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
