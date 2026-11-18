import { Home, MapPin, Trees, Wallet } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type AnyIdea, isLibraryIdea } from '@/api/queries/ideas';
import { AppText } from '@/components/AppText';
import { formatMoney, useT } from '@/i18n';
import { usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing } from '@/theme/tokens';

interface Props {
  idea: AnyIdea;
  onPress?: () => void;
  footer?: ReactNode;
  testID?: string;
}

/** Санааны карт (S-51, S-56, S-57, S-58): гарчиг, ангилал, гэр/гадаа, төсөв, газар. */
export function IdeaCard({ idea, onPress, footer, testID }: Props) {
  const t = useT();
  const colors = useColors();
  const locale = usePrefsStore((s) => s.locale);
  const library = isLibraryIdea(idea);
  const budget = library ? t(`plans.library.band.${idea.budgetBand}`) : idea.budgetMnt != null ? formatMoney(idea.budgetMnt, locale) : null;
  const place = library ? null : idea.place?.name;
  const SettingIcon = idea.setting === 'HOME' ? Home : Trees;
  const body = (
    <>
      <AppText variant="caption" color="textMuted">
        {t(`plans.category.${idea.category}`)}
        {library ? ` · ${t('plans.random.fromLibrary')}` : ''}
      </AppText>
      <AppText variant="h3">{idea.title}</AppText>
      {idea.description ? (
        <AppText color="textMuted" numberOfLines={3}>
          {idea.description}
        </AppText>
      ) : null}
      <View style={styles.meta}>
        {idea.setting ? (
          <View style={styles.row}>
            <SettingIcon size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText variant="caption" color="textMuted">
              {t(`plans.setting.${idea.setting}`)}
            </AppText>
          </View>
        ) : null}
        {budget ? (
          <View style={styles.row}>
            <Wallet size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText variant="caption" color="textMuted">
              {budget}
            </AppText>
          </View>
        ) : null}
        {place ? (
          <View style={styles.row}>
            <MapPin size={16} color={colors.textMuted} strokeWidth={iconStroke} />
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {place}
            </AppText>
          </View>
        ) : null}
        {library ? (
          <AppText variant="caption" color="textMuted">
            {t('plans.library.duration', { minutes: idea.durationMinutes })}
          </AppText>
        ) : null}
      </View>
    </>
  );
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID ?? `idea-${idea.id}`}>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={idea.title} style={({ pressed }) => [styles.main, { opacity: pressed ? 0.85 : 1 }]}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.main}>{body}</View>
      )}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  main: { gap: spacing.xxs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});
