import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { cancelLetter, createLetter, invalidateLetters, type Letter, letterKey, type LetterTemplate, updateLetter, useLetter } from '@/api/queries/letters';
import { mediaUrl } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { PhotoStrip, resolveMediaIds } from '@/components/together/PhotoStrip';
import { usePaperColor } from '@/components/together/paper';
import { canEditLetter, LETTER_BODY_MAX, LETTER_TEMPLATES, letterDeliverAt, type LetterForm, type LetterFormError, OCCASION_LABEL_MAX } from '@/domain/letters';
import { utcToZoned } from '@/domain/planTime';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useT } from '@/i18n';
import type { DraftMedia } from '@/stores/draftStore';
import { type LetterDraft, NEW_LETTER, useLetterDraftStore } from '@/stores/letterDraftStore';
import { useSessionStore } from '@/stores/sessionStore';
import { radius, spacing } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const EMPTY_FORM: LetterForm = { template: 'PAPER_1', body: '', mode: 'now', date: '', time: '', occasionLabel: '' };

function draftFromLetter(letter: Letter, timeZone: string): LetterDraft {
  const at = letter.deliverAt ? utcToZoned(letter.deliverAt, timeZone) : null;
  return {
    form: {
      template: letter.template,
      body: letter.body,
      mode: at ? 'scheduled' : 'now',
      date: at?.date ?? '',
      time: at?.time ?? '',
      occasionLabel: letter.occasionLabel ?? '',
    },
    media: letter.media.map((m) => ({
      key: m.id,
      localId: null,
      mediaId: m.id,
      previewUri: mediaUrl(m, 'sm'),
      kind: 'image' as const,
      name: m.id,
      altText: '',
    })),
  };
}

/**
 * S-66 захидал бичих (`?id`, FR-10.1…10.3): 3 загвар, ≤ 5 зураг (AC-111), шууд эсвэл товлосон
 * цаг (хэрэглэгчийн бүсээр), ноорог хадгалах (сервер ба төхөөрөмж дээр — AC-191), хүргэгдэхээс
 * өмнө засах/цуцлах (AC-112).
 */
export default function ComposeLetterScreen() {
  const t = useT();
  const errorText = useErrorText();
  const id = first(useLocalSearchParams<{ id?: string }>().id);
  const letter = useLetter(id);
  let body;
  if (!id) body = <ComposeForm />;
  else if (letter.isError && !letter.data) body = <ScreenState kind="error" message={errorText(letter.error)} onRetry={() => void letter.refetch()} />;
  else if (letter.isPending || !letter.data) body = <ScreenState kind="loading" rows={4} />;
  else body = <ComposeForm letter={letter.data} />;
  return (
    <StackScreen title={id ? t('letters.compose.editTitle') : t('letters.compose.title')} testID="screen-S-66">
      {body}
    </StackScreen>
  );
}

