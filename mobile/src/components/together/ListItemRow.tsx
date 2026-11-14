import { ArrowDown, ArrowUp, CalendarPlus, Check, Heart, Pencil } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ListItem } from '@/api/queries/lists';
import { AppText } from '@/components/AppText';
import { UserAvatar } from '@/components/UserAvatar';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDate, formatTime, useT } from '@/i18n';
import type { Person } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

interface Props {
  item: ListItem;
  myId: string | null;
  person: (id: string | null | undefined) => Person | null;
  busy?: boolean;
  onToggleDone: () => void;
  onVote: () => void;
  onEdit: () => void;
  /** Бүлэг дотроо дээш/доош (AC-109); `undefined` бол хязгаарт хүрсэн. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Wishlist → «Болзоо болгох» (AC-110). */
  onMakePlan?: () => void;
}

/**
 * Жагсаалтын нэг зүйл (S-63): тэмдэглэх, хэн хэзээ тэмдэглэснийг аватараар (AC-107), «Хүсэж байна»
 * санал ба «Хоёулаа хүсэж байна 💗» (AC-109), эрэмбийн дээш/доош товч, wishlist-ээс болзоо (AC-110).
 */
export function ListItemRow({ item, myId, person, busy, onToggleDone, onVote, onEdit, onMoveUp, onMoveDown, onMakePlan }: Props) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const tz = useUserTimezone();
  const done = !!item.doneAt;
  const voted = !!myId && item.votes.includes(myId);
  const doneBy = person(item.doneBy);
  return (
    <View
      style={[styles.row, { backgroundColor: colors.surface, borderColor: item.bothWant && !done ? colors.primary : colors.border }]}
      testID={`list-item-${item.id}`}
    >
      <Pressable
        onPress={onToggleDone}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: busy }}
        aria-checked={done}
        accessibilityLabel={item.title}
        testID={`list-done-${item.id}`}
        style={[styles.check, { borderColor: done ? colors.success : colors.border, backgroundColor: done ? colors.success : 'transparent' }]}
      >
        {done ? <Check size={18} color={colors.bg} strokeWidth={iconStroke + 0.5} /> : null}
      </Pressable>
      <View style={styles.main}>
        <AppText variant="bodyStrong" style={done ? styles.doneText : undefined} color={done ? 'textMuted' : 'text'} testID={`list-title-${item.id}`}>
          {item.title}
        </AppText>
        {item.description ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {item.description}
          </AppText>
        ) : null}
        {item.wishType ? (
          <AppText variant="caption" color="textMuted">
            {t(`lists.wishType.${item.wishType}`)}
          </AppText>
        ) : null}
        {item.bothWant && !done ? (
          <AppText variant="label" color="primary" testID={`list-bothwant-${item.id}`}>
            {t('lists.bothWant')}
          </AppText>
        ) : null}
        {done && item.doneAt ? (
          <View style={styles.doneBy} testID={`list-doneby-${item.id}`}>
            <UserAvatar uri={doneBy?.avatarUri} label={doneBy?.name ?? ''} size={22} />
            <AppText variant="caption" color="textMuted">
              {t('lists.doneBy', {
                name: doneBy?.name ?? t('lists.someone'),
                when: `${formatDate(new Date(item.doneAt), dateFormat, tz)} ${formatTime(new Date(item.doneAt), locale, tz)}`,
              })}
            </AppText>
          </View>
        ) : null}
        <View style={styles.actions}>
          {!done ? (
            <IconButton
              label={voted ? t('lists.unvote') : t('lists.vote')}
              selected={voted}
              onPress={onVote}
              disabled={busy}
              testID={`list-vote-${item.id}`}
            >
              <Heart size={18} color={voted ? colors.onPrimary : colors.primary} fill={voted ? colors.onPrimary : 'transparent'} strokeWidth={iconStroke} />
              <AppText variant="caption" color={voted ? 'onPrimary' : 'textMuted'}>
                {item.votes.length}
              </AppText>
            </IconButton>
          ) : null}
          {!done && (onMoveUp || onMoveDown) ? (
            <>
              <IconButton label={t('lists.moveUp')} onPress={onMoveUp} disabled={busy || !onMoveUp} testID={`list-up-${item.id}`}>
                <ArrowUp size={18} color={onMoveUp ? colors.text : colors.border} strokeWidth={iconStroke} />
              </IconButton>
              <IconButton label={t('lists.moveDown')} onPress={onMoveDown} disabled={busy || !onMoveDown} testID={`list-down-${item.id}`}>
                <ArrowDown size={18} color={onMoveDown ? colors.text : colors.border} strokeWidth={iconStroke} />
              </IconButton>
            </>
          ) : null}
          {onMakePlan && !done ? (
            <IconButton label={t('lists.makePlan')} onPress={onMakePlan} testID={`list-plan-${item.id}`}>
              <CalendarPlus size={18} color={colors.secondary} strokeWidth={iconStroke} />
              <AppText variant="caption">{t('lists.makePlan')}</AppText>
            </IconButton>
          ) : null}
          <IconButton label={t('lists.edit')} onPress={onEdit} disabled={busy} testID={`list-edit-${item.id}`}>
            <Pencil size={16} color={colors.textMuted} strokeWidth={iconStroke} />
          </IconButton>
        </View>
      </View>
    </View>
  );
}

function IconButton({
  label,
  onPress,
  disabled,
  selected,
  testID,
  children,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  testID: string;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      testID={testID}
      style={({ pressed }) => [styles.icon, { backgroundColor: selected ? colors.primary : colors.surfaceRaised, opacity: pressed ? 0.8 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderRadius: radius.card, padding: spacing.sm },
  check: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 2 },
  doneText: { textDecorationLine: 'line-through' },
  doneBy: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs, marginTop: spacing.xxs },
  icon: { minWidth: touchTarget, height: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs, borderRadius: radius.pill },
});
