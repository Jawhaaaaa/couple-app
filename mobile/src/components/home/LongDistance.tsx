import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plane } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { type Dashboard, DASHBOARD_KEY, setNextMeetup } from '@/api/queries/dashboard';
import { maskBirthDateInput, parseBirthDateInput } from '@/auth/birthDate';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { countdownTo, formatCountdown } from '@/domain/partnerTime';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDate, formatNumber, formatTime, isCalendarDate, useT } from '@/i18n';
import { useMotionPreference } from '@/motion/useMotionPreference';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

type LongDistanceData = NonNullable<Dashboard['longDistance']>;

/**
 * Алс зайн хэсэг (FR-3.7, AC-74): агаарын шугамын зай «≈ 3 009 км», дараагийн уулзалт
 * хүртэл «3 өдөр 5 цаг», «Уулзалт тэмдэглэх» sheet (`PUT /couple/next-meetup`).
 */
export function LongDistanceBlock({ data, now }: { data: LongDistanceData; now: number }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const [open, setOpen] = useState(false);
  const countdown = data.nextMeetupAt ? countdownTo(data.nextMeetupAt, now) : null;
  return (
    <Card testID="home-long-distance">
      <View style={styles.row}>
        <Plane size={22} color={colors.primary} strokeWidth={iconStroke} />
        <AppText variant="h3" testID="home-distance">
          {t('home.distance.km', { km: formatNumber(Math.round(data.distanceKm), locale) })}
        </AppText>
      </View>
      <AppText color="textMuted" testID="home-meetup">
        {countdown ? t('home.distance.meetupIn', { when: formatCountdown(countdown, t) }) : t('home.distance.noMeetup')}
      </AppText>
      <AppButton
        variant="secondary"
        label={countdown ? t('home.distance.editMeetup') : t('home.distance.setMeetup')}
        onPress={() => setOpen(true)}
        testID="home-meetup-open"
      />
      {open ? <MeetupSheet current={data.nextMeetupAt ?? null} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

/** `ЦЦ:ММ` маск (4 цифр хүртэл). */
export function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** Төхөөрөмжийн бүсийн огноо + цаг → ISO агшин; буруу бол `null`. */
export function meetupInstant(date: string | null, time: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!date || !isCalendarDate(date) || !m) return null;
  const [hours, minutes] = [Number(m[1]), Number(m[2])];
  if (hours > 23 || minutes > 59) return null;
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, hours, minutes);
}

function isFuture(instant: Date | null): instant is Date {
  return !!instant && instant.getTime() > Date.now();
}

function MeetupSheet({ current, onClose }: { current: string | null; onClose: () => void }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const level = useMotionPreference();
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    mutationFn: setNextMeetup,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      void queryClient.invalidateQueries({ queryKey: ['couple'] });
      onClose();
    },
  });

  const instant = meetupInstant(parseBirthDateInput(date), time);
  const invalid = submitted && !isFuture(instant);
  const submit = () => {
    setSubmitted(true);
    if (isFuture(instant)) save.mutate(instant.toISOString());
  };

  return (
    <Modal transparent visible animationType={level === 'full' ? 'slide' : level === 'reduced' ? 'fade' : 'none'} onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="meetup-backdrop" />
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.border }]} testID="meetup-sheet">
          <AppText variant="h2" accessibilityRole="header">
            {t('home.meetup.title')}
          </AppText>
          {current ? (
            <AppText color="textMuted" testID="meetup-current">
              {t('home.meetup.current', {
                date: formatDate(new Date(current), dateFormat),
                time: formatTime(new Date(current), locale),
              })}
            </AppText>
          ) : null}
          <TextField
            label={t('home.meetup.date')}
            placeholder={t('auth.fields.birthDatePlaceholder')}
            value={date}
            onChangeText={(raw) => setDate(maskBirthDateInput(raw))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10}
            testID="meetup-date"
          />
          <TextField
            label={t('home.meetup.time')}
            placeholder={t('home.meetup.timePlaceholder')}
            value={time}
            onChangeText={(raw) => setTime(maskTimeInput(raw))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={5}
            error={invalid ? t('home.meetup.invalid') : null}
            testID="meetup-time"
          />
          {save.error ? <FormMessage text={errorText(save.error)} testID="meetup-error" /> : null}
          <AppButton label={t('common.save')} onPress={submit} disabled={offline} loading={save.isPending} testID="meetup-save" />
          {current ? (
            <AppButton
              variant="ghost"
              label={t('home.meetup.clear')}
              onPress={() => save.mutate(null)}
              disabled={offline || save.isPending}
              testID="meetup-clear"
            />
          ) : null}
          <AppButton variant="ghost" label={t('common.cancel')} onPress={onClose} testID="meetup-cancel" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  fill: { flex: 1 },
  sheet: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
});
