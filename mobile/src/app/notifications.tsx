import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import {
  type AppNotification,
  applyRead,
  applyReadAll,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_KEY,
  setNotificationsCache,
  unreadCountOf,
  useNotifications,
} from '@/api/queries/notifications';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { FormMessage } from '@/components/FormMessage';
import { ScreenState } from '@/components/ScreenState';
import { TabScreen } from '@/components/TabScreen';
import { emptyStateText } from '@/content/emptyStates';
import { useErrorText } from '@/hooks/useErrorText';
import { useOnlineOnly } from '@/hooks/useOnlineOnly';
import { formatDate, formatTime, useT } from '@/i18n';
import { routeForNotification } from '@/notifications/notificationRoutes';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing, touchTarget } from '@/theme/tokens';

/**
 * S-24 Мэдэгдлийн жагсаалт (FR-13.4, AC-120): `GET /notifications` хуудаслалттай,
 * уншаагүйг тодруулна. Товшвол уншсан болгоод (`POST …/read`) холбогдох дэлгэц рүү;
 * «Бүгдийг уншсан болгох». Толгойн хонхны тоо ижил `['notifications']` кэшээс.
 */
export default function NotificationsScreen() {
  const t = useT();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const queryClient = useQueryClient();
  const { disabled: offline } = useOnlineOnly();
  const list = useNotifications();
  const unread = unreadCountOf(list.data);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const read = useMutation({
    mutationFn: (n: AppNotification) => markNotificationRead(n.id),
    onMutate: (n) => ({ previous: setNotificationsCache(queryClient, (d) => applyRead(d, n.id, new Date().toISOString())) }),
    onError: (_e, _n, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(NOTIFICATIONS_KEY, ctx.previous);
    },
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => ({ previous: setNotificationsCache(queryClient, (d) => applyReadAll(d, new Date().toISOString())) }),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(NOTIFICATIONS_KEY, ctx.previous);
    },
  });

  const open = (n: AppNotification) => {
    if (!n.readAt) read.mutate(n);
    router.push(routeForNotification(n) as Href);
  };

  let body: ReactNode;
  if (list.isPending) body = <ScreenState kind="loading" rows={5} />;
  else if (list.isError && !list.data) body = <ScreenState kind="error" message={errorText(list.error)} onRetry={() => void list.refetch()} />;
  else if (items.length === 0) {
    const empty = emptyStateText('S-24', locale);
    body = <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.replace('/')} />;
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText color="textMuted" style={styles.flex} testID="notifications-unread-count">
              {t('notifications.unread', { count: unread })}
            </AppText>
            <AppButton
              variant="ghost"
              label={t('notifications.readAll')}
              onPress={() => readAll.mutate()}
              disabled={offline || unread === 0}
              loading={readAll.isPending}
              testID="notifications-read-all"
            />
          </View>
        }
        renderItem={({ item }) => <NotificationRow item={item} onPress={() => open(item)} />}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator accessibilityLabel={t('notifications.loadingMore')} style={styles.footer} />
          ) : list.isFetchNextPageError ? (
            <AppButton variant="ghost" label={t('common.retry')} onPress={() => void list.fetchNextPage()} testID="notifications-more-retry" />
          ) : undefined
        }
      />
    );
  }

  const mutationError = read.error ?? readAll.error;
  return (
    <TabScreen title={t('common.notifications')} testID="screen-S-24">
      {mutationError ? <FormMessage text={errorText(mutationError)} testID="notifications-error" /> : null}
      {body}
    </TabScreen>
  );
}

function NotificationRow({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const unread = !item.readAt;
  const when = new Date(item.createdAt);
  const stamp = `${formatDate(when, dateFormat)} ${formatTime(when, locale)}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? `${t('notifications.unreadA11y')}. ` : ''}${item.title}. ${item.body}`}
      accessibilityHint={stamp}
      testID={unread ? 'notification-item-unread' : 'notification-item'}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: unread ? colors.surfaceRaised : colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: unread ? colors.primary : 'transparent' }]} />
      <View style={styles.flex}>
        <AppText variant={unread ? 'label' : 'body'}>{item.title}</AppText>
        <AppText color="textMuted" numberOfLines={2}>
          {item.body}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {stamp}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.screen, gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  footer: { padding: spacing.md },
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.input,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 6 },
});
