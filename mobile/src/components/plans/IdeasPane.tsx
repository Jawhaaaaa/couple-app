import { router } from 'expo-router';
import { BookOpen, Dices, Layers, type LucideIcon, PiggyBank, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type IdeaCategory, type IdeaSetting, MAX_BUDGETS, SETTINGS, useIdeas } from '@/api/queries/ideas';
import { CATEGORIES } from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { ScreenState } from '@/components/ScreenState';
import { TextField } from '@/components/TextField';
import { emptyStateText } from '@/content/emptyStates';
import { useDebounced } from '@/hooks/useDebounced';
import { useErrorText } from '@/hooks/useErrorText';
import { formatMoney, useT } from '@/i18n';
import { planDraftFromIdea } from '@/plans/ideaForm';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

import { IdeaCard } from './IdeaCard';

function ToolLink({ icon: Icon, label, href, testID }: { icon: LucideIcon; label: string; href: string; testID: string }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      accessibilityRole="link"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.tool, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <Icon size={20} color={colors.primary} strokeWidth={iconStroke} />
      <AppText variant="label" numberOfLines={2} style={styles.toolLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * S-51 санаанууд (FR-7.1, AC-179): ангилал, гэр/гадаа, төсвөөр шүүх; карт → S-53, «Болзоо
 * болгох» → S-54. Санамсаргүй (S-56), нууц deck (S-57), сан (S-58), төсөв (S-59) руу холбоос.
 */
export function IdeasPane() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const [category, setCategory] = useState<IdeaCategory | undefined>();
  const [setting, setSetting] = useState<IdeaSetting | undefined>();
  const [maxBudget, setMaxBudget] = useState<number | undefined>();
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const ideas = useIdeas({ category, setting, maxBudget, q: query });
  const filtered = !!(category || setting || maxBudget !== undefined || query.trim());

  let list;
  if (ideas.isError && !ideas.data) list = <ScreenState kind="error" message={errorText(ideas.error)} onRetry={() => void ideas.refetch()} />;
  else if (ideas.isPending) list = <ScreenState kind="loading" rows={3} />;
  else if (ideas.data.length === 0 && !filtered) {
    const empty = emptyStateText('S-51', locale);
    list = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/plans/idea-editor')} />;
  } else if (ideas.data.length === 0) {
    list = (
      <AppText color="textMuted" testID="ideas-no-match">
        {t('plans.ideas.noMatch')}
      </AppText>
    );
  } else {
    list = ideas.data.map((idea) => (
      <IdeaCard
        key={idea.id}
        idea={idea}
        onPress={() => router.push({ pathname: '/plans/idea-editor', params: { id: idea.id } })}
        footer={
          <AppButton
            variant="secondary"
            label={t('plans.ideas.toPlan')}
            onPress={() => router.push({ pathname: '/plans/new', params: { draft: planDraftFromIdea(idea) } })}
            testID={`idea-to-plan-${idea.id}`}
          />
        }
      />
    ));
  }

  return (
    <View style={styles.root} testID="plans-ideas">
      <AppText variant="label" color="textMuted">
        {t('plans.ideas.tools')}
      </AppText>
      <View style={styles.tools}>
        <ToolLink icon={Dices} label={t('plans.ideas.random')} href="/plans/random" testID="ideas-open-random" />
        <ToolLink icon={Layers} label={t('plans.ideas.deck')} href="/plans/deck" testID="ideas-open-deck" />
        <ToolLink icon={BookOpen} label={t('plans.ideas.library')} href="/plans/library" testID="ideas-open-library" />
        <ToolLink icon={PiggyBank} label={t('plans.ideas.budget')} href="/plans/budget" testID="ideas-open-budget" />
      </View>
      <View style={styles.head}>
        <View style={styles.flex}>
          <TextField label={t('plans.ideas.search')} value={q} onChangeText={setQ} autoCorrect={false} testID="ideas-search" />
        </View>
        <Pressable
          onPress={() => router.push('/plans/idea-editor')}
          accessibilityRole="button"
          accessibilityLabel={t('plans.ideas.add')}
          testID="ideas-add"
          style={styles.add}
        >
          <Plus size={24} color={colors.primary} strokeWidth={iconStroke} />
        </Pressable>
      </View>
      <ChipRow>
        <Chip label={t('plans.ideas.all')} selected={!category} onPress={() => setCategory(undefined)} testID="ideas-category-all" />
        {CATEGORIES.map((c) => (
          <Chip key={c} label={t(`plans.category.${c}`)} selected={category === c} onPress={() => setCategory(category === c ? undefined : c)} testID={`ideas-category-${c}`} />
        ))}
      </ChipRow>
      <ChipRow>
        {SETTINGS.map((s) => (
          <Chip key={s} label={t(`plans.setting.${s}`)} selected={setting === s} onPress={() => setSetting(setting === s ? undefined : s)} testID={`ideas-setting-${s}`} />
        ))}
        {MAX_BUDGETS.map((b) => (
          <Chip
            key={b}
            label={b === 0 ? t('plans.ideas.free') : t('plans.ideas.upTo', { amount: formatMoney(b, locale) })}
            selected={maxBudget === b}
            onPress={() => setMaxBudget(maxBudget === b ? undefined : b)}
            testID={`ideas-budget-${b}`}
          />
        ))}
      </ChipRow>
      {list}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tool: { flexBasis: '47%', flexGrow: 1, minHeight: touchTarget + spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.input, borderWidth: 1 },
  toolLabel: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  flex: { flex: 1 },
  add: { width: touchTarget, height: touchTarget + spacing.xs, alignItems: 'center', justifyContent: 'center' },
});
