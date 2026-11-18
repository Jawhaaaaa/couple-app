import { Bell, CircleUser } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useUnreadCount } from '@/api/queries/notifications';
import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

interface Props {
  title: string;
  /** Уншаагүй тоо; өгөөгүй бол `['notifications']` кэшээс (S-24-тэй нэг эх, AC-120). */
  unread?: number;
  onBell: () => void;
  onAvatar: () => void;
}

/** Табын толгой: гарчиг, мэдэгдлийн хонх (уншаагүй тоо), аватар → тохиргоо. */
export function TopBar({ title, unread: unreadProp, onBell, onAvatar }: Props) {
  const cached = useUnreadCount();
  const unread = unreadProp ?? cached;
  const colors = useColors();
  const t = useT();
  return (
    <View style={styles.row}>
      <AppText variant="h1" style={styles.title} accessibilityRole="header">
        {title}
      </AppText>
      <Pressable
        onPress={onBell}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `${t('a11y.notificationsBell')}, ${t('a11y.unreadCount', { count: unread })}` : t('a11y.notificationsBell')}
        style={styles.icon}
        testID="topbar-bell"
      >
        <Bell size={24} color={colors.text} strokeWidth={iconStroke} />
        {unread > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.primary }]} testID="topbar-unread">
            <AppText variant="caption" color="onPrimary">
              {unread > 99 ? '99+' : String(unread)}
            </AppText>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onAvatar}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.avatar')}
        style={styles.icon}
        testID="topbar-avatar"
      >
        <CircleUser size={26} color={colors.text} strokeWidth={iconStroke} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screen, paddingVertical: spacing.xs, gap: spacing.xxs },
  title: { flex: 1 },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 2, minWidth: 18, paddingHorizontal: 4, borderRadius: radius.pill, alignItems: 'center' },
});
