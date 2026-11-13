import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { useMemoryPlaces } from '@/api/queries/memories';
import { AppText } from '@/components/AppText';
import { PlacesMap } from '@/components/map/PlacesMap';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { spacing } from '@/theme/tokens';

/**
 * S-70 Газрын зураг (FR-12.1, AC-116): дурсамжийн байршлууд cluster-тай, товшвол тухайн газрын
 * дурсамжууд; OSM attribution. Offline-д кэшлэгдсэн `places` ба tile (SW) — шинэ tile алга бол саарал.
 */
export default function MapScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const places = useMemoryPlaces();
  const empty = emptyStateText('S-70', locale);
  let body;
  if (places.isPending) body = <ScreenState kind="loading" rows={3} />;
  else if (!places.data) body = <ScreenState kind="error" message={errorText(places.error)} onRetry={() => void places.refetch()} />;
  else if (places.data.length === 0)
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/memory-editor')} />;
  else
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <AppText color="textMuted">{t('map.subtitle', { count: places.data.length })}</AppText>
        <PlacesMap places={places.data} height={440} />
      </ScrollView>
    );
  return (
    <StackScreen title={t('map.title')} testID="screen-S-70">
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm },
});
