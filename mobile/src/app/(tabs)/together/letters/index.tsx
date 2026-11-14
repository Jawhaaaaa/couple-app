import { router, useLocalSearchParams } from 'expo-router';
import { Hourglass, Lock, Mail, MailOpen, PenLine } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { type CapsuleSummary, useCapsules } from '@/api/queries/capsules';
import { type LetterListItem, type LetterTeaser, useLetters } from '@/api/queries/letters';
import { AppText } from '@/components/AppText';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { StackScreen } from '@/components/StackScreen';
import { emptyStateText } from '@/content/emptyStates';
import { canEditLetter, capsuleView, filterLetters, isLetterBox, LETTER_BOXES, type LetterBox, letterDate, sentStatusKey } from '@/domain/letters';
import { useErrorText } from '@/hooks/useErrorText';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDate, formatDateLong, todayIn, useT } from '@/i18n';
import { useCouplePeople } from '@/plans/people';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * S-65 захидлын хайрцаг (`?box`, FR-10.1…10.5): ирэх (битүүмжлэгдсэн — агуулгагүй «💌 Чамд …
 * захидал ирнэ», AC-182), «Надад ирсэн», «Миний илгээсэн» (огноогоор, AC-113; илгээгчид хүлээгдэж
 * буй → хүргэгдсэн → уншсан), цагийн капсул (S-68).
 */
export default function LettersScreen() {
  const t = useT();
  const colors = useColors();
  const initial = first(useLocalSearchParams<{ box?: string }>().box);
  const [box, setBox] = useState<LetterBox>(isLetterBox(initial) ? initial : 'inbox');
  return (
    <StackScreen title={t('letters.title')} testID="screen-S-65">
      <ScrollView contentContainerStyle={styles.body}>
        <SegmentedTabs options={LETTER_BOXES.map((b) => ({ key: b, label: t(`letters.box.${b}`) }))} value={box} onChange={setBox} testID="letter-boxes" />
        <View style={styles.top}>
          {box === 'capsules' ? (
            <TopButton label={t('capsule.create')} onPress={() => router.push('/together/capsules/new')} testID="capsule-create">
              <Hourglass size={18} color={colors.onPrimary} strokeWidth={iconStroke} />
            </TopButton>
          ) : (
            <TopButton label={t('letters.write')} onPress={() => router.push('/together/letters/compose')} testID="letter-write">
              <PenLine size={18} color={colors.onPrimary} strokeWidth={iconStroke} />
            </TopButton>
          )}
        </View>
        {box === 'upcoming' ? <UpcomingBox /> : box === 'capsules' ? <CapsuleBox /> : <LetterBoxList box={box} />}
      </ScrollView>
    </StackScreen>
  );
}

function useLetterEmpty() {
  const locale = usePrefsStore((s) => s.locale);
  const t = useT();
  const { partner } = useCouplePeople();
  const empty = emptyStateText('S-65', locale);
  return { ...empty, text: empty.text.replace('{partner}', partner?.name || t('letters.partnerFallback')) };
}

function UpcomingBox() {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const locale = usePrefsStore((s) => s.locale);
  const tz = useUserTimezone();
  const letters = useLetters('upcoming');
  const empty = useLetterEmpty();
  if (letters.isError && !letters.data) return <ScreenState kind="error" message={errorText(letters.error)} onRetry={() => void letters.refetch()} />;
  if (letters.isPending) return <ScreenState kind="loading" rows={2} />;
  if (letters.data.length === 0) return <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/together/letters/compose')} />;
  return (
    <>
      {letters.data.map((l: LetterTeaser) => {
        const when = l.occasionLabel || (l.deliverAt ? formatDateLong(new Date(l.deliverAt), locale, tz) : t('letters.soon'));
        return (
          <View key={l.id} style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.secondary }]} testID={`letter-teaser-${l.id}`}>
            <Lock size={20} color={colors.secondary} strokeWidth={iconStroke} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {t('letters.teaser', { when })}
            </AppText>
          </View>
        );
      })}
    </>
  );
}

