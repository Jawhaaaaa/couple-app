import { Text, type TextProps } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import type { ColorTokens } from '@/theme/tokens';
import { typeScale, type TypeVariant } from '@/theme/typography';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: keyof ColorTokens;
}

/** Апп-ын бүх бичиг энэ компонентоор: шатлал ба өнгө токеноос (§3.2, AC-144). */
export function AppText({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  const colors = useColors();
  return <Text {...rest} style={[typeScale[variant], { color: colors[color] }, style]} />;
}
