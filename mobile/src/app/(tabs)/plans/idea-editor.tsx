import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  createIdea,
  type DateIdea,
  deleteIdea,
  IDEA_TITLE_MAX,
  invalidateIdeas,
  SETTINGS,
  updateIdea,
  useIdea,
} from '@/api/queries/ideas';
import { CATEGORIES } from '@/api/queries/plans';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip, ChipRow } from '@/components/Chip';
import { CityPicker } from '@/components/CityPicker';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useT } from '@/i18n';
import {
  buildIdeaInput,
  buildIdeaUpdate,
  emptyIdeaForm,
  IDEA_DESCRIPTION_MAX,
  type IdeaForm,
  ideaFormFrom,
  parseIdeaDraft,
  validateIdeaForm,
} from '@/plans/ideaForm';
import { spacing } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * S-53 санаа үүсгэх/засах (`?id&draft`, FR-7.1, AC-179): гарчиг, тайлбар, ангилал, төсөв ₮,
 * газар, холбоос, гэр/гадаа. Гарчиггүй бол талбарын алдаа. `?draft=` — чатын «Болзооны санаа
 * болгох»-оос бөглөгдсөн (AC-91).
 */
export default function IdeaEditorScreen() {
  const t = useT();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ id?: string; draft?: string }>();
  const id = first(params.id);
  const idea = useIdea(id);
  let body;
  if (!id) body = <IdeaEditorForm draft={first(params.draft)} />;
  else if (idea.data) body = <IdeaEditorForm idea={idea.data} />;
  else if (idea.isError) body = <ScreenState kind="error" message={errorText(idea.error)} onRetry={() => void idea.refetch()} />;
  else body = <ScreenState kind="loading" rows={3} />;
  return (
    <StackScreen title={id ? t('plans.ideaEditor.editTitle') : t('plans.ideaEditor.newTitle')} testID="screen-S-53">
      {body}
    </StackScreen>
  );
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/plans/ideas');
}

function IdeaEditorForm({ idea, draft }: { idea?: DateIdea; draft?: string }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const [clientId] = useState(() => uuidv7());
  const [fromChat] = useState(() => !idea && !!parseIdeaDraft(draft));
  const [form, setForm] = useState<IdeaForm>(() => (idea ? ideaFormFrom(idea) : { ...emptyIdeaForm(), ...parseIdeaDraft(draft) }));
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errors = showErrors ? validateIdeaForm(form) : [];
  const update = (patch: Partial<IdeaForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () => (idea ? updateIdea(idea.id, buildIdeaUpdate(form, idea.version)) : createIdea(buildIdeaInput(form, clientId))),
    onSuccess: async () => {
      await invalidateIdeas(queryClient);
      leave();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteIdea(idea?.id ?? ''),
    onSuccess: async () => {
      setConfirmDelete(false);
      await invalidateIdeas(queryClient);
      leave();
    },
  });
  const submit = () => {
    setShowErrors(true);
    if (validateIdeaForm(form).length === 0) save.mutate();
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {fromChat ? <FormMessage kind="info" text={t('plans.ideaEditor.fromChat')} testID="idea-from-chat" /> : null}
      <TextField
        label={t('plans.ideaEditor.title')}
        value={form.title}
        onChangeText={(v) => update({ title: v.slice(0, IDEA_TITLE_MAX) })}
        error={errors.includes('TITLE') ? t('plans.ideaEditor.titleRequired') : null}
        testID="idea-title"
      />
      <TextField
        label={t('plans.ideaEditor.description')}
        value={form.description}
        onChangeText={(v) => update({ description: v.slice(0, IDEA_DESCRIPTION_MAX) })}
        multiline
        testID="idea-description"
      />
      <AppText variant="label" color="textMuted">
        {t('plans.ideaEditor.category')}
      </AppText>
      <ChipRow wrap>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={t(`plans.category.${c}`)} selected={form.category === c} onPress={() => update({ category: c })} testID={`idea-category-${c}`} />
        ))}
      </ChipRow>
      <TextField
        label={t('plans.ideaEditor.budget')}
        value={form.budget}
        onChangeText={(v) => update({ budget: v.replace(/[^\d\s]/g, '') })}
        keyboardType="number-pad"
        error={errors.includes('BUDGET') ? t('plans.ideaEditor.budgetInvalid') : null}
        testID="idea-budget"
      />
      <TextField
        label={t('plans.form.venue')}
        hint={t('plans.form.venueHint')}
        value={form.venue}
        onChangeText={(v) => update({ venue: v.slice(0, 200) })}
        error={errors.includes('PLACE') ? t('plans.form.placeNeedsCity') : null}
        testID="idea-venue"
      />
      <CityPicker value={form.city} onChange={(city) => update({ city })} disabled={offline} />
      <TextField
        label={t('plans.ideaEditor.url')}
        value={form.url}
        onChangeText={(v) => update({ url: v.trim() })}
        autoCapitalize="none"
        keyboardType="url"
        error={errors.includes('URL') ? t('plans.ideaEditor.urlInvalid') : null}
        testID="idea-url"
      />
      <AppText variant="label" color="textMuted">
        {t('plans.ideaEditor.setting')}
      </AppText>
      <ChipRow wrap>
        <Chip label={t('plans.ideaEditor.settingAny')} selected={!form.setting} onPress={() => update({ setting: null })} testID="idea-setting-any" />
        {SETTINGS.map((s) => (
          <Chip key={s} label={t(`plans.setting.${s}`)} selected={form.setting === s} onPress={() => update({ setting: s })} testID={`idea-setting-${s}`} />
        ))}
      </ChipRow>
      {save.error ? <FormMessage text={errorText(save.error)} testID="idea-save-error" /> : null}
      <AppButton label={t('plans.ideaEditor.save')} onPress={submit} loading={save.isPending} disabled={offline} testID="idea-save" />
      {idea ? <AppButton variant="ghost" label={t('plans.ideaEditor.delete')} onPress={() => setConfirmDelete(true)} disabled={offline} testID="idea-delete" /> : null}
      <ConfirmSheet
        visible={confirmDelete}
        title={t('plans.ideaEditor.deleteTitle')}
        confirmLabel={t('plans.ideaEditor.delete')}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
        loading={remove.isPending}
        testID="idea-delete-confirm"
      >
        {remove.error ? <FormMessage text={errorText(remove.error)} testID="idea-delete-error" /> : null}
      </ConfirmSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
});
