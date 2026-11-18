import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { iconStroke, radius, spacing, touchTarget } from '@/theme/tokens';
import { typeScale } from '@/theme/typography';

import { AppText } from './AppText';

interface Props extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  /** Талбарын доорх алдаа (улаан, `alert`). */
  error?: string | null;
  /** Талбарын доорх тайлбар (алдаа байхгүй үед). */
  hint?: string | null;
  /** Нууц үгийн талбар — харуулах/нуух товчтой. */
  secure?: boolean;
  testID?: string;
}

/** Шошготой оролтын талбар (≥ 48 өндөр, NFR-07): алдаа/тайлбар нь доор нь. */
export function TextField({ label, error, hint, secure, testID, editable = true, ...rest }: Props) {
  const colors = useColors();
  const t = useT();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;
  return (
    <View style={styles.root}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <View style={[styles.box, { borderColor, backgroundColor: colors.surface, opacity: editable ? 1 : 0.6 }]}>
        <TextInput
          {...rest}
          editable={editable}
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint ?? undefined}
          secureTextEntry={secure ? hidden : false}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, typeScale.body, { color: colors.text }]}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('auth.fields.showPassword') : t('auth.fields.hidePassword')}
            style={styles.eye}
            testID={testID ? `${testID}-toggle` : undefined}
          >
            {hidden ? (
              <Eye size={20} color={colors.textMuted} strokeWidth={iconStroke} />
            ) : (
              <EyeOff size={20} color={colors.textMuted} strokeWidth={iconStroke} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText
          variant="caption"
          color="danger"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xxs, width: '100%' },
  box: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.input,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, minHeight: 48, paddingHorizontal: spacing.md },
  eye: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
