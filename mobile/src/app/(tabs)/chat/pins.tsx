import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { PinOff } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { listPinned, type Message, PINNED_KEY, setPinned } from '@/api/queries/chat';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { formatDateLong, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-42 Pin-үүд (FR-6.7, AC-90): хоёулаа pin хийсэн бүх мессеж; товшвол чатад контекст рүү, хэн ч
 * хасаж болно (INV-03 — тэнцүү эрх).
 */
export default function PinsScreen() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const pins = useQuery({ queryKey: PINNED_KEY, queryFn: listPinned });
  const [error, setError] = useState<unknown>(null);

  const unpin = async (m: Message) => {
    setError(null);
    try {
      await setPinned(m.id, false);
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    } catch (e) {
      setError(e);
    }
  };

  const empty = emptyStateText('S-42', locale);
  let body;
  if (pins.isLoading) body = <ScreenState kind="loading" rows={4} />;
  else if (pins.isError) body = <ScreenState kind="error" onRetry={() => void pins.refetch()} />;
  else if (!pins.data?.length) body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.back()} />;
  else
    body = (
      <FlatList
        data={[...pins.data].reverse()}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`pin-${item.id}`}>
            <Pressable
              style={styles.cardMain}
              onPress={() => router.push({ pathname: '/chat', params: { around: item.id } })}
              accessibilityRole="button"
              accessibilityHint={t('chat.pins.openHint')}
            >
              <AppText variant="label" color="textMuted">
                {item.sender.displayName} · {formatDateLong(new Date(item.createdAt), locale)}
              </AppText>
              <AppText numberOfLines={3}>{item.text ?? t(`chat.kind.${item.kind}`)}</AppText>
            </Pressable>
            <Pressable
              onPress={() => void unpin(item)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.actions.unpin')}
              testID={`unpin-${item.id}`}
              style={styles.icon}
            >
              <PinOff size={20} color={colors.textMuted} strokeWidth={iconStroke} />
            </Pressable>
          </View>
        )}
      />
    );

  return (
    <StackScreen title={t('chat.pins.title')} testID="screen-S-42">
      {error ? <FormMessage text={errorText(error)} testID="pins-error" /> : null}
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  cardMain: { flex: 1, gap: spacing.xxs },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
