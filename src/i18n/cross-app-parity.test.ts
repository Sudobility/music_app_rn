/**
 * The two apps say the same thing, or say why not.
 *
 * `music_app` and this app are one product, and 798 of their translation keys
 * are the same key. Nothing shares them: the libraries hold no strings in any
 * language — that rule is what lets a Chinese reader get Chinese documentation
 * rather than a library's idea of English — so the copy is two files that drift
 * the moment one is edited, silently, because both apps still render.
 *
 * `docs-parity.test.ts` pinned the documentation prose that way. This pins
 * everything else, in four checks that each catch a different failure:
 *
 * - **Where the English agrees, the Chinese must agree too.** A key whose
 *   English is identical in both apps and whose Chinese is not is a *translation*
 *   fork with no design behind it — two translators' words for one string. Six
 *   of these had accumulated (`断音`/`断奏` for staccato, `临时记号`/`变音记号`
 *   for an accidental, and four more), and none of them is a decision anybody
 *   made. There is deliberately no exemption list here: if the English is one
 *   string, so is the Chinese.
 *
 * - **The English must agree unless it is listed below.** Where the two apps
 *   genuinely say different things — a document is a project on the web, the
 *   native transport shows a percentage the web shows in a separate indicator —
 *   the exemption is written down with its reason, the way
 *   `locale-parity.test.ts`'s `SHARED_BY_DESIGN` is. A new disagreement fails
 *   until somebody decides it is one.
 *
 * - **One string, one key.** The same English under a key only the web has and
 *   a key only this app has is one label keyed twice — `editor.octave` beside
 *   `inspector.octave` was twenty-eight of those — and the two drift the moment
 *   one is edited, invisibly to the check above, which compares key by key.
 *   Rename to one key set, or list the key in `SAME_WORDS_DIFFERENT_KEYS` with
 *   the reason the two are not one label.
 *
 * - **Every key `music_types` publishes must resolve in both apps and both
 *   languages.** `ACCIDENTAL_OPTIONS` and friends carry an i18n *key*, not a
 *   word, so a picker built from them prints the raw key when the host has no
 *   string for it. That is exactly what the web's ornament picker did: the
 *   library asks for `ornament.invertedMordent` and the locale carried the
 *   model's kebab-case `ornament.inverted-mordent`, so the menu read
 *   "ornament.invertedMordent" and no test could see it — a key that is missing
 *   from *both* locales is perfectly consistent.
 *
 * Cross-repo, and only in this direction: the web app's suite must not need a
 * checkout of this one. If the sibling is not there the tests skip rather than
 * fail, because a CI job with one repo checked out has not broken anything.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCIDENTAL_OPTIONS,
  ARTICULATION_OPTIONS,
  DYNAMIC_OPTIONS,
  MIDI_GRID_OPTIONS,
  ORNAMENT_OPTIONS,
} from '@sudobility/music_types';

const WEB_LOCALES = join(__dirname, '../../../music_app/public/locales');
const webLocale = (lang: string) => join(WEB_LOCALES, lang, 'app.json');
const nativeLocale = (lang: string) => join(__dirname, `locales/${lang}.json`);

/**
 * Keys the two apps deliberately word differently, each with its reason.
 *
 * Keep this list short and keep it explained. Anything here is a place the two
 * apps are allowed to disagree; everything else is a drift.
 */
