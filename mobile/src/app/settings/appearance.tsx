import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { type SyncedPrefs, setPreference } from '@/api/queries/settings';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { StackScreen } from '@/components/StackScreen';
import { formatDate, useT } from '@/i18n';
import { playHaptic } from '@/motion/haptics';
import { type AnimationSetting, type DateFormat, type Locale, usePrefsStore } from '@/stores/prefsStore';
import { useColors } from '@/theme/ThemeProvider';
import { spacing, type ThemePreference } from '@/theme/tokens';

const EXAMPLE_DATE = '2026-11-07';
const DATE_FORMATS: DateFormat[] = ['YMD_DOT', 'DMY_SLASH', 'MDY_SLASH'];
const ANIMATIONS: AnimationSetting[] = ['ALL', 'REDUCED', 'OFF'];
const THEMES: ThemePreference[] = ['dark', 'light', 'system'];
const LOCALES: Locale[] = ['mn', 'en'];

/**
 * S-88 Харагдах байдал (FR-18.1…18.3, FR-19.7): хэл (дахин ачаалалгүй — AC-135), theme бараан/цайвар/
 * системийн (300 ms cross-fade — AC-DS-03), огнооны формат (AC-139), анимаци Бүгд/Багасгах/Унтраах
 * (AC-MO-03), haptic (анхдагч асаалттай — AC-MO-04), дуу (анхдагч унтраастай — AC-217). Утга локалд шууд
 * солигдож, серверийн `Preferences`-тэй синк хийгдэнэ (хэл нь зөвхөн энэ төхөөрөмжид).
 */
export default function AppearanceScreen() {
  const t = useT();
  const prefs = usePrefsStore();
  const [syncFailed, setSyncFailed] = useState(false);

  const update = (patch: Partial<SyncedPrefs>) => {
    setSyncFailed(false);
    setPreference(patch).catch(() => setSyncFailed(true));
  };

  return (
    <StackScreen title={t('appearance.title')} testID="screen-S-88">
      <ScrollView contentContainerStyle={styles.body}>
        {syncFailed ? <FormMessage kind="info" text={t('appearance.saveError')} testID="appearance-sync-failed" /> : null}

        <Card testID="appearance-language">
          <AppText variant="h3" accessibilityRole="header">
            {t('appearance.language')}
          </AppText>
          <SegmentedTabs
            options={LOCALES.map((key) => ({ key, label: t(`language.${key}`) }))}
            value={prefs.locale}
            onChange={(locale) => prefs.set({ locale })}
            testID="appearance-locale"
          />
          <AppText variant="caption" color="textMuted">
            {t('appearance.languageNote')}
          </AppText>
        </Card>

        <Card testID="appearance-theme">
          <AppText variant="h3" accessibilityRole="header">
            {t('appearance.theme')}
          </AppText>
          <SegmentedTabs
            options={THEMES.map((key) => ({ key, label: t(`theme.${key}`) }))}
            value={prefs.theme}
            onChange={(theme) => update({ theme })}
            testID="appearance-theme-mode"
          />
          <AppText variant="caption" color="textMuted">
            {t('appearance.systemNote')}
          </AppText>
        </Card>

        <Card testID="appearance-date">
          <AppText variant="h3" accessibilityRole="header">
            {t('appearance.dateFormat')}
          </AppText>
          <SegmentedTabs
            options={DATE_FORMATS.map((key) => ({ key, label: t(`dateFormat.${key}`) }))}
            value={prefs.dateFormat}
            onChange={(dateFormat) => update({ dateFormat })}
            testID="appearance-date-format"
          />
          <AppText variant="caption" color="textMuted" testID="appearance-date-example">
            {t('appearance.dateExample', { date: formatDate(EXAMPLE_DATE, prefs.dateFormat) })}
          </AppText>
        </Card>

        <Card testID="appearance-motion">
          <AppText variant="h3" accessibilityRole="header">
            {t('appearance.animation')}
          </AppText>
          <SegmentedTabs
            options={ANIMATIONS.map((key) => ({ key, label: t(`animation.${key}`) }))}
            value={prefs.animation}
            onChange={(animation) => update({ animation })}
            testID="appearance-animation"
          />
          <AppText variant="caption" color="textMuted">
            {t('appearance.animationNote')}
          </AppText>
          <ToggleRow
            label={t('appearance.haptics')}
            note={t('appearance.hapticsNote')}
            value={prefs.haptics}
            onChange={(haptics) => {
              update({ haptics });
              if (haptics) playHaptic('ANIM-03');
            }}
            testID="appearance-haptics"
          />
          <ToggleRow
            label={t('appearance.sound')}
            note={t('appearance.soundNote')}
            value={prefs.sound}
            onChange={(sound) => {
              update({ sound });
              // Асаахад жишээ дуу (AC-217)
              if (sound) playHaptic('ANIM-03');
            }}
            testID="appearance-sound"
          />
        </Card>
      </ScrollView>
    </StackScreen>
  );
}

interface ToggleProps {
  label: string;
  note: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID: string;
}

function ToggleRow({ label, note, value, onChange, testID }: ToggleProps) {
  const colors = useColors();
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <AppText>{label}</AppText>
        <AppText variant="caption" color="textMuted">
          {note}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityRole="switch"
        trackColor={{ true: colors.primary, false: colors.border }}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.screen, gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
});
