import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Images, Lock, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  createGiftIdea,
  deleteGiftIdea,
  GIFT_TEXT_MAX,
  giftIdeasKey,
  invalidateOccasions,
  OCCASION_NOTE_MAX,
  type OccasionDetail,
  putOccasionNote,
  REMINDER_OPTIONS,
  setGiftIdeaDone,
  useGiftIdeas,
  useOccasion,
} from '@/api/queries/anniversaries';
import { useMemoriesInfinite } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { useCountdownText } from '@/components/occasions/MilestoneHorizon';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { occasionCountdown } from '@/domain/occasionCountdown';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDate, formatDateLong, todayIn, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * S-61 тэмдэглэлт өдрийн дэлгэрэнгүй (FR-8.3…8.5, 8.7): тоолуур (AC-103), тэмдэглэл ба
 * хавсаргасан дурсамж (AC-105), сануулга 7/1/0 (AC-104), нууц бэлгийн санаа — зөвхөн өөрийнх (AC-40).
 */
export default function OccasionDetailScreen() {
  const t = useT();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ key?: string }>();
  const key = first(params.key);
  const detail = useOccasion(key);
  let body;
  if (detail.data) body = <OccasionBody key={detail.data.version} detail={detail.data} />;
  else if (detail.isError) body = <ScreenState kind="error" message={errorText(detail.error)} onRetry={() => void detail.refetch()} />;
  else body = <ScreenState kind="loading" rows={4} />;
  return (
    <StackScreen title={detail.data?.occasion.title ?? t('occasions.detailTitle')} testID="screen-S-61-detail">
      {body}
    </StackScreen>
  );
}

