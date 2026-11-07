/**
 * Aura дизайн токен (шаардлага §3.1, §3.3, §3.4).
 *
 * Энэ файл нь апп-ын цорын ганц өнгөний эх: бусад файлд `#RRGGBB` бичихгүй
 * (AC-DS-02 — `no-hex.test.ts`). Бүх палитрын бичиг/дэвсгэрийн хос WCAG-ийн
 * томьёогоор ≥ 4.5:1 (AC-DS-01 — `contrast.test.ts`).
 *
 * Тэмдэглэл: шаардлагын хүснэгтэд цайвар theme-ийн `onPrimary` нь `#FFFFFF`
 * боловч `#D46A5F` дээр 3.48:1 болж AC-DS-01-ийн «`onPrimary`/`primary` хос бүх
 * палитрт ≥ 4.5:1» шалгуурыг зөрчинө. AC-ийг баримталж бараан бичиг (`#2A1210`,
 * 5.05:1) сонгов. Лаванда, Ой, Далай палитрын утгыг шаардлага өгөөгүй (LLD §6) —
 * ижил бүтэцтэй, ижил шалгуурыг хангахаар тогтоов.
 */

export type ThemeMode = 'dark' | 'light';
export type ThemePreference = ThemeMode | 'system';
export type PaletteName = 'CORAL' | 'LAVENDER' | 'FOREST' | 'OCEAN';

export interface ColorTokens {
  /** Гол үйлдэл, зүрх, идэвхтэй таб */
  primary: string;
  /** Primary дээрх бичиг */
  onPrimary: string;
  /** Тодотгол, огноо, «шинэ» — дэвсгэр/дүрсэнд; дээрх бичиг `onSecondary` */
  secondary: string;
  onSecondary: string;
  /** Хоёрдогч дүрс, хүрээ */
  tertiary: string;
  bg: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  /** Төлөвийн өнгө — дүрс, тэмдэгт (бичиг нь `text` өнгөөр) */
  success: string;
  warning: string;
  danger: string;
  /** Зүрх, идэвхтэй картын гэрэлтэлт */
  glow: string;
  /** Sheet, modal-ын ард бүдгэрүүлэх давхарга */
  scrim: string;
}

const darkBase = {
  bg: '#0D0C0E',
  surface: '#17151A',
  surfaceRaised: '#211D22',
  text: '#F5EDEA',
  textMuted: '#B9A9A5',
  border: '#2E2830',
  success: '#8FCB9B',
  warning: '#F2C46D',
  danger: '#F07A7A',
  scrim: 'rgba(0,0,0,0.6)',
} as const;

const lightBase = {
  bg: '#FFF8F3',
  surface: '#FFFFFF',
  surfaceRaised: '#FBEFE8',
  text: '#2B2022',
  textMuted: '#6E5A57',
  border: '#EEDDD5',
  success: '#3E8E50',
  warning: '#B07A12',
  danger: '#C8423F',
  scrim: 'rgba(43,32,34,0.45)',
} as const;

/** Анхдагч палитр = Коралл (шаардлага §3.1-ийн хүснэгт). */
export const basePalette: Record<ThemeMode, ColorTokens> = {
  dark: {
    ...darkBase,
    primary: '#E2847A',
    onPrimary: '#2A1210',
    secondary: '#F7C59F',
    onSecondary: '#2A1210',
    tertiary: '#8C6A64',
    glow: 'rgba(226,132,122,0.35)',
  },
  light: {
    ...lightBase,
    primary: '#D46A5F',
    onPrimary: '#2A1210',
    secondary: '#E9A877',
    onSecondary: '#2A1210',
    tertiary: '#8C6A64',
    glow: 'rgba(212,106,95,0.20)',
  },
};

