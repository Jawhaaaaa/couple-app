import type { TextStyle } from 'react-native';

/**
 * Фонт ба шатлал (шаардлага §3.2). Bodoni Moda, Plus Jakarta Sans-д кирилл байхгүй
 * тул Playfair Display (гарчиг, тоолуур, ишлэл) ба Nunito (бие, товч, шошго).
 * Ашигласан жин бүрд «Ө Ү» бүрэн байгааг `font-cmap.test.ts` шалгана (AC-DS-04).
 */
export const fontFamily = {
  serif: 'PlayfairDisplay_400Regular',
  serifItalic: 'PlayfairDisplay_400Regular_Italic',
  sans: 'Nunito_400Regular',
  sansSemiBold: 'Nunito_600SemiBold',
  sansBold: 'Nunito_700Bold',
} as const;
export type FontFamilyName = (typeof fontFamily)[keyof typeof fontFamily];

/**
 * Багцлах фонтын файлууд. Багцын index-ийг импортлохгүй — бүх жинг
 * bundle-д чирж оруулна (FR-19.10). Түлхүүр = `fontFamily`-ийн утга.
 */
export const fontAssets: Record<FontFamilyName, number> = {
  PlayfairDisplay_400Regular: require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
  PlayfairDisplay_400Regular_Italic: require('@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf'),
  Nunito_400Regular: require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
  Nunito_600SemiBold: require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
  Nunito_700Bold: require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
};

export type TypeVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'quote';

/**
 * Шатлал: Display 40/44 · H1 28/34 · H2 22/28 · H3 18/24 · Body 16/24 ·
 * Label 13/18 (Nunito 700, +0.4 tracking) · Caption 12/16.
 * Өндөр тогтоохгүй — системийн 200% фонтод текст тайрагдахгүй (AC-DS-05).
 */
export const typeScale: Record<TypeVariant, TextStyle> = {
  display: { fontFamily: fontFamily.serifItalic, fontSize: 40, lineHeight: 44 },
  h1: { fontFamily: fontFamily.serif, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: fontFamily.serif, fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: fontFamily.sansBold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fontFamily.sans, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fontFamily.sansBold, fontSize: 13, lineHeight: 18, letterSpacing: 0.4 },
  caption: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16 },
  quote: { fontFamily: fontFamily.serifItalic, fontSize: 18, lineHeight: 26 },
};

/** Том гарчиг (WCAG «large text» ≥ 24 px эсвэл ≥ 18.66 px bold) — contrast ≥ 3:1 хангалттай. */
export function isLargeText(variant: TypeVariant): boolean {
  return variant === 'display' || variant === 'h1';
}