const WORDED_DIFFERENTLY: Record<string, string> = {
  'docs.playback.keyboard.p2':
    'Shift-click edits chords on web and desktop; native taps have no Shift modifier',
  // A native document is a file; a web project is a row on a server. The two
  // words are the honest ones for the two things.
  'importMidi.description': 'document vs project',
  'inspector.scoreTitleHint': 'document name vs project name',
  'library.saveFailed': 'a save here, an autosave there',
  // The web sells credits and the native app cannot — `consumables_pages` has
  // no React Native build, so the native copy explains the rate instead.
  'credits.rate': 'the web quotes a price, the native app a rate',
  'credits.balance': 'balance is unambiguous on a screen of its own',
  // A tooltip on a pointer has room to explain; a long-press hint on a phone
  // does not, and a hint that wraps to three lines is a hint nobody reads.
  'editor.arpeggiateHint': 'pointer tooltip vs touch hint',
  'editor.beamBreakHint': 'pointer tooltip vs touch hint',
  'editor.beamNoneHint': 'pointer tooltip vs touch hint',
  'editor.crescendoHint': 'pointer tooltip vs touch hint',
  'editor.diminuendoHint': 'pointer tooltip vs touch hint',
  'editor.dottedHint': 'pointer tooltip vs touch hint',
  'editor.fermataHint': 'pointer tooltip vs touch hint',
  'editor.insertRestHint': 'pointer tooltip vs touch hint',
  'editor.slurHint': 'pointer tooltip vs touch hint',
  'editor.tripletHint': 'pointer tooltip vs touch hint',
  'inspector.dynamicHint': 'pointer tooltip vs touch hint',
  // The web names a keyboard shortcut in the tooltip; there is no keyboard to
  // name on a phone.
  'editor.insertMode': 'the web names the mode, the sheet names the action',
  'editor.replaceMode': 'the web names the mode, the sheet names the action',
  'editor.stackMode': 'the web names the mode, the sheet names the action',
  // An empty state on a full page can be a sentence; one in a 320pt panel
  // cannot.
  'inspector.noScore': 'sentence vs panel empty state',
  'inspector.selectMeasure': 'sentence vs panel empty state',
  'inspector.selectNote': 'sentence vs panel empty state',
  'inspector.selectTrack': 'sentence vs panel empty state',
  'community.empty': 'sentence vs panel empty state',
  'errors.loadProjects': 'sentence vs panel empty state',
  'editor.lastMeasureKept': 'sentence vs panel empty state',
  'editor.validationProblem': 'sentence vs panel empty state',
  // A toolbar select's trigger is one glyph wide here; the words go in a sheet
  // that is narrower than a web menu.
  'ornament.invertedMordent': 'abbreviated for a narrow sheet',
  // Navigation and settings copy, where the native app has a screen and the web
  // has a link in a bar.
  'settings.themeSystem': 'screen row vs select option',
  'transport.position': 'screen row vs tooltip',
  'transport.speedMultiplier': 'screen row vs tooltip',
  'transport.toggleLoop': 'screen row vs tooltip',
  'transport.toggleMetronome': 'screen row vs tooltip',
  // The web names the gesture, because it has a caret to name; a tap has none.
  'editor.deleteMeasure': 'the web names the caret',
  'inspector.pickup': 'the web has room for the noun',
};

/**
 * Keys that carry the same English as a key only the other app has, and are
 * deliberately not that key — each with its reason.
 *
 * Keyed by the key in *either* app. A common word turning up under two keys is
 * not by itself a drift; two keys for one label is. What goes here is the
 * first kind.
 */
const SAME_WORDS_DIFFERENT_KEYS: Record<string, string> = {
  // A link in the web's footer and the heading of a settings row here: two
  // different controls that happen to share a word, not one label.
  'footer.account': 'footer link vs settings row',
  'settings.account': 'footer link vs settings row',
  /*
    The web's is a link out of its Settings *page*, and belongs to that page.
    The native one is the shell's: on macOS the navigator draws no header at
    all, so `ScreenBackBar` is the only way out of *any* pushed screen — Docs
    and Shortcuts included — which is why it is not named after settings.
  */
  'settings.page.backButton': 'a settings page link vs the shell control',
  'nav.back': 'a settings page link vs the shell control',
};

type Flat = Record<string, string>;

function flatten(o: unknown, prefix = ''): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const load = (path: string): Flat =>
  flatten(JSON.parse(readFileSync(path, 'utf8')));

const haveWeb = existsSync(webLocale('en'));

