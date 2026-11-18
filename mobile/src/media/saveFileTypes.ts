export type SaveOutcome = 'shared' | 'downloaded';

export interface SaveFileInput {
  url: string;
  fileName: string;
  /** Нэвтрэлт шаарддаг URL-д (экспортын `…/download` → 302) — `Authorization` г.м. */
  headers?: Record<string, string>;
  mime?: string;
}

/** Файлын нэрийн аюултай тэмдэгтийг солино (кэшийн зам, татах нэр). */
export function safeFileName(name: string): string {
  return name.replace(/[\/:*?"<>|\s]+/g, '_').slice(0, 120) || 'aura-file';
}
