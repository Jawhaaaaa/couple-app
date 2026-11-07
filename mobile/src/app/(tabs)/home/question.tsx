import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { type Dashboard, DASHBOARD_KEY } from '@/api/queries/dashboard';
import { partnerName, useCoupleQuery } from '@/api/queries/pairing';
import {
  ANSWER_MAX,
  answerTodayQuestion,
  type DailyQuestion,
  QUESTION_HISTORY_KEY,
  QUESTION_TODAY_KEY,
  questionText,
  useQuestionHistory,
  useTodayQuestion,
} from '@/api/queries/questions';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { FrostedPlaceholder, RevealAnswer } from '@/components/home/RevealAnswer';
import { Mascot } from '@/components/Mascot';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { TextField } from '@/components/TextField';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDate, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

function isNotPaired(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'NOT_PAIRED';
}

/**
 * S-22 Өдрийн асуулт (FR-3.5, AC-15, AC-75): өнөөдрийн асуулт одоогийн хэлээр, хариулт
 * ≤ 1000. Өөрөө хариулсны дараа хамтрагчийнх царцсан («… хариулахыг хүлээж байна»);
 * хоёулаа хариулмагц (`question.revealed` → `['question']`) ANIM-19-өөр тодорно. Доор нь
 * өнгөрсөн асуултууд хоёр хариулттайгаа.
 */
export default function QuestionScreen() {
  const t = useT();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const today = useTodayQuestion();
  const paired = !isNotPaired(today.error);
  const history = useQuestionHistory({ enabled: !!today.data });
  const couple = useCoupleQuery({ enabled: paired });
  const name =
    partnerName(couple.data) ?? queryClient.getQueryData<Dashboard>(DASHBOARD_KEY)?.partner?.name ?? t('home.partnerFallback');

  const items = (history.data?.pages.flatMap((p) => p.items) ?? []).filter((q) => q.coupleDay !== today.data?.coupleDay);

  if (today.isPending) {
    return (
      <StackScreen title={t('question.title')} testID="screen-S-22">
        <ScreenState kind="loading" rows={3} />
      </StackScreen>
    );
  }
  if (!paired) {
    return (
      <StackScreen title={t('question.title')} testID="screen-S-22">
        <View style={styles.solo} testID="question-solo">
          <Mascot size={96} pose="wave" />
          <AppText style={styles.center}>{t('question.soloBody')}</AppText>
          <AppButton label={t('home.solo.action')} onPress={() => router.push('/waiting')} testID="question-solo-invite" />
        </View>
      </StackScreen>
    );
  }
  if (!today.data) {
    return (
      <StackScreen title={t('question.title')} testID="screen-S-22">
        <ScreenState kind="error" message={errorText(today.error)} onRetry={() => void today.refetch()} />
      </StackScreen>
    );
  }

  return (
    <StackScreen title={t('question.title')} testID="screen-S-22">
      <FlatList
        data={items}
        keyExtractor={(q) => `${q.coupleDay}-${q.question.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <TodayCard question={today.data} partner={name} />
            {items.length > 0 ? (
              <AppText variant="h3" accessibilityRole="header">
                {t('question.history')}
              </AppText>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <HistoryItem question={item} partner={name} />}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          history.isFetchingNextPage ? (
            <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.footer} />
          ) : history.isError ? (
            <AppButton variant="ghost" label={t('common.retry')} onPress={() => void history.refetch()} testID="question-history-retry" />
          ) : undefined
        }
      />
    </StackScreen>
  );
}

function TodayCard({ question, partner }: { question: DailyQuestion; partner: string }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const { disabled: offline } = useOnlineOnly();
  const [text, setText] = useState('');

  const answer = useMutation({
    mutationFn: answerTodayQuestion,
    onSuccess: (updated) => {
      queryClient.setQueryData(QUESTION_TODAY_KEY, updated);
      if (updated.partnerAnswer) void queryClient.invalidateQueries({ queryKey: QUESTION_HISTORY_KEY });
      setText('');
    },
    onError: (error) => {
      // Өөр төхөөрөмжөөс аль хэдийн хариулсан — серверийн одоогийн төлвийг авна
      if (error instanceof ApiRequestError && error.code === 'ALREADY_ANSWERED') {
        void queryClient.invalidateQueries({ queryKey: QUESTION_TODAY_KEY });
      }
    },
  });
  const alreadyAnswered = answer.error instanceof ApiRequestError && answer.error.code === 'ALREADY_ANSWERED';
  const trimmed = text.trim();

  return (
    <Card testID="question-today">
      <AppText variant="caption" color="textMuted">
        {t('question.today')}
      </AppText>
      <AppText variant="quote" testID="question-text">
        {questionText(question.question, locale)}
      </AppText>

      {question.myAnswer ? (
        <View style={[styles.answer, { backgroundColor: colors.surfaceRaised }]} testID="question-my-answer">
          <AppText variant="label" color="textMuted">
            {t('question.mine')}
          </AppText>
          <AppText>{question.myAnswer.text}</AppText>
        </View>
      ) : (
        <>
          <TextField
            label={t('question.label')}
            placeholder={t('question.placeholder')}
            value={text}
            onChangeText={(v) => setText(v.slice(0, ANSWER_MAX))}
            maxLength={ANSWER_MAX}
            multiline
            hint={t('question.counter', { length: text.length, max: ANSWER_MAX })}
            testID="question-input"
          />
          <AppButton
            label={t('question.submit')}
            onPress={() => answer.mutate(trimmed)}
            disabled={offline || trimmed.length === 0}
            loading={answer.isPending}
            testID="question-submit"
          />
        </>
      )}
      {alreadyAnswered ? <FormMessage kind="info" text={t('question.alreadyAnswered')} testID="question-already" /> : null}
      {answer.error && !alreadyAnswered ? <FormMessage text={errorText(answer.error)} testID="question-error" /> : null}

      {question.partnerAnswer ? (
        <RevealAnswer
          questionKey={`${question.coupleDay}-${question.question.id}`}
          label={t('question.partners', { name: partner })}
          text={question.partnerAnswer.text}
        />
      ) : question.myAnswer ? (
        <FrostedPlaceholder
          label={t('question.partners', { name: partner })}
          text={t('question.waiting', { name: partner })}
          testID="question-partner-waiting"
        />
      ) : question.partnerAnswered ? (
        <FrostedPlaceholder
          label={t('question.partners', { name: partner })}
          text={t('question.answerToSee', { name: partner })}
          testID="question-partner-hidden"
        />
      ) : null}
    </Card>
  );
}

function HistoryItem({ question, partner }: { question: DailyQuestion; partner: string }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  return (
    <Card testID="question-history-item">
      <AppText variant="caption" color="textMuted">
        {formatDate(question.coupleDay, dateFormat)}
      </AppText>
      <AppText variant="bodyStrong">{questionText(question.question, locale)}</AppText>
      <View style={[styles.answer, { backgroundColor: colors.surfaceRaised }]}>
        <AppText variant="label" color="textMuted">
          {t('question.mine')}
        </AppText>
        <AppText>{question.myAnswer?.text ?? t('question.noAnswer')}</AppText>
      </View>
      <View style={[styles.answer, { backgroundColor: colors.surfaceRaised }]}>
        <AppText variant="label" color="textMuted">
          {t('question.partners', { name: partner })}
        </AppText>
        <AppText>{question.partnerAnswer?.text ?? t('question.noAnswer')}</AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { gap: spacing.md },
  footer: { padding: spacing.md },
  answer: { borderRadius: radius.input, padding: spacing.md, gap: spacing.xxs },
  solo: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  center: { textAlign: 'center' },
});
