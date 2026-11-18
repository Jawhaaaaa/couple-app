import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deletePerspective, memoryKey, type Perspective, PERSPECTIVE_MAX, savePerspective } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

interface Props {
  memoryId: string;
  perspective: Perspective | null;
  /** Өнцгийн эзний нэр (миний бол «Миний өнцөг» гарчигтай). */
  ownerName: string;
  mine: boolean;
  disabled?: boolean;
}

/**
 * Хоёр өнцөг (FR-5.9, AC-82): хүн бүрийн өнцөг нэр, өнгөөрөө ялгаатай (миний — `primary`,
 * түүний — `secondary` хүрээ). Зөвхөн өөрийнхөө өнцгийг бичиж, засаж, арилгана (INV-03).
 */
export function PerspectiveCard({ memoryId, perspective, ownerName, mine, disabled }: Props) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(perspective?.text ?? '');
  const tone = mine ? colors.primary : colors.secondary;
  const testID = mine ? 'perspective-mine' : 'perspective-partner';

  const refresh = () => queryClient.invalidateQueries({ queryKey: memoryKey(memoryId) });
  const save = useMutation({
    mutationFn: () => savePerspective(memoryId, text.trim(), perspective?.version),
    onSuccess: () => {
      setEditing(false);
      void refresh();
    },
    // Зөрчил (VERSION_CONFLICT) бол шинэ хувилбарыг татаж, бичсэн текстийг хэвээр үлдээнэ
    onError: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: () => deletePerspective(memoryId),
    onSuccess: () => {
      setText('');
      setEditing(false);
      void refresh();
    },
  });

  const title = mine ? t('memories.perspective.mine') : t('memories.perspective.partners', { name: ownerName });
  return (
    <View style={[styles.card, { borderColor: tone, backgroundColor: colors.surface }]} testID={testID}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        <AppText variant="label" style={styles.flex} testID={`${testID}-author`}>
          {title}
        </AppText>
      </View>
      {editing ? (
        <>
          <TextField
            label={title}
            placeholder={t('memories.perspective.placeholder')}
            value={text}
            onChangeText={(v) => setText(v.slice(0, PERSPECTIVE_MAX))}
            maxLength={PERSPECTIVE_MAX}
            multiline
            hint={t('memories.counter', { length: text.length, max: PERSPECTIVE_MAX })}
            testID={`${testID}-input`}
          />
          <View style={styles.actions}>
            {perspective ? (
              <AppButton
                variant="ghost"
                label={t('memories.perspective.remove')}
                onPress={() => remove.mutate()}
                loading={remove.isPending}
                disabled={disabled}
                testID={`${testID}-remove`}
              />
            ) : null}
            <AppButton variant="secondary" label={t('common.cancel')} onPress={() => setEditing(false)} testID={`${testID}-cancel`} />
            <AppButton
              label={t('common.save')}
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={disabled || text.trim().length === 0}
              testID={`${testID}-save`}
            />
          </View>
        </>
      ) : perspective ? (
        <AppText testID={`${testID}-text`}>{perspective.text}</AppText>
      ) : (
        <AppText color="textMuted" testID={`${testID}-empty`}>
          {mine ? t('memories.perspective.mineEmpty') : t('memories.perspective.partnerEmpty', { name: ownerName })}
        </AppText>
      )}
      {save.error ? <FormMessage text={errorText(save.error)} testID={`${testID}-error`} /> : null}
      {remove.error ? <FormMessage text={errorText(remove.error)} testID={`${testID}-error`} /> : null}
      {mine && !editing ? (
        <AppButton
          variant="secondary"
          label={perspective ? t('memories.perspective.edit') : t('memories.perspective.write')}
          onPress={() => {
            setText(perspective?.text ?? '');
            setEditing(true);
          }}
          disabled={disabled}
          testID={`${testID}-edit`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: radius.input, padding: spacing.md, gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xs },
});
