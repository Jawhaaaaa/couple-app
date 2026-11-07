import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { partnerName, useCoupleQuery } from '@/api/queries/pairing';
import { firstParam } from '@/auth/validation';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { AuthScreen } from '@/components/AuthScreen';
import { Mascot } from '@/components/Mascot';
import { useT } from '@/i18n';
import { CelebrationOverlay } from '@/motion/CelebrationOverlay';
import { spacing } from '@/theme/tokens';

/**
 * S-12 Хос холбогдлоо (FR-2.2, AC-11): ANIM-14 баярын мөч (≤ 2.5 с, товшиход хаагдана).
 * Дараа нь ганцаараа үеийн агуулга байвал (`soloShare.pendingCount > 0`) хуваалцах
 * асуулт руу (AC-67), эсвэл «Эхний дурсамжаа нэмье» (AC-188) ба эхэлсэн өдөр (S-11).
 * `?celebrated=1` — асуултаас буцаж ирсэн, баярыг дахин үзүүлэхгүй.
 */
export default function LinkedScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ celebrated?: string }>();
  const alreadyCelebrated = firstParam(params.celebrated) === '1';
  const [celebrating, setCelebrating] = useState(!alreadyCelebrated);
  const couple = useCoupleQuery();
  const name = partnerName(couple.data);
  const pendingShare = couple.data?.soloShare?.pendingCount ?? 0;
  const startDateOpen = couple.data ? couple.data.startDateStatus !== 'CONFIRMED' : false;

  useEffect(() => {
    if (!celebrating && !alreadyCelebrated && pendingShare > 0) router.replace('/solo-share');
  }, [celebrating, alreadyCelebrated, pendingShare]);

  return (
    <View style={styles.fill}>
      <AuthScreen
        title={t('pairing.linked.title')}
        subtitle={name ? t('pairing.linked.body', { name }) : t('pairing.linked.bodyNoName')}
        testID="screen-S-12"
      >
        <AppButton label={t('pairing.linked.firstMemory')} onPress={() => router.replace('/memories')} testID="linked-first-memory" />
        {startDateOpen ? (
          <AppButton variant="secondary" label={t('pairing.linked.startDate')} onPress={() => router.push('/start-date')} testID="linked-start-date" />
        ) : null}
      </AuthScreen>
      <CelebrationOverlay anim="ANIM-14" visible={celebrating} onDismiss={() => setCelebrating(false)}>
        <View style={styles.center}>
          <Mascot size={140} pose="wave" />
          <AppText variant="display" style={styles.text}>
            {t('pairing.linked.title')}
          </AppText>
        </View>
      </CelebrationOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  text: { textAlign: 'center' },
});