function OccasionBody({ detail }: { detail: OccasionDetail }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const tz = useUserTimezone();
  const countdownText = useCountdownText();
  const { disabled: offline } = useOnlineOnly();
  const o = detail.occasion;
  const [note, setNote] = useState(detail.note ?? '');
  const [memoryIds, setMemoryIds] = useState<string[]>(() => detail.memories.map((m) => m.id));
  const [reminderDays, setReminderDays] = useState<number[]>(detail.reminderDays);
  const [picking, setPicking] = useState(false);
  const recent = useMemoriesInfinite({}, { enabled: picking });
  const save = useMutation({
    mutationFn: () => putOccasionNote(o.occasionKey, { note: note.trim() || null, memoryIds, reminderDays, version: detail.version }),
    onSuccess: async (next) => {
      queryClient.setQueryData(['occasion', o.occasionKey], next);
      setPicking(false);
      await invalidateOccasions(queryClient);
    },
  });
  const toggleMemory = (id: string) => setMemoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const toggleReminder = (d: number) => setReminderDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort((a, b) => b - a)));
  const known = new Map([...detail.memories, ...(recent.data?.pages.flatMap((p) => p.items) ?? [])].map((m) => [m.id, m]));
  const attached = memoryIds.map((id) => known.get(id)).filter((m) => !!m);

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card testID="occasion-summary">
        <AppText variant="caption" color="textMuted">
          {t(`occasions.kind.${o.kind}`)} · {o.recurring ? t('occasions.recurring') : t('occasions.once')}
        </AppText>
        <AppText variant="h2">{formatDateLong(o.nextOn, locale)}</AppText>
        <AppText variant="h3" color="primary" testID="occasion-countdown">
          {countdownText(occasionCountdown(o, todayIn(tz)))}
        </AppText>
        {o.anniversaryId ? (
          <AppButton
            variant="ghost"
            label={t('occasions.edit')}
            onPress={() => router.push({ pathname: '/together/occasions/edit', params: { id: o.anniversaryId ?? '' } })}
            testID="occasion-edit"
          />
        ) : null}
      </Card>

      <Card testID="occasion-note-card">
        <TextField
          label={t('occasions.note')}
          placeholder={t('occasions.notePlaceholder')}
          value={note}
          onChangeText={(v) => setNote(v.slice(0, OCCASION_NOTE_MAX))}
          multiline
          testID="occasion-note"
        />
        <AppText variant="label" color="textMuted">
          {t('occasions.memories')}
        </AppText>
        {attached.length === 0 ? <AppText color="textMuted">{t('occasions.memoriesEmpty')}</AppText> : null}
        {attached.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/memories/${m.id}`)}
            accessibilityRole="link"
            accessibilityLabel={m.title}
            testID={`occasion-memory-${m.id}`}
            style={styles.memory}
          >
            <Images size={18} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText style={styles.flex}>{m.title}</AppText>
            <AppText variant="caption" color="textMuted">
              {formatDate(m.occurredOn, dateFormat)}
            </AppText>
          </Pressable>
        ))}
        {picking ? (
          <View style={styles.picker} testID="occasion-memory-picker">
            <AppText variant="caption" color="textMuted">
              {t('occasions.attachHint')}
            </AppText>
            <ChipRow wrap>
              {(recent.data?.pages.flatMap((p) => p.items) ?? []).map((m) => (
                <Chip key={m.id} label={m.title} selected={memoryIds.includes(m.id)} onPress={() => toggleMemory(m.id)} testID={`occasion-pick-${m.id}`} />
              ))}
            </ChipRow>
          </View>
        ) : (
          <AppButton variant="secondary" label={t('occasions.attach')} onPress={() => setPicking(true)} testID="occasion-attach" />
        )}
        <AppText variant="label" color="textMuted">
          {t('occasions.reminders')}
        </AppText>
        <ChipRow wrap>
          {REMINDER_OPTIONS.map((d) => (
            <Chip key={d} label={t(`occasions.reminder.r${d}`)} selected={reminderDays.includes(d)} onPress={() => toggleReminder(d)} testID={`occasion-reminder-${d}`} />
          ))}
        </ChipRow>
        {save.error ? <FormMessage text={errorText(save.error)} testID="occasion-save-error" /> : null}
        {save.isSuccess ? <FormMessage kind="success" text={t('occasions.saved')} testID="occasion-saved" /> : null}
        <AppButton label={t('occasions.save')} onPress={() => save.mutate()} loading={save.isPending} disabled={offline} testID="occasion-save" />
      </Card>

      <GiftIdeas occasionKey={o.occasionKey} />
    </ScrollView>
  );
}

/** Нууц бэлгийн санаа (FR-8.7, AC-40, INV-04): сервер зөвхөн өөрийнхийг буцаана. */
function GiftIdeas({ occasionKey }: { occasionKey: string }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const gifts = useGiftIdeas(occasionKey);
  const [text, setText] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: giftIdeasKey(occasionKey) });
  const add = useMutation({
    mutationFn: () => createGiftIdea(occasionKey, text.trim()),
    onSuccess: () => {
      setText('');
      return refresh();
    },
  });
  const toggle = useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => setGiftIdeaDone(id, done), onSettled: refresh });
  const remove = useMutation({ mutationFn: (id: string) => deleteGiftIdea(id), onSettled: refresh });
  const error = add.error ?? toggle.error ?? remove.error;
  return (
    <Card testID="occasion-gifts">
      <View style={styles.row}>
        <Lock size={18} color={colors.textMuted} strokeWidth={iconStroke} />
        <AppText variant="h3" accessibilityRole="header" style={styles.flex}>
          {t('occasions.gifts')}
        </AppText>
      </View>
      <AppText variant="caption" color="textMuted">
        {t('occasions.giftsHint')}
      </AppText>
      {(gifts.data ?? []).map((g) => (
        <View key={g.id} style={styles.row} testID={`gift-${g.id}`}>
          <Pressable
            onPress={() => toggle.mutate({ id: g.id, done: !g.done })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: g.done }}
            aria-checked={g.done}
            accessibilityLabel={g.text}
            style={[styles.box, { borderColor: g.done ? colors.primary : colors.border, backgroundColor: g.done ? colors.primary : 'transparent' }]}
            testID={`gift-toggle-${g.id}`}
          >
            {g.done ? <Check size={16} color={colors.onPrimary} strokeWidth={iconStroke} /> : null}
          </Pressable>
          <AppText style={[styles.flex, g.done && styles.struck]}>{g.text}</AppText>
          <Pressable onPress={() => remove.mutate(g.id)} accessibilityRole="button" accessibilityLabel={t('occasions.removeGift')} style={styles.iconButton} testID={`gift-remove-${g.id}`}>
            <X size={18} color={colors.textMuted} strokeWidth={iconStroke} />
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <TextField
            label={t('occasions.giftLabel')}
            placeholder={t('occasions.giftPlaceholder')}
            value={text}
            onChangeText={(v) => setText(v.slice(0, GIFT_TEXT_MAX))}
            testID="gift-input"
          />
        </View>
        <AppButton variant="secondary" label={t('occasions.addGift')} onPress={() => add.mutate()} disabled={offline || !text.trim()} loading={add.isPending} testID="gift-add" />
      </View>
      {error ? <FormMessage text={errorText(error)} testID="gift-error" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  flex: { flex: 1 },
  memory: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touchTarget },
  picker: { gap: spacing.xs },
  box: { width: 26, height: 26, borderRadius: radius.input / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center', margin: (touchTarget - 26) / 2 },
  struck: { textDecorationLine: 'line-through' },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
