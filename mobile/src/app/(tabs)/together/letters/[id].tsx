import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { invalidateLetters, type Letter, letterKey, markLetterRead, useLetter } from '@/api/queries/letters';
import { mediaPlaceholder, mediaUrl } from '@/api/queries/memories';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { Envelope } from '@/components/together/Envelope';
import { usePaperColor } from '@/components/together/paper';
import { canEditLetter, sentStatusKey } from '@/domain/letters';
import { useErrorText } from '@/hooks/useErrorText';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateLong, useT } from '@/i18n';
import { useCouplePeople } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { radius, spacing } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * S-67 захидал нээх (FR-10.1, AC-111, AC-182): хүлээн авагчид анх удаа ANIM-06 дугтуйгаар нээгдэж
 * уншсан болно (илгээгчид «уншсан»); зохиогчид төлөвтэй, хүргэгдэхээс өмнө «Засах».
 */
export default function LetterScreen() {
  const t = useT();
  const errorText = useErrorText();
  const id = first(useLocalSearchParams<{ id?: string }>().id);
  const letter = useLetter(id);
  let body;
  if (letter.isError && !letter.data) body = <ScreenState kind="error" message={errorText(letter.error)} onRetry={() => void letter.refetch()} />;
  else if (letter.isPending || !letter.data) body = <ScreenState kind="loading" rows={4} />;
  else body = <LetterBody letter={letter.data} />;
  return (
    <StackScreen title={t('letters.read.title')} testID="screen-S-67">
      {body}
    </StackScreen>
  );
}

function LetterBody({ letter }: { letter: Letter }) {
  const t = useT();
  const queryClient = useQueryClient();
  const locale = usePrefsStore((s) => s.locale);
  const tz = useUserTimezone();
  const { me, byId } = useCouplePeople();
  const paper = usePaperColor(letter.template);
  const mine = letter.author.id === me?.id;
  const authorName = byId(letter.author.id)?.name || letter.author.displayName;
  const sealed = !mine && letter.status === 'DELIVERED';
  const when = letter.deliveredAt ?? letter.deliverAt ?? letter.createdAt;

  const onOpen = () => {
    void markLetterRead(letter.id)
      .then((read) => {
        queryClient.setQueryData(letterKey(letter.id), read);
        return invalidateLetters(queryClient);
      })
      // Уншсан тэмдэглэл амжаагүй — дараагийн нээлтэд дахин оролдоно
      .catch(() => undefined);
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Envelope initiallyOpen={!sealed} from={authorName} onOpen={onOpen}>
        <View style={[styles.paper, { backgroundColor: paper.bg, borderColor: paper.border }]} testID={`letter-paper-${letter.template}`}>
          <AppText variant="caption" style={{ color: paper.ink }}>
            {formatDateLong(new Date(when), locale, tz)}
            {letter.occasionLabel ? ` · ${letter.occasionLabel}` : ''}
          </AppText>
          <AppText variant="quote" style={{ color: paper.ink }} testID="letter-body-text">
            {letter.body}
          </AppText>
          {letter.media.map((m) => (
            <Image key={m.id} source={{ uri: mediaUrl(m, 'lg') ?? undefined }} placeholder={mediaPlaceholder(m, 'lg')} style={styles.image} contentFit="cover" accessibilityLabel={t('letters.read.photo')} />
          ))}
          <AppText variant="bodyStrong" style={[styles.sign, { color: paper.ink }]}>
            {t('letters.read.signed', { name: authorName })}
          </AppText>
        </View>
      </Envelope>
      {mine ? (
        <AppText variant="label" color="textMuted" testID="letter-status">
          {t(`letters.status.${sentStatusKey(letter.status)}`)}
        </AppText>
      ) : null}
      {canEditLetter(letter, me?.id ?? null) ? (
        <AppButton label={t('letters.read.edit')} onPress={() => router.push({ pathname: '/together/letters/compose', params: { id: letter.id } })} testID="letter-edit" />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  paper: { borderWidth: 1, borderRadius: radius.card, padding: spacing.lg, gap: spacing.sm },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.image },
  sign: { alignSelf: 'flex-end' },
});
