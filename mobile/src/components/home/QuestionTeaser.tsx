import { router } from 'expo-router';
import { MessageCircleHeart } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { questionText, useTodayQuestion } from '@/api/queries/questions';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, spacing } from '@/theme/tokens';

/** Нүүрний «Өнөөдрийн асуулт» карт (FR-3.5) → S-22. */
export function QuestionTeaser({ partnerName }: { partnerName: string }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const question = useTodayQuestion();
  const q = question.data;
  const status = !q
    ? null
    : !q.myAnswer
      ? q.partnerAnswered
        ? t('home.question.partnerAnswered', { name: partnerName })
        : null
      : q.partnerAnswer
        ? t('home.question.revealed')
        : t('home.question.waiting', { name: partnerName });
  return (
    <Card testID="home-question">
      <View style={styles.row}>
        <MessageCircleHeart size={22} color={colors.primary} strokeWidth={iconStroke} />
        <AppText variant="h3" accessibilityRole="header">
          {t('home.question.title')}
        </AppText>
      </View>
      {q ? (
        <AppText variant="quote" testID="home-question-text">
          {questionText(q.question, locale)}
        </AppText>
      ) : null}
      {status ? (
        <AppText color="textMuted" testID="home-question-status">
          {status}
        </AppText>
      ) : null}
      <AppButton
        label={q?.myAnswer ? t('home.question.view') : t('home.question.answer')}
        onPress={() => router.push('/home/question')}
        testID="home-question-open"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
