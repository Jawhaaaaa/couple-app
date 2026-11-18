import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { answerSurvey, type Dashboard, DASHBOARD_KEY } from '@/api/queries/dashboard';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing, touchTarget } from '@/theme/tokens';

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * S-20-ийн нэг удаагийн санал асуулга (E1 §7, AC-207, GAP-17 анхдагч: 1–5 оноо). «Энэ апп бидэнд ойр
 * байх мэдрэмж өгдөг» — 1 (огт санал нийлэхгүй) … 5 (бүрэн санал нийлнэ) эсвэл «Алгасах» (`score: null`).
 * 30 хоногт ≤ 1-ийг сервер шийднэ (`Dashboard.survey.due` ← `SurveyService`); илгээсний дараа карт шууд
 * алга болж `['dashboard']` дахин татагдана. Өөр төхөөрөмжөөс аль хэдийн хариулсан (409 `SURVEY_NOT_DUE`)
 * бол алдаа биш — карт мөн алга.
 */
export function SurveyCard({ prompt }: { prompt: Dashboard['survey'] }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [closed, setClosed] = useState(false);
  const close = () => {
    setClosed(true);
    // persist хийгддэг нүүрний кэшээс ч картыг шууд авна (offline-д дахин гарахгүй)
    queryClient.setQueryData<Dashboard>(DASHBOARD_KEY, (d) => (d ? { ...d, survey: null } : d));
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
  };
  const answer = useMutation({
    mutationFn: answerSurvey,
    onSuccess: close,
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'SURVEY_NOT_DUE') close();
    },
  });

  if (!prompt?.due || closed) return null;
  const busy = answer.isPending;
  return (
    <Card testID="survey-card">
      <AppText variant="h3" accessibilityRole="header">
        {t('survey.title')}
      </AppText>
      <AppText variant="bodyStrong" testID="survey-statement">
        {t('survey.statement')}
      </AppText>
      <AppText color="textMuted">{t('survey.hint')}</AppText>
      <View style={styles.scores} accessibilityRole="radiogroup" accessibilityLabel={t('survey.statement')}>
        {SCORES.map((score) => (
          <Pressable
            key={score}
            onPress={() => answer.mutate(score)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('survey.scoreA11y', { score })}
            accessibilityState={{ disabled: busy, selected: answer.variables === score }}
            testID={`survey-score-${score}`}
            style={({ pressed }) => [
              styles.score,
              { borderColor: colors.border, backgroundColor: pressed || answer.variables === score ? colors.surfaceRaised : colors.surface },
            ]}
          >
            <AppText variant="bodyStrong">{String(score)}</AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.legend}>
        <AppText variant="caption" color="textMuted">
          {t('survey.low')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {t('survey.high')}
        </AppText>
      </View>
      {answer.error && !(answer.error instanceof ApiRequestError && answer.error.code === 'SURVEY_NOT_DUE') ? (
        <FormMessage text={errorText(answer.error)} testID="survey-error" />
      ) : null}
      <AppButton variant="ghost" label={t('survey.skip')} onPress={() => answer.mutate(null)} disabled={busy} testID="survey-skip" />
    </Card>
  );
}

const styles = StyleSheet.create({
  scores: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  score: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