function ComposeForm({ letter }: { letter?: Letter }) {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const tz = useUserTimezone();
  const myId = useSessionStore((s) => s.userId);
  const { disabled: offline } = useOnlineOnly();
  const key = letter?.id ?? NEW_LETTER;
  const saved = useLetterDraftStore((s) => s.drafts[key]);
  const putDraft = useLetterDraftStore((s) => s.put);
  const clearDraft = useLetterDraftStore((s) => s.clear);
  const [draft, setDraft] = useState<LetterDraft>(() => saved ?? (letter ? draftFromLetter(letter, tz) : { form: EMPTY_FORM, media: [] }));
  const [formError, setFormError] = useState<LetterFormError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'draft' | 'send' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const editable = !letter || canEditLetter(letter, myId);
  const form = draft.form;

  const update = (next: LetterDraft) => {
    setDraft(next);
    putDraft(key, next);
  };
  const setForm = (patch: Partial<LetterForm>) => update({ ...draft, form: { ...form, ...patch } });
  const setMedia = (media: DraftMedia[]) => update({ ...draft, media });

  const save = async (asDraft: boolean) => {
    const { deliverAt, error: invalid } = letterDeliverAt(form, tz, Date.now(), { draft: asDraft });
    setFormError(invalid);
    if (invalid) return;
    setSaving(asDraft ? 'draft' : 'send');
    setError(null);
    try {
      const mediaIds = await resolveMediaIds(draft.media);
      const common = {
        template: form.template,
        body: form.body,
        mediaIds,
        deliverAt,
        draft: asDraft,
      };
      const result = letter
        ? await updateLetter(letter.id, { ...common, occasionLabel: form.occasionLabel.trim() || null, version: letter.version })
        : await createLetter({ ...common, ...(form.occasionLabel.trim() ? { occasionLabel: form.occasionLabel.trim() } : {}) });
      queryClient.setQueryData(letterKey(result.id), result);
      clearDraft(key);
      void invalidateLetters(queryClient);
      if (asDraft && !letter) router.replace({ pathname: '/together/letters/compose', params: { id: result.id } });
      else router.replace({ pathname: '/together/letters', params: { box: 'sent' } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(null);
    }
  };

  const cancel = async () => {
    if (!letter) return;
    setConfirmCancel(false);
    try {
      await cancelLetter(letter.id);
      clearDraft(key);
      void invalidateLetters(queryClient);
      router.replace({ pathname: '/together/letters', params: { box: 'sent' } });
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!editable) {
    return (
      <View style={styles.body}>
        <FormMessage kind="info" text={t('letters.compose.delivered')} testID="letter-not-editable" />
        <AppButton label={t('letters.compose.open')} onPress={() => router.replace({ pathname: '/together/letters/[id]', params: { id: letter?.id ?? '' } })} testID="letter-open-read" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {error ? <FormMessage text={error} testID="letter-error" /> : null}
      <AppText variant="label" color="textMuted">
        {t('letters.compose.template')}
      </AppText>
      <View style={styles.templates}>
        {LETTER_TEMPLATES.map((tpl) => (
          <TemplateCard key={tpl} template={tpl} selected={form.template === tpl} onPress={() => setForm({ template: tpl })} />
        ))}
      </View>
      <TextField
        label={t('letters.compose.body')}
        value={form.body}
        onChangeText={(body) => setForm({ body })}
        multiline
        maxLength={LETTER_BODY_MAX}
        error={formError === 'bodyRequired' ? t('letters.compose.bodyRequired') : null}
        placeholder={t('letters.compose.placeholder')}
        testID="letter-body"
      />
      <PhotoStrip media={draft.media} onChange={setMedia} testID="letter-photos" />
      <AppText variant="label" color="textMuted">
        {t('letters.compose.when')}
      </AppText>
      <View style={styles.chips}>
        <Chip label={t('letters.compose.now')} selected={form.mode === 'now'} onPress={() => setForm({ mode: 'now' })} testID="letter-mode-now" />
        <Chip label={t('letters.compose.scheduled')} selected={form.mode === 'scheduled'} onPress={() => setForm({ mode: 'scheduled' })} testID="letter-mode-scheduled" />
      </View>
      {form.mode === 'scheduled' ? (
        <>
          <TextField
            label={t('letters.compose.date')}
            value={form.date}
            onChangeText={(date) => setForm({ date })}
            error={formError === 'dateInvalid' ? t('letters.compose.dateInvalid') : null}
            testID="letter-date"
          />
          <TextField
            label={t('letters.compose.time')}
            value={form.time}
            onChangeText={(time) => setForm({ time })}
            error={formError === 'timeInvalid' ? t('letters.compose.timeInvalid') : formError === 'inPast' ? t('letters.compose.inPast') : null}
            hint={t('letters.compose.zone', { zone: tz })}
            testID="letter-time"
          />
          <TextField
            label={t('letters.compose.occasion')}
            value={form.occasionLabel}
            onChangeText={(occasionLabel) => setForm({ occasionLabel })}
            maxLength={OCCASION_LABEL_MAX}
            placeholder={t('letters.compose.occasionPlaceholder')}
            testID="letter-occasion"
          />
        </>
      ) : null}
      <View style={styles.actions}>
        <AppButton variant="secondary" label={t('letters.compose.saveDraft')} onPress={() => void save(true)} loading={saving === 'draft'} disabled={offline || saving !== null} testID="letter-save-draft" />
        <AppButton
          label={form.mode === 'scheduled' ? t('letters.compose.schedule') : t('letters.compose.send')}
          onPress={() => void save(false)}
          loading={saving === 'send'}
          disabled={offline || saving !== null}
          testID="letter-send"
        />
      </View>
      {offline ? <FormMessage kind="info" text={t('letters.compose.offline')} testID="letter-offline" /> : null}
      {letter ? <AppButton variant="ghost" label={t('letters.compose.cancelLetter')} onPress={() => setConfirmCancel(true)} testID="letter-cancel" /> : null}
      <ConfirmSheet
        visible={confirmCancel}
        title={t('letters.compose.cancelTitle')}
        body={t('letters.compose.cancelBody')}
        confirmLabel={t('letters.compose.cancelLetter')}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirmCancel(false)}
        testID="letter-cancel-sheet"
      />
    </ScrollView>
  );
}

function TemplateCard({ template, selected, onPress }: { template: LetterTemplate; selected: boolean; onPress: () => void }) {
  const t = useT();
  const paper = usePaperColor(template);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      aria-checked={selected}
      accessibilityLabel={t(`letters.template.${template}`)}
      testID={`letter-template-${template}`}
      style={[styles.template, { backgroundColor: paper.bg, borderColor: selected ? paper.accent : paper.border, borderWidth: selected ? 2 : 1 }]}
    >
      <AppText variant="caption" style={{ color: paper.ink }}>
        {t(`letters.template.${template}`)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  templates: { flexDirection: 'row', gap: spacing.xs },
  template: { flex: 1, height: 72, borderRadius: radius.input, alignItems: 'center', justifyContent: 'flex-end', padding: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
});
