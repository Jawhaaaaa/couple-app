import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  type CheckIn,
  type CheckInInput,
  checkInsKey,
  enqueueTodayCheckIn,
  invalidateCheckIns,
  putTodayCheckIn,
  setCheckinAutoShare,
  useCheckinAutoShare,
  useCheckIns,
} from '@/api/queries/checkins';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { MoodChart } from '@/components/together/MoodChart';
import { MoodPicker } from '@/components/together/MoodPicker';
import { emptyStateText } from '@/content/emptyStates';
import { buildMoodDays, CHECKIN_NOTE_MAX, MOOD_RANGES, type MoodRange, moodRange } from '@/domain/moodChart';
import { useErrorText } from '@/hooks/useErrorText';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { todayIn, useT } from '@/i18n';
import { useCouplePeople } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/**
 * S-69 сэтгэл санааны check-in (FR-11.1…11.3): 5 түвшин (ANIM-15), тэмдэглэл, хуваалцах эсэх —
 * анхдагч унтраастай, «өдөр бүр автоматаар» тохиргоотой (AC-183); хүний бүсийн өдөрт нэг, өнөөдрийнх
 * засагдана, өнгөрсөн өдрийнх үгүй (AC-114); сар/улирлын график — хамтрагчийн зөвхөн хуваалцсан өдөр
 * (AC-115). Сүлжээгүй бол outbox.
 */
export default function CheckInScreen() {
  const t = useT();
  const errorText = useErrorText();
  const tz = useUserTimezone();
  const today = todayIn(tz);
  const [range, setRange] = useState<MoodRange>('month');
  const { from, to } = moodRange(today, range);
  const series = useCheckIns(from, to);
  const autoShare = useCheckinAutoShare();

  let body;
  if (series.isError && !series.data) body = <ScreenState kind="error" message={errorText(series.error)} onRetry={() => void series.refetch()} />;
  else if (series.isPending || autoShare.isPending) body = <ScreenState kind="loading" rows={4} />;
  else {
    const mineToday = series.data.mine.find((c) => c.localDate === today) ?? null;
    body = (
      <CheckInBody
        key={today}
        today={today}
        mineToday={mineToday}
        autoShare={autoShare.data ?? false}
        range={range}
        onRange={setRange}
        days={buildMoodDays(series.data, from, to)}
        hasHistory={series.data.mine.length > 0 || series.data.partner.length > 0}
        seriesKey={checkInsKey(from, to)}
      />
    );
  }
  return (
    <StackScreen title={t('checkin.title')} testID="screen-S-69">
      {body}
    </StackScreen>
  );
}

interface BodyProps {
  today: string;
  mineToday: CheckIn | null;
  autoShare: boolean;
  range: MoodRange;
  onRange: (r: MoodRange) => void;
  days: ReturnType<typeof buildMoodDays>;
  hasHistory: boolean;
  seriesKey: readonly unknown[];
}

function CheckInBody({ today, mineToday, autoShare, range, onRange, days, hasHistory, seriesKey }: BodyProps) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const { offline } = useNetworkStatus();
  const { partner } = useCouplePeople();
  const [level, setLevel] = useState<number | null>(mineToday?.level ?? null);
  const [note, setNote] = useState(mineToday?.note ?? '');
  const [shared, setShared] = useState(mineToday?.shared ?? autoShare);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null);
  const partnerName = partner?.name || t('letters.partnerFallback');

  const save = async () => {
    if (level == null) {
      setMessage({ kind: 'error', text: t('checkin.pickLevel') });
      return;
    }
    const input: CheckInInput = { level, shared, ...(note.trim() ? { note: note.trim() } : {}) };
    setSaving(true);
    setMessage(null);
    try {
      if (offline) {
        await enqueueTodayCheckIn(input);
        setMessage({ kind: 'info', text: t('checkin.queued') });
        return;
      }
      const saved = await putTodayCheckIn(input);
      queryClient.setQueryData<{ mine: CheckIn[]; partner: CheckIn[] }>(seriesKey, (data) =>
        data ? { ...data, mine: [...data.mine.filter((c) => c.localDate !== saved.localDate), saved] } : data,
      );
      void invalidateCheckIns(queryClient);
      setMessage({ kind: 'success', text: mineToday ? t('checkin.updated') : t('checkin.saved') });
    } catch (e) {
      if (e instanceof TypeError) {
        // Сервер хүрэхгүй — outbox-оор дараа нь
        await enqueueTodayCheckIn(input);
        setMessage({ kind: 'info', text: t('checkin.queued') });
      } else setMessage({ kind: 'error', text: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const toggleAuto = async (value: boolean) => {
    try {
      await setCheckinAutoShare(queryClient, value);
      if (!mineToday) setShared(value);
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) });
    }
  };

  const empty = emptyStateText('S-69', locale);
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="h3" accessibilityRole="header">
          {mineToday ? t('checkin.todayDone') : t('checkin.question')}
        </AppText>
        <MoodPicker value={level} onChange={setLevel} />
        <TextField label={t('checkin.note')} value={note} onChangeText={setNote} maxLength={CHECKIN_NOTE_MAX} multiline placeholder={t('checkin.notePlaceholder')} testID="checkin-note" />
        <ToggleRow
          label={t('checkin.shareToday', { name: partnerName })}
          note={shared ? t('checkin.sharedNote', { name: partnerName }) : t('checkin.privateNote')}
          value={shared}
          onChange={setShared}
          testID="checkin-share"
        />
        <ToggleRow label={t('checkin.autoShare')} note={t('checkin.autoShareNote')} value={autoShare} onChange={(v) => void toggleAuto(v)} testID="checkin-auto-share" />
        {message ? <FormMessage kind={message.kind} text={message.text} testID="checkin-message" /> : null}
        <AppButton label={mineToday ? t('checkin.update') : t('checkin.save')} onPress={() => void save()} loading={saving} testID="checkin-save" />
        <AppText variant="caption" color="textMuted">
          {t('checkin.pastLocked', { date: today })}
        </AppText>
      </View>
      <SegmentedTabs options={MOOD_RANGES.map((r) => ({ key: r, label: t(`checkin.range.${r}`) }))} value={range} onChange={onRange} testID="checkin-range" />
      {hasHistory ? (
        <MoodChart days={days} partnerName={partnerName} />
      ) : (
        <View style={styles.empty}>
          <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => void save()} />
        </View>
      )}
    </ScrollView>
  );
}

function ToggleRow({ label, note, value, onChange, testID }: { label: string; note: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const colors = useColors();
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <AppText>{label}</AppText>
        <AppText variant="caption" color="textMuted">
          {note}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} accessibilityRole="switch" trackColor={{ true: colors.primary, false: colors.border }} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
  empty: { minHeight: 260 },
});
