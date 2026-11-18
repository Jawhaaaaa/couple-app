import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { DASHBOARD_KEY } from '@/api/queries/dashboard';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { closeSheet, SheetScreen } from '@/components/SheetScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useT } from '@/i18n';
import { AnimatedMoment } from '@/motion/AnimatedMoment';
import { playHaptic } from '@/motion/haptics';
import { ParticleBurst } from '@/motion/ParticleBurst';
import { clampThinking, sendSignal, THINKING_MAX } from '@/signals/sendSignal';

const CLOSE_AFTER_MS = 1100;

type Result = { kind: 'sent' | 'queued' } | { kind: 'cooldown'; seconds: number } | { kind: 'failed'; error: unknown } | null;

/**
 * S-26 «Чамайг бодож байна» (`formSheet`, FR-4.3): нэг мөр, ≤ 80 тэмдэгт амьд тоолууртай;
 * 81 дэх тэмдэгт оролтод орохгүй (сервер ч 400 `TEXT_TOO_LONG`). Илгээхэд ANIM-03.
 */
export default function ThinkingSheet() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { offline } = useNetworkStatus();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const done = result?.kind === 'sent' || result?.kind === 'queued';
  const length = text.length;

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(closeSheet, CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const submit = async () => {
    if (sending || done || length > THINKING_MAX) return;
    setSending(true);
    const outcome = await sendSignal({ kind: 'THINKING', text }, { offline });
    setSending(false);
    if (outcome.status === 'sent' || outcome.status === 'queued') {
      playHaptic('ANIM-03');
      setResult({ kind: outcome.status });
      if (outcome.status === 'sent') void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    } else if (outcome.status === 'cooldown') setResult({ kind: 'cooldown', seconds: outcome.seconds });
    else setResult({ kind: 'failed', error: outcome.error });
  };

  const tooLong = result?.kind === 'failed' && result.error instanceof ApiRequestError && result.error.code === 'TEXT_TOO_LONG';
  return (
    <SheetScreen title={t('thinking.title')} testID="screen-S-26">
      <AppText color="textMuted">{t('thinking.body')}</AppText>
      <TextField
        label={t('thinking.label')}
        placeholder={t('thinking.placeholder')}
        value={text}
        onChangeText={(raw) => setText(clampThinking(raw))}
        maxLength={THINKING_MAX}
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        error={tooLong ? t('thinking.tooLong') : null}
        editable={!done}
        testID="thinking-input"
      />
      <AppText
        variant="caption"
        color={length >= THINKING_MAX ? 'warning' : 'textMuted'}
        style={styles.counter}
        accessibilityLabel={t('thinking.counterA11y', { length, max: THINKING_MAX })}
        testID="thinking-counter"
      >
        {t('thinking.counter', { length, max: THINKING_MAX })}
      </AppText>
      {result?.kind === 'cooldown' ? <FormMessage kind="info" text={t('thinking.cooldown', { seconds: result.seconds })} testID="thinking-cooldown" /> : null}
      {result?.kind === 'failed' && !tooLong ? <FormMessage text={errorText(result.error)} testID="thinking-error" /> : null}
      <AnimatedMoment anim="ANIM-03" playing={done} style={styles.stage}>
        {() => (
          <View style={styles.stage}>
            {done ? (
              <>
                <ParticleBurst burstKey="thinking" count={6} distance={70} />
                <AppText variant="h3" accessibilityLiveRegion="polite" testID={`thinking-${result?.kind}`}>
                  {result?.kind === 'queued' ? t('home.heart.queued') : t('thinking.sent')}
                </AppText>
              </>
            ) : (
              <AppButton label={t('thinking.send')} onPress={() => void submit()} loading={sending} testID="thinking-send" />
            )}
          </View>
        )}
      </AnimatedMoment>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  counter: { alignSelf: 'flex-end' },
  stage: { minHeight: 64, alignItems: 'center', justifyContent: 'center' },
});
