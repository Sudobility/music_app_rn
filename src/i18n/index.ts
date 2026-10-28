/**
 * Translations, initialised once at start-up.
 *
 * Bundled rather than fetched, unlike the web app: a native app has its
 * strings on disk already, and a locale that arrives over the network is a
 * blank screen on a train. The device's language picks the locale, falling
 * back to English for anything that is not Chinese.
 */
import i18next from 'i18next';
import type { InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { preferredLanguage } from '@sudobility/music_types';
import { CONSTANTS } from '@/config/constants';
import en from './locales/en.json';
import zh from './locales/zh.json';

export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function initializeI18n(deviceTags: readonly string[]): typeof i18next {
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      resources: { en: { translation: en }, zh: { translation: zh } },
      lng: languageFor(null, deviceTags),
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
        // The web app's pattern: any string using `{{appName}}` is filled
        // from here rather than each call site passing it, and rather than
        // the name being a translation itself — a build's own configured
        // name is not a fact about the reader's language.
        defaultVariables: { appName: CONSTANTS.APP_NAME },
      },
    } as InitOptions);
  }
  return i18next;
}

/** The part of the device prefs store the language follows. */
type LanguagePref = {
  getState(): { language: string | null };
  subscribe(listener: () => void): () => void;
};

/**
 * The language in force: the reader's choice, else the device's.
 *
 * `null` means "follow the device", which is the default and is what a reader
 * who never opened Settings gets — so a phone set to Chinese opens in Chinese.
 * A choice made in Settings is a device pref, remembered across launches; it
 * used to be `i18n.changeLanguage` alone, which lasted until the app was next
 * killed. A stored language this build does not ship is ignored rather than
 * applied, since i18next would silently fall back to English for it.
 *
 * **The rule is music_types' `preferredLanguage`; only the list is this app's.**
 * This used to compare the stored language against `SUPPORTED_LANGUAGES` whole,
 * which meant a stored `zh-Hans` — a perfectly ordinary BCP 47 tag, and what a
 * device reports — matched nothing and fell through to the device's own
 * language. A reader who had chosen Chinese on an English phone was quietly
 * given English back, for as long as the choice stayed stored. The web app had
 * matched by language subtag all along; two copies of one rule, and only one of
 * them right.
 */
export function languageFor(
  language: string | null,
  deviceTags: readonly string[],
): Language {
  return preferredLanguage(language, deviceTags, SUPPORTED_LANGUAGES);
}

/** Keeps i18next on the language the prefs store says. Returns an unsubscribe. */
export function followLanguagePref(
  prefs: LanguagePref,
  deviceTags: readonly string[],
): () => void {
  const apply = () => {
    const next = languageFor(prefs.getState().language, deviceTags);
    if (i18next.language !== next) void i18next.changeLanguage(next);
  };
  apply();
  return prefs.subscribe(apply);
}