describe.skipIf(!haveWeb)('the two apps say the same thing', () => {
  const webEn = () => load(webLocale('en'));
  const webZh = () => load(webLocale('zh'));
  const rnEn = () => load(nativeLocale('en'));
  const rnZh = () => load(nativeLocale('zh'));

  it('agrees in Chinese wherever it agrees in English', () => {
    const [we, wz, re, rz] = [webEn(), webZh(), rnEn(), rnZh()];
    const forks: string[] = [];
    for (const key of Object.keys(we)) {
      if (re[key] === undefined || we[key] !== re[key]) continue;
      if (wz[key] !== rz[key]) forks.push(key);
    }
    expect(forks, 'one English string, two Chinese words').toEqual([]);
  });

  it('agrees in English except where the difference is written down', () => {
    const [we, re] = [webEn(), rnEn()];
    const undeclared = Object.keys(we).filter(
      key =>
        re[key] !== undefined &&
        we[key] !== re[key] &&
        WORDED_DIFFERENTLY[key] === undefined,
    );
    expect(
      undeclared,
      'add each to WORDED_DIFFERENTLY with its reason, or make the two agree',
    ).toEqual([]);
  });

  it('keys one string once across the two apps', () => {
    const [we, re] = [webEn(), rnEn()];
    const onlyIn = (strings: Flat, other: Flat) => {
      const byValue = new Map<string, string[]>();
      for (const [key, value] of Object.entries(strings)) {
        if (other[key] !== undefined || SAME_WORDS_DIFFERENT_KEYS[key])
          continue;
        byValue.set(value, [...(byValue.get(value) ?? []), key]);
      }
      return byValue;
    };
    const webOnly = onlyIn(we, re);
    const nativeOnly = onlyIn(re, we);
    const twice = [...webOnly]
      .filter(([value]) => nativeOnly.has(value))
      .map(
        ([value, keys]) =>
          `${JSON.stringify(value)}: web ${keys.join(
            ', ',
          )} / native ${nativeOnly.get(value)!.join(', ')}`,
      );
    expect(
      twice,
      'rename to one key in both apps, or add it to SAME_WORDS_DIFFERENT_KEYS with its reason',
    ).toEqual([]);
  });

  it('has no stale one-string exemption', () => {
    const [we, re] = [webEn(), rnEn()];
    const settled = Object.keys(SAME_WORDS_DIFFERENT_KEYS).filter(key => {
      const [mine, other] =
        we[key] !== undefined && re[key] === undefined
          ? [we, re]
          : re[key] !== undefined && we[key] === undefined
            ? [re, we]
            : [null, null];
      if (!mine || !other) return true;
      return !Object.entries(other).some(
        ([k, value]) => mine[k] === undefined && value === mine[key],
      );
    });
    expect(settled, 'these no longer share a string — drop them').toEqual([]);
  });

  it('has no stale exemption', () => {
    const [we, re] = [webEn(), rnEn()];
    const settled = Object.keys(WORDED_DIFFERENTLY).filter(
      key => re[key] === undefined || we[key] === re[key],
    );
    expect(settled, 'these agree now — drop them from the list').toEqual([]);
  });
});

/**
 * The library names the key; the app has to carry the word.
 *
 * A picker built from these prints the raw key when it does not, and neither
 * app's own parity test can see it: a key missing from both of one app's
 * locales is perfectly consistent with itself.
 */
const LIBRARY_KEYS = [
  ...ARTICULATION_OPTIONS,
  ...ORNAMENT_OPTIONS,
  ...ACCIDENTAL_OPTIONS,
  ...DYNAMIC_OPTIONS,
  ...MIDI_GRID_OPTIONS,
]
  /*
    A dynamic's own marking carries no key: `pp` is `pp` in every language, so
    only `DYNAMIC_OPTIONS`' "no dynamic" entry names one.
  */
  .flatMap(option => ('labelKey' in option ? [option.labelKey] : []));

describe('every key music_types publishes resolves', () => {
  it.each(['en', 'zh'])('in this app (%s)', lang => {
    const strings = load(nativeLocale(lang));
    expect(LIBRARY_KEYS.filter(key => strings[key] === undefined)).toEqual([]);
  });

  it.skipIf(!haveWeb).each(['en', 'zh'])('in the web app (%s)', lang => {
    const strings = load(webLocale(lang));
    expect(LIBRARY_KEYS.filter(key => strings[key] === undefined)).toEqual([]);
  });
});