export const palettes: Record<PaletteName, Record<ThemeMode, ColorTokens>> = {
  CORAL: basePalette,
  LAVENDER: {
    dark: {
      ...darkBase,
      primary: '#B9A3F0',
      onPrimary: '#1C1430',
      secondary: '#E9C6F2',
      onSecondary: '#1C1430',
      tertiary: '#9A86C4',
      glow: 'rgba(185,163,240,0.35)',
    },
    light: {
      ...lightBase,
      primary: '#7C5FC9',
      onPrimary: '#FFFFFF',
      secondary: '#B79AE6',
      onSecondary: '#1C1430',
      tertiary: '#7A6A9E',
      glow: 'rgba(124,95,201,0.20)',
    },
  },
  FOREST: {
    dark: {
      ...darkBase,
      primary: '#8FCB9B',
      onPrimary: '#0F2416',
      secondary: '#CBE7B4',
      onSecondary: '#0F2416',
      tertiary: '#6E8F76',
      glow: 'rgba(143,203,155,0.35)',
    },
    light: {
      ...lightBase,
      primary: '#3E7D4F',
      onPrimary: '#FFFFFF',
      secondary: '#7FB98C',
      onSecondary: '#0F2416',
      tertiary: '#5E7F67',
      glow: 'rgba(62,125,79,0.20)',
    },
  },
  OCEAN: {
    dark: {
      ...darkBase,
      primary: '#7FB8E6',
      onPrimary: '#0C1C2B',
      secondary: '#BFE3F2',
      onSecondary: '#0C1C2B',
      tertiary: '#6A8CA8',
      glow: 'rgba(127,184,230,0.35)',
    },
    light: {
      ...lightBase,
      primary: '#2F6FA3',
      onPrimary: '#FFFFFF',
      secondary: '#7FB0D6',
      onSecondary: '#0C1C2B',
      tertiary: '#5A7C98',
      glow: 'rgba(47,111,163,0.20)',
    },
  },
};

export const paletteNames = Object.keys(palettes) as PaletteName[];

/** Маскотын бүсний өнгө (FR-18.7). Гэрээнд hex биш нэрээр (`MascotColor`). */
export const mascotColors = {
  coral: '#E2847A',
  honey: '#F2C46D',
  peach: '#F7C59F',
  lavender: '#B9A3F0',
  mint: '#8FCB9B',
  sky: '#7FB8E6',
} as const;
export type MascotColorName = keyof typeof mascotColors;

/**
 * QR код (S-08): бараан theme-д ч уншигдахын тулд үргэлж цайвар дэвсгэр дээр бараан
 * модуль (зарим камер урвуу өнгийн QR уншдаггүй).
 */
export const qrColors = { module: '#2B2022', background: '#FFFFFF' } as const;

/** Бараан theme-ийн 3%-ийн «grain» давхарга (§3.3). */
export const grain = { opacity: 0.03, color: '#FFFFFF' } as const;

/** Зай 4-ийн үржвэр; дэлгэцийн хажуугийн зай 16 (§3.3). */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screen: 16,
} as const;

export const radius = {
  card: 24,
  input: 16,
  image: 20,
  pill: 999,
} as const;

/** Хүрэх талбайн доод хэмжээ (NFR-07, ≥ 44×44). */
export const touchTarget = 44;

/** Таблет ≥ 768 dp, вэб ≥ 1024 px (§3.3). */
export const breakpoints = { tablet: 768, desktop: 1024 } as const;

export const iconStroke = 1.75;

/** Хөдөлгөөний токен (§3.4): spring damping 14–18, stiffness 160–220. */
export const motion = {
  spring: { damping: 16, stiffness: 190, mass: 1 },
  springSoft: { damping: 18, stiffness: 160, mass: 1 },
  springBouncy: { damping: 14, stiffness: 220, mass: 1 },
  duration: { feedback: 100, short: 200, base: 300, long: 350, celebrationMax: 2500 },
  themeCrossFade: 300,
} as const;

export function colorsFor(palette: PaletteName, mode: ThemeMode): ColorTokens {
  return palettes[palette][mode];
}
