import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Pencil, Trash2 } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  addContribution,
  addGoalStep,
  deleteContribution,
  deleteGoal,
  deleteGoalStep,
  type Goal,
  GOAL_TITLE_MAX,
  goalKey,
  invalidateGoals,
  setGoalStepDone,
  updateGoal,
  useGoal,
} from '@/api/queries/goals';
import { conflictCurrent } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ConflictResolutionSheet } from '@/components/ConflictResolutionSheet';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { GoalProgressBar } from '@/components/together/GoalProgressBar';
import { UserAvatar } from '@/components/UserAvatar';
import { goalProgress, parseAmount, stepsFraction } from '@/domain/goalProgress';
import { useErrorText } from '@/hooks/useErrorText';
import { formatDate, formatMoney, formatNumber, useT } from '@/i18n';
import { CelebrationOverlay } from '@/motion/CelebrationOverlay';
import { useCouplePeople } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * S-64 зорилгын дэлгэрэнгүй (FR-9.3, 9.4): ANIM-20 шингэн явц, 100%-д confetti, алхам «2/4»,
 * хандив ба «хэн хэд» (AC-108) — `goal.updated`-аар хоёр талд бодит цагаар (AC-42). Гарчиг засахад
 * зөрчил гарвал «миний / түүний хувилбар» (AC-131).
 */
export default function GoalDetailScreen() {
  const t = useT();
  const errorText = useErrorText();
  const id = first(useLocalSearchParams<{ id?: string }>().id);
  const goal = useGoal(id);
  let body;
  if (goal.isError && !goal.data) body = <ScreenState kind="error" message={errorText(goal.error)} onRetry={() => void goal.refetch()} />;
  else if (goal.isPending || !goal.data) body = <ScreenState kind="loading" rows={4} />;
  else body = <GoalBody goal={goal.data} />;
  return (
    <StackScreen title={goal.data?.title ?? t('goals.title')} testID="screen-S-64-detail">
      {body}
    </StackScreen>
  );
}

