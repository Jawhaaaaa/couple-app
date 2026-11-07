import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { type Locale, usePrefsStore } from '@/stores/prefsStore';

import en from './en.json';
import mn from './mn.json';

export const resources = { mn: { translation: mn }, en: { translation: en } } as const;
export const supportedLocales: Locale[] = ['mn', 'en'];

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: usePrefsStore.getState().locale,
    fallbackLng: 'mn',
    interpolation: { escapeValue: false },
  });
}

/** Хэл солигдоход дахин ачаалалгүй бүх дэлгэц шинэчлэгдэнэ (FR-18.1, AC-135). */
usePrefsStore.subscribe((state, prev) => {
  if (state.locale !== prev.locale) i18n.changeLanguage(state.locale);
});

export function useT() {
  return useTranslation().t;
}

export { i18n };
export * from './calendarDate';
export * from './format';