function LetterBoxList({ box }: { box: 'inbox' | 'sent' }) {
  const t = useT();
  const colors = useColors();
  const errorText = useErrorText();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const tz = useUserTimezone();
  const { me, byId } = useCouplePeople();
  const letters = useLetters(box);
  const empty = useLetterEmpty();
  if (letters.isError && !letters.data) return <ScreenState kind="error" message={errorText(letters.error)} onRetry={() => void letters.refetch()} />;
  if (letters.isPending) return <ScreenState kind="loading" rows={3} />;
  const items = filterLetters(letters.data, box, me?.id ?? null);
  if (items.length === 0) return <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/together/letters/compose')} />;
  return (
    <>
      {items.map((l: LetterListItem) => {
        const other = box === 'inbox' ? l.author : l.recipient;
        const name = byId(other.id)?.name || other.displayName;
        const date = letterDate(l);
        const unread = box === 'inbox' && l.status === 'DELIVERED';
        const Icon = unread ? Mail : MailOpen;
        const status = t(`letters.status.${sentStatusKey(l.status)}`);
        const editable = box === 'sent' && canEditLetter(l, me?.id ?? null);
        return (
          <Pressable
            key={l.id}
            onPress={() =>
              router.push(editable ? { pathname: '/together/letters/compose', params: { id: l.id } } : { pathname: '/together/letters/[id]', params: { id: l.id } })
            }
            accessibilityRole="button"
            accessibilityLabel={`${box === 'inbox' ? t('letters.from', { name }) : t('letters.to', { name })}. ${box === 'sent' ? status : ''}`}
            testID={`letter-${l.id}`}
            style={({ pressed }) => [styles.item, { backgroundColor: colors.surface, borderColor: unread ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon size={20} color={unread ? colors.primary : colors.textMuted} strokeWidth={iconStroke} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{box === 'inbox' ? t('letters.from', { name }) : t('letters.to', { name })}</AppText>
              <AppText variant="caption" color="textMuted" testID={`letter-date-${l.id}`}>
                {date ? formatDate(new Date(date), dateFormat, tz) : ''}
                {l.occasionLabel ? ` · ${l.occasionLabel}` : ''}
              </AppText>
            </View>
            {box === 'sent' ? (
              <AppText variant="label" color={l.status === 'READ' ? 'success' : 'textMuted'} testID={`letter-status-${l.id}`}>
                {status}
              </AppText>
            ) : unread ? (
              <AppText variant="label" color="primary">
                {t('letters.new')}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </>
  );
}

function CapsuleBox() {
  const locale = usePrefsStore((s) => s.locale);
  const errorText = useErrorText();
  const capsules = useCapsules();
  if (capsules.isError && !capsules.data) return <ScreenState kind="error" message={errorText(capsules.error)} onRetry={() => void capsules.refetch()} />;
  if (capsules.isPending) return <ScreenState kind="loading" rows={2} />;
  if (capsules.data.length === 0) {
    const empty = emptyStateText('S-68', locale);
    return <ScreenState kind="empty" text={empty.text} actionLabel={empty.action} onAction={() => router.push('/together/capsules/new')} />;
  }
  return (
    <>
      {capsules.data.map((c) => (
        <CapsuleRow key={c.id} capsule={c} />
      ))}
    </>
  );
}

function CapsuleRow({ capsule }: { capsule: CapsuleSummary }) {
  const t = useT();
  const colors = useColors();
  const dateFormat = usePrefsStore((s) => s.dateFormat);
  const tz = useUserTimezone();
  const view = capsuleView({ parts: [], status: capsule.status, openOn: capsule.openOn }, null, todayIn(tz));
  const state = capsule.status === 'OPENED' ? t('capsule.state.opened') : t('capsule.daysLeft', { count: view.daysLeft });
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/together/capsules/[id]', params: { id: capsule.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${capsule.title}. ${t(`capsule.status.${capsule.status}`)}. ${state}`}
      testID={`capsule-${capsule.id}`}
      style={({ pressed }) => [styles.item, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      {capsule.status === 'OPENED' ? (
        <MailOpen size={20} color={colors.primary} strokeWidth={iconStroke} />
      ) : (
        <Lock size={20} color={colors.textMuted} strokeWidth={iconStroke} />
      )}
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{capsule.title}</AppText>
        <AppText variant="caption" color="textMuted">
          {t(`capsule.status.${capsule.status}`)} · {formatDate(capsule.openOn, dateFormat)}
        </AppText>
      </View>
      <AppText variant="label" testID={`capsule-left-${capsule.id}`}>
        {state}
      </AppText>
    </Pressable>
  );
}

function TopButton({ label, onPress, testID, children }: { label: string; onPress: () => void; testID: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.add, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
    >
      {children}
      <AppText variant="label" color="onPrimary">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.sm, paddingBottom: spacing.xxl },
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  add: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.card, padding: spacing.md },
  flex: { flex: 1, gap: 2 },
});
