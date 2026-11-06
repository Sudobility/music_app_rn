/**
 * Deep linking, mirroring the web app's routes — the same destinations at the
 * same paths, so a `moosiac.com` URL and its in-app screen are one address.
 *
 * The web is a router over `/:lang/...`; React Navigation's `linking` maps the
 * same paths onto this app's navigator. Three prefixes are honoured: the custom
 * scheme `moosiac://` and the universal links `https://moosiac.com` /
 * `https://www.moosiac.com` (domain from `CONSTANTS.APP_DOMAIN`).
 *
 * A path may carry an optional `/:lang` prefix (e.g. `/ja/docs/legato`); it is
 * stripped and, when it names a shipped language, set as the reader's language
 * (persisted through the device-prefs store, which the composition root follows
 * onto i18next). A path without one navigates without changing language.
 *
 * Web-only paths are rewritten to their app equivalents: `signin` has no route
 * here (sign-in is a pane of Settings), and `credits/coupons` is a redirect to
 * `credits` on the web; `credits/history` opens Settings' Credit-history
 * section, where this app keeps it.
 */
import {
  type LinkingOptions,
  getStateFromPath as defaultGetStateFromPath,
} from '@react-navigation/native';
import i18next from 'i18next';
import { CONSTANTS } from '@/config/constants';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { devicePrefs } from '@/config/useDevicePrefs';
import type { RootStackParamList } from './Navigation';

const prefixes = [
  'moosiac://',
  `https://${CONSTANTS.APP_DOMAIN}`,
  `https://www.${CONSTANTS.APP_DOMAIN}`,
];

/** Shipped language codes, for an O(1) check of the optional path prefix. */
const LANG_SET = new Set<string>(SUPPORTED_LANGUAGES as readonly string[]);

/** Web-only first segments → their app path. */
const PATH_REWRITES: Record<string, string> = {
  // Sign-in is a pane of Settings here, not a route of its own.
  signin: 'settings',
  // The web redirects the old coupons page to the credits screen.
  'credits/coupons': 'credits',
};

/**
 * The route tree, by bare path (no language prefix — `getStateFromPath` strips
 * that first). Matches `music_app`'s `/:lang/...` route set.
 */
const config: LinkingOptions<RootStackParamList>['config'] = {
  screens: {
    Main: {
      screens: {
        Dashboard: 'projects',
        Community: 'community',
        Docs: 'docs/:topicId?',
        Resources: 'resources',
        Settings: 'settings',
      },
    },
    Editor: 'project/:projectId',
    Published: 'p/:publicId',
    Credits: 'credits',
  },
};

/** Settings opened on its Credit-history section — the web's `credits/history`. */
const CREDIT_HISTORY_STATE: ReturnType<typeof defaultGetStateFromPath> = {
  routes: [
    {
      name: 'Main',
      state: { routes: [{ name: 'Settings', params: { section: 'history' } }] },
    },
  ],
};

function getStateFromPath(
  path: string,
  options: Parameters<typeof defaultGetStateFromPath>[1],
): ReturnType<typeof defaultGetStateFromPath> {
  let cleaned = path.replace(/^\/+/, '').trim();

  // Keep any query string to re-append after the path is normalised.
  let query = '';
  const q = cleaned.indexOf('?');
  if (q !== -1) {
    query = cleaned.slice(q);
    cleaned = cleaned.slice(0, q);
  }

  // Strip an optional language prefix and, if shipped, adopt it. The prefs
  // store is the source of truth; the composition root keeps i18next on it.
  const segments = cleaned.split('/');
  if (segments.length > 0 && LANG_SET.has(segments[0])) {
    const lang = segments[0];
    cleaned = segments.slice(1).join('/');
    if (i18next.language !== lang) devicePrefs.getState().setLanguage(lang);
  }

  // Web-only path rewrites: whole path first (e.g. `credits/coupons`), then the
  // first segment (e.g. `signin`).
  if (cleaned in PATH_REWRITES) {
    cleaned = PATH_REWRITES[cleaned];
  } else {
    const first = cleaned.split('/')[0];
    if (first in PATH_REWRITES) {
      cleaned = [PATH_REWRITES[first], ...cleaned.split('/').slice(1)].join(
        '/',
      );
    }
  }

  // `credits/history` is a Settings section here, not a route of its own.
  if (cleaned === 'credits/history') return CREDIT_HISTORY_STATE;

  return defaultGetStateFromPath('/' + cleaned + query, options);
}

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes,
  config,
  getStateFromPath,
};
