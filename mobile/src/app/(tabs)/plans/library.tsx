import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { adoptLibraryIdea, BUDGET_BANDS, invalidateIdeas, type LibraryFilters, SEASONS, SETTINGS, useIdeaLibrary } from '@/api/queries/ideas';
import { CATEGORIES } from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { Chip, ChipRow } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { IdeaCard } from '@/components/plans/IdeaCard';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

/**
 * S-58 санааны сан (FR-7.11, AC-99): улирал, төсөв, гэртээ/гадаа, алс зай, ангиллаар шүүнэ;
 * «Миний санаа болгох» — хосын жагсаалтад хуулбар (эх өөрчлөгдөхгүй).
 */
export default function LibraryScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const [filters, setFilters] = useState<LibraryFilters>({});
  const [adopted, setAdopted] = useState<Set<string>>(() => new Set());
  const library = useIdeaLibrary(filters, locale);
  const adopt = useMutation({
    mutationFn: (libraryId: string) => adoptLibraryIdea(libraryId),
    onSuccess: async (_idea, libraryId) => {
      setAdopted((s) => new Set(s).add(libraryId));
      await invalidateIdeas(queryClient);
    },
  });
  const toggle = <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));

  let list;
  if (library.isError && !library.data) list = <ScreenState kind="error" message={errorText(library.error)} onRetry={() => void library.refetch()} />;
  else if (library.isPending) list = <ScreenState kind="loading" rows={3} />;
  else if (library.data.length === 0) {
    const empty = emptyStateText('S-58', locale);
    list = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => setFilters({})} />;
  } else {
    list = library.data.map((idea) => (
      <IdeaCard
        key={idea.id}
        idea={idea}
        footer={
          adopted.has(idea.id) ? (
            <FormMessage kind="success" text={t('plans.library.adopted')} testID={`library-adopted-${idea.id}`} />
          ) : (
            <AppButton
              variant="secondary"
              label={t('plans.library.adopt')}
              onPress={() => adopt.mutate(idea.id)}
              loading={adopt.isPending && adopt.variables === idea.id}
              disabled={offline}
              testID={`library-adopt-${idea.id}`}
            />
          )
        }
      />
    ));
  }

  return (
    <StackScreen title={t('plans.library.title')} testID="screen-S-58">
      <ScrollView contentContainerStyle={styles.body}>
        <ChipRow>
          {SEASONS.map((s) => (
            <Chip key={s} label={t(`plans.library.season.${s}`)} selected={filters.season === s} onPress={() => toggle('season', s)} testID={`library-season-${s}`} />
          ))}
        </ChipRow>
        <ChipRow>
          {SETTINGS.map((s) => (
            <Chip key={s} label={t(`plans.setting.${s}`)} selected={filters.setting === s} onPress={() => toggle('setting', s)} testID={`library-setting-${s}`} />
          ))}
          <Chip label={t('plans.library.longDistance')} selected={!!filters.longDistance} onPress={() => toggle('longDistance', true)} testID="library-long-distance" />
        </ChipRow>
        <ChipRow>
          {BUDGET_BANDS.map((b) => (
            <Chip key={b} label={t(`plans.library.band.${b}`)} selected={filters.budget === b} onPress={() => toggle('budget', b)} testID={`library-budget-${b}`} />
          ))}
        </ChipRow>
        <ChipRow>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`plans.category.${c}`)} selected={filters.category === c} onPress={() => toggle('category', c)} testID={`library-category-${c}`} />
          ))}
        </ChipRow>
        {adopt.error ? <FormMessage text={errorText(adopt.error)} testID="library-error" /> : null}
        {list}
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
});
