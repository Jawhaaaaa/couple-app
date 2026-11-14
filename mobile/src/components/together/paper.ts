import type { LetterTemplate } from '@/api/queries/letters';
import { useColors } from '@/theme/ThemeProvider';

export interface PaperColors {
  bg: string;
  ink: string;
  border: string;
  accent: string;
}

/** Захидлын 3 загварын (FR-10.1) өнгө — theme-ийн токеноос (бичиг/дэвсгэрийн хос AC-DS-01-ийг хангасан). */
export function usePaperColor(template: LetterTemplate): PaperColors {
  const c = useColors();
  switch (template) {
    case 'PAPER_2':
      return { bg: c.surfaceRaised, ink: c.text, border: c.border, accent: c.secondary };
    case 'PAPER_3':
      return { bg: c.secondary, ink: c.onSecondary, border: c.tertiary, accent: c.primary };
    default:
      return { bg: c.surface, ink: c.text, border: c.border, accent: c.primary };
  }
}
