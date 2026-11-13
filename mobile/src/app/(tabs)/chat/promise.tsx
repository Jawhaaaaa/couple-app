import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Handshake } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  fetchCurrentPromise,
  PROMISE_KEY,
  PROMISE_MAX,
  promiseOutcome,
  proposePromise,
  respondPromise,
  type SharedPromise,
} from '@/api/queries/chat';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { SheetScreen } from '@/components/SheetScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDateLong, type CalendarDate, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

function dateLabel(value: string | null | undefined, locale: 'mn' | 'en'): string {
  return value ? formatDateLong(value as CalendarDate, locale) : '';
}

/**
 * S-47 Хамтын амлалт (FR-6.11, AC-93): нэг нь санал болгож (≤ 140), нөгөө нь зөвшөөрнө/татгалзана;
 * зөвшөөрөгдвөл 7 хоног чатын толгойд; дуусахад хүн бүр «Амлалтаа биелүүлсэн үү?» гэж хариулна.
 * Үнэлгээ, оноо байхгүй (зарчим 6) — хариулт нь зөвхөн хоёрынх.
 */
export default function PromiseSheet() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const me = useSessionStore((s) => s.userId);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const current = useQuery({ queryKey: PROMISE_KEY, queryFn: fetchCurrentPromise });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async (action: () => Promise<SharedPromise>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      queryClient.setQueryData(PROMISE_KEY, next.status === 'DECLINED' ? null : next);
      setText('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const p = current.data;
  let body;
  if (current.isLoading) body = <ScreenState kind="loading" rows={2} />;
  else if (current.isError) body = <ScreenState kind="error" onRetry={() => void current.refetch()} />;
  else if (!p || p.status === 'DECLINED') {
    body = (
      <>
        <AppText color="textMuted">{t('chat.promise.intro')}</AppText>
        <TextField
          label={t('chat.promise.label')}
          placeholder={t('chat.promise.placeholder')}
          value={text}
          onChangeText={(v) => setText(v.slice(0, PROMISE_MAX))}
          maxLength={PROMISE_MAX}
          multiline
          testID="promise-input"
        />
        <AppText variant="caption" color="textMuted" style={styles.counter}>
          {text.length}/{PROMISE_MAX}
        </AppText>
        <AppButton
          label={t('chat.promise.propose')}
          disabled={!text.trim() || offline}
          loading={busy}
          onPress={() => void run(() => proposePromise(text.trim()))}
          testID="promise-propose"
        />
      </>
    );
  } else {
    const mine = p.proposer.id === me;
    body = (
      <>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="promise-card">
          <View style={styles.row}>
            <Handshake size={18} color={colors.primary} />
            <AppText variant="label" color="primary" testID="promise-status">
              {t(`chat.promise.status.${p.status}`)}
            </AppText>
          </View>
          <AppText variant="h3">{p.text}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('chat.promise.by', { name: p.proposer.displayName })}
            {p.startsOn && p.endsOn ? ` · ${dateLabel(p.startsOn, locale)} – ${dateLabel(p.endsOn, locale)}` : ''}
          </AppText>
        </View>
        {p.status === 'PROPOSED' && mine ? <FormMessage kind="info" text={t('chat.promise.waiting')} testID="promise-waiting" /> : null}
        {p.status === 'PROPOSED' && !mine ? (
          <View style={styles.actions}>
            <AppButton label={t('chat.promise.accept')} loading={busy} disabled={offline} onPress={() => void run(() => respondPromise(p.id, true))} testID="promise-accept" />
            <AppButton label={t('chat.promise.decline')} variant="ghost" disabled={busy || offline} onPress={() => void run(() => respondPromise(p.id, false))} testID="promise-decline" />
          </View>
        ) : null}
        {p.status === 'ENDED' ? (
          <View style={styles.outcome} testID="promise-outcome">
            <AppText variant="h3">{t('chat.promise.keptQuestion')}</AppText>
            <View style={styles.actions}>
              <AppButton
                label={t('chat.promise.kept')}
                variant={p.myOutcome === true ? 'primary' : 'secondary'}
                disabled={busy || offline}
                onPress={() => void run(() => promiseOutcome(p.id, true))}
                testID="promise-kept"
              />
              <AppButton
                label={t('chat.promise.notKept')}
                variant={p.myOutcome === false ? 'primary' : 'secondary'}
                disabled={busy || offline}
                onPress={() => void run(() => promiseOutcome(p.id, false))}
                testID="promise-not-kept"
              />
            </View>
            {p.partnerOutcome !== null && p.partnerOutcome !== undefined ? (
              <AppText color="textMuted" testID="promise-partner-outcome">
                {p.partnerOutcome ? t('chat.promise.partnerKept') : t('chat.promise.partnerNotKept')}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <SheetScreen title={t('chat.promise.title')} testID="screen-S-47">
      {body}
      {error ? <FormMessage text={errorText(error)} testID="promise-error" /> : null}
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  counter: { alignSelf: 'flex-end' },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  outcome: { gap: spacing.sm },
});