function GoalBody({ goal }: { goal: Goal }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const { me, byId } = useCouplePeople();
  const progress = goalProgress(goal);
  const [step, setStep] = useState('');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  // Засвар эхэлсэн үеийн хувилбар: хамтрагчийн `goal.updated` кэшийг шинэчилсэн ч түүгээр хадгалбал
  // 409 гарч сонголт харагдана — шинэ `goal.version`-оор хадгалбал чимээгүй дарна (AC-131, INV-07)
  const [editingVersion, setEditingVersion] = useState(goal.version);
  const [conflict, setConflict] = useState<{ current: Goal; updatedBy: string | null; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const lastPercent = useRef(progress.percent);

  // 100% хүрэхэд (өөрөө эсвэл хамтрагч — `goal.updated`) нэг удаа баярлана
  useEffect(() => {
    if (lastPercent.current < 100 && progress.percent >= 100) setCelebrate(true);
    lastPercent.current = progress.percent;
  }, [progress.percent]);

  const run = async (key: string, fn: () => Promise<Goal | void>) => {
    setBusy(key);
    setError(null);
    try {
      const next = await fn();
      if (next) queryClient.setQueryData(goalKey(goal.id), next);
      void invalidateGoals(queryClient);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const addStep = () => {
    const s = step.trim();
    if (!s) return;
    setStep('');
    void run('step-add', () => addGoalStep(goal.id, s.slice(0, GOAL_TITLE_MAX)));
  };

  const contribute = () => {
    const value = parseAmount(amount);
    if (value === null) {
      setAmountError(t('goals.form.amountInvalid'));
      return;
    }
    setAmountError(null);
    setAmount('');
    void run('contribute', () => addContribution(goal.id, value));
  };

  const saveTitle = async (title: string, version: number) => {
    setBusy('title');
    setError(null);
    try {
      const saved = await updateGoal(goal.id, { title, version });
      queryClient.setQueryData(goalKey(goal.id), saved);
      void invalidateGoals(queryClient);
      setEditingTitle(null);
      setConflict(null);
    } catch (e) {
      const c = conflictCurrent<Goal>(e);
      if (c) setConflict({ ...c, title });
      else setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const pct = formatNumber(progress.percent, locale, progress.percent % 1 ? 1 : 0);
  const fraction = stepsFraction(progress.stepsDone, progress.stepsTotal);
  const moneyLine = progress.target !== null ? t('goals.raised', { raised: formatMoney(progress.raised, locale), target: formatMoney(progress.target, locale) }) : null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error ? <FormMessage text={error} testID="goal-error" /> : null}
        {editingTitle !== null ? (
          <View style={styles.titleEdit}>
            <TextField label={t('goals.form.name')} value={editingTitle} onChangeText={setEditingTitle} maxLength={GOAL_TITLE_MAX} testID="goal-title-input" />
            <View style={styles.row}>
              <AppButton variant="secondary" label={t('common.cancel')} onPress={() => setEditingTitle(null)} testID="goal-title-cancel" />
              <AppButton
                label={t('common.save')}
                onPress={() => void saveTitle(editingTitle.trim(), editingVersion)}
                disabled={!editingTitle.trim()}
                loading={busy === 'title'}
                testID="goal-title-save"
              />
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <AppText variant="h2" style={styles.flex} testID="goal-title">
              {goal.title}
            </AppText>
            <IconButton
              label={t('goals.editTitle')}
              onPress={() => {
                setEditingVersion(goal.version);
                setEditingTitle(goal.title);
              }}
              testID="goal-title-edit"
            >
              <Pencil size={18} color={colors.textMuted} strokeWidth={iconStroke} />
            </IconButton>
          </View>
        )}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <AppText variant="display" testID="goal-percent">
              {pct}%
            </AppText>
            <View style={styles.flex} />
            {goal.targetDate ? (
              <AppText variant="caption" color="textMuted">
                {t('goals.until', { date: formatDate(goal.targetDate, dateFormat) })}
              </AppText>
            ) : null}
          </View>
          <GoalProgressBar percent={progress.percent} label={`${pct}%${moneyLine ? `, ${moneyLine}` : ''}`} />
          <AppText variant="bodyStrong" testID="goal-steps-fraction">
            {t('goals.stepsProgress', { fraction })}
          </AppText>
          {moneyLine ? (
            <AppText color="textMuted" testID="goal-raised">
              {moneyLine}
            </AppText>
          ) : null}
        </View>

        <AppText variant="h3" accessibilityRole="header">
          {t('goals.steps')}
        </AppText>
        {goal.steps.length === 0 ? (
          <AppText color="textMuted" testID="goal-steps-empty">
            {t('goals.noSteps')}
          </AppText>
        ) : null}
        {[...goal.steps]
          .sort((a, b) => a.position - b.position)
          .map((s) => {
            const who = byId(s.doneBy);
            return (
              <View key={s.id} style={[styles.step, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`goal-step-${s.id}`}>
                <Pressable
                  onPress={() => void run(`step-${s.id}`, () => setGoalStepDone(s.id, !s.done))}
                  disabled={busy === `step-${s.id}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: s.done }}
                  aria-checked={s.done}
                  accessibilityLabel={s.title}
                  testID={`goal-step-toggle-${s.id}`}
                  style={[styles.check, { borderColor: s.done ? colors.success : colors.border, backgroundColor: s.done ? colors.success : 'transparent' }]}
                >
                  {s.done ? <Check size={18} color={colors.bg} strokeWidth={iconStroke + 0.5} /> : null}
                </Pressable>
                <View style={styles.flex}>
                  <AppText color={s.done ? 'textMuted' : 'text'}>{s.title}</AppText>
                  {s.done && who ? (
                    <AppText variant="caption" color="textMuted">
                      {t('goals.stepDoneBy', { name: who.name })}
                    </AppText>
                  ) : null}
                </View>
                <IconButton label={t('goals.removeStep')} onPress={() => void run(`step-${s.id}`, () => deleteGoalStep(s.id))} testID={`goal-step-remove-${s.id}`}>
                  <Trash2 size={16} color={colors.textMuted} strokeWidth={iconStroke} />
                </IconButton>
              </View>
            );
          })}
        <View style={styles.inline}>
          <View style={styles.flex}>
            <TextField label={t('goals.newStep')} value={step} onChangeText={setStep} onSubmitEditing={addStep} maxLength={GOAL_TITLE_MAX} testID="goal-step-input" />
          </View>
          <AppButton variant="secondary" label={t('goals.addStep')} onPress={addStep} disabled={!step.trim()} loading={busy === 'step-add'} testID="goal-step-add" />
        </View>

        {progress.target !== null ? (
          <>
            <AppText variant="h3" accessibilityRole="header">
              {t('goals.whoGave')}
            </AppText>
            {progress.shares.length === 0 ? (
              <AppText color="textMuted" testID="goal-shares-empty">
                {t('goals.noContributions')}
              </AppText>
            ) : (
              progress.shares.map((s) => {
                const who = byId(s.userId);
                return (
                  <View key={s.userId} style={styles.share} testID={`goal-share-${s.userId}`}>
                    <UserAvatar uri={who?.avatarUri} label={who?.name ?? ''} size={32} />
                    <AppText style={styles.flex}>{who?.name ?? t('lists.someone')}</AppText>
                    <AppText variant="bodyStrong">
                      {formatMoney(s.amount, locale)} · {s.sharePercent}%
                    </AppText>
                  </View>
                );
              })
            )}
            <View style={styles.inline}>
              <View style={styles.flex}>
                <TextField
                  label={t('goals.contribution')}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                  error={amountError}
                  onSubmitEditing={contribute}
                  testID="goal-contribution-input"
                />
              </View>
              <AppButton label={t('goals.contribute')} onPress={contribute} loading={busy === 'contribute'} disabled={!amount.trim()} testID="goal-contribute" />
            </View>
            {goal.contributions
              .filter((c) => c.userId === me?.id)
              .map((c) => (
                <View key={c.id} style={styles.share} testID={`goal-contribution-${c.id}`}>
                  <AppText variant="caption" color="textMuted" style={styles.flex}>
                    {t('goals.myContribution', { amount: formatMoney(c.amountMnt, locale), date: formatDate(new Date(c.createdAt), dateFormat) })}
                  </AppText>
                  <IconButton label={t('goals.removeContribution')} onPress={() => void run(`c-${c.id}`, () => deleteContribution(c.id))} testID={`goal-contribution-remove-${c.id}`}>
                    <Trash2 size={16} color={colors.textMuted} strokeWidth={iconStroke} />
                  </IconButton>
                </View>
              ))}
          </>
        ) : null}
        <AppButton variant="ghost" label={t('goals.delete')} onPress={() => setConfirmDelete(true)} testID="goal-delete" />
      </ScrollView>
      <CelebrationOverlay anim="ANIM-20" visible={celebrate} onDismiss={() => setCelebrate(false)}>
        <AppText variant="display" color="onPrimary" testID="goal-complete">
          {t('goals.completed')}
        </AppText>
      </CelebrationOverlay>
      <ConfirmSheet
        visible={confirmDelete}
        title={t('goals.deleteTitle')}
        body={t('goals.deleteBody')}
        confirmLabel={t('goals.delete')}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteGoal(goal.id)
            .then(() => invalidateGoals(queryClient))
            .then(() => router.back())
            .catch((e: unknown) => setError(errorText(e)));
        }}
        onCancel={() => setConfirmDelete(false)}
        testID="goal-delete-sheet"
      />
      {conflict ? (
        <ConflictResolutionSheet
          visible
          title={t('together.conflict.titleBy', { name: byId(conflict.updatedBy)?.name ?? t('together.conflict.partner') })}
          mine={{ title: conflict.title }}
          theirs={{ title: conflict.current.title }}
          onKeepMine={() => void saveTitle(conflict.title, conflict.current.version)}
          onKeepTheirs={() => {
            queryClient.setQueryData(goalKey(goal.id), conflict.current);
            setConflict(null);
            setEditingTitle(null);
          }}
          onDismiss={() => setConflict(null)}
          loading={busy === 'title'}
        />
      ) : null}
    </>
  );
}

function IconButton({ label, onPress, testID, children }: { label: string; onPress: () => void; testID: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={styles.icon}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  titleEdit: { gap: spacing.xs },
  flex: { flex: 1 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.card, padding: spacing.xs },
  check: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  share: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touchTarget },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
