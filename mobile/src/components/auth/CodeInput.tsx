import { StyleSheet, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { useColors } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from '../AppText';

export const CODE_LENGTH = 6;

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** 6 дахь цифр орох үед (автоматаар илгээхэд). */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * 6 нүдтэй код (FR-1.2, S-05). Нэг л оролт нүднүүдийн дээр ил биш давхарга болж
 * байрлана — SMS/имэйлийн кодыг автоматаар бөглөх, наах нь ажиллана.
 */
export function CodeInput({ value, onChange, onComplete, disabled, invalid }: Props) {
  const colors = useColors();
  const t = useT();
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '');
  return (
    <View style={styles.wrap}>
      <View style={styles.row} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {cells.map((digit, i) => {
          const active = !disabled && i === Math.min(value.length, CODE_LENGTH - 1);
          const borderColor = invalid ? colors.danger : active ? colors.primary : colors.border;
          return (
            <View key={i} style={[styles.cell, { borderColor, backgroundColor: colors.surface }]}>
              <AppText variant="h2">{digit}</AppText>
            </View>
          );
        })}
      </View>
      <TextInput
        value={value}
        onChangeText={(raw) => {
          const code = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
          onChange(code);
          if (code.length === CODE_LENGTH && code !== value) onComplete?.(code);
        }}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        caretHidden
        autoFocus
        accessibilityLabel={t('auth.verify.codeLabel')}
        testID="code-input"
        style={[StyleSheet.absoluteFill, styles.input]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  row: { flexDirection: 'row', gap: spacing.xs },
  cell: {
    width: 44,
    height: 56,
    borderWidth: 1.5,
    borderRadius: radius.input - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { opacity: 0 },
});
