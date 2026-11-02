/**
 * A missing translation is invisible: i18next falls back to English, which
 * looks like a working app until a Chinese reader hits it. So both halves are
 * pinned — the same keys in both files, and every zh string actually
 * containing CJK. Key parity alone passes happily when English was copied
 * across as a placeholder, which is exactly how 42 strings shipped
 * untranslated in the web app.
 */
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import zh from './locales/zh.json';
import { languageFor } from './index.js';

function flatten(o: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

/**
 * The same in both on purpose.
 *
 * A Chinese reader looking for the MIDI export is looking for the word MIDI.
 * The web app's parity test makes the same allowance for the same entries; a
 * value with no CJK and no Latin word at all (punctuation, a number) is fine
 * anywhere and is filtered below rather than listed here.
 */
const SHARED_BY_DESIGN = new Set([
  'docs.formats.name.midi',
  'docs.formats.name.musicxml',
  'editor.midi',
  'editor.musicXml',
  // A paper size's name; the web's locale lists it as shared by design too.
  'print.paperA4',
  // Credit-history source labels for the app stores are proper nouns, left
  // untranslated — the web app lists these same two as shared by design.
  'history.sourceApple',
  'history.sourceGoogle',
  // The language picker's own labels are each language's native name, shown the
  // same whatever the UI language — a reader looking for their language is not
  // scanning for the Chinese word for it. Most carry no CJK by nature
  // (`Deutsch`, `Français`), so they are shared by design rather than translated.
  'settings.language_en',
  'settings.language_de',
  'settings.language_es',
  'settings.language_fr',
  'settings.language_it',
  'settings.language_ja',
  'settings.language_ko',
  'settings.language_pt',
  'settings.language_ru',
  'settings.language_sv',
  'settings.language_th',
  'settings.language_uk',
  'settings.language_vi',
  'settings.language_zh',
  'settings.language_zh-hant',
]);

describe('locales', () => {
  it('define exactly the same keys', () => {
    expect(Object.keys(flatten(en)).sort()).toEqual(
      Object.keys(flatten(zh)).sort(),
    );
  });

  it('actually translate the Chinese strings', () => {
    const zhFlat = flatten(zh);
    for (const [key, value] of Object.entries(zhFlat)) {
      if (SHARED_BY_DESIGN.has(key)) continue;
      expect(/[一-鿿]/.test(value), `${key} has no CJK: ${value}`).toBe(true);
    }
  });
});

/**
 * The resolution rule itself is music_types' `preferredLanguage` and is tested
 * there, since both apps call it. What is left here is that this app hands it
 * this build's list — and the case that rule was brought in to fix.
 */
describe('languageFor', () => {
  it("follows the device until the reader chooses, then keeps the reader's choice", () => {
    expect(languageFor(null, ['zh-Hans-CN'])).toBe('zh');
    expect(languageFor('en', ['zh-Hans-CN'])).toBe('en');
  });

  it('reads the device tags, and falls back to English', () => {
    expect(languageFor(null, ['zh-Hans-CN', 'en-US'])).toBe('zh');
    expect(languageFor(null, ['en-GB'])).toBe('en');
    // A device language this build ships is honoured by its subtag.
    expect(languageFor(null, ['fr-FR'])).toBe('fr');
    // One it does not ship (Esperanto) falls through to English.
    expect(languageFor(null, ['eo'])).toBe('en');
    expect(languageFor(null, [])).toBe('en');
  });

  it('ignores a stored language this build does not ship', () => {
    expect(languageFor('eo', ['zh-TW'])).toBe('zh');
  });

  it('keeps a stored Traditional Chinese choice rather than folding it into Simplified', () => {
    // `zh-hant` is an exact code the reader can only reach by choosing it; the
    // shared subtag rule would otherwise match it to `zh`.
    expect(languageFor('zh-hant', ['en-US'])).toBe('zh-hant');
  });

  it('keeps a stored regional or scripted tag, which it used to drop', () => {
    /*
      A stored `zh-Hans` matched no entry in `SUPPORTED_LANGUAGES` when the
      comparison was whole-tag, so it fell through to the device — and a reader
      who had chosen Chinese on an English phone got English back.
    */
    expect(languageFor('zh-Hans', ['en-US'])).toBe('zh');
    expect(languageFor('zh-Hant-TW', ['en-US'])).toBe('zh');
    expect(languageFor('en-GB', ['zh-CN'])).toBe('en');
  });
});
