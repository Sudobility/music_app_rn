/**
 * Firebase and sign-in configuration — the same module, under the same
 * exports, as sudojo_app_rn's and svgr_app_rn's `src/config/env.ts`.
 *
 * Static `process.env.NAME` access only: babel's
 * `transform-inline-environment-variables` replaces each reference with its
 * build-time value, and matches nothing dynamic. A name added here must also
 * be added to `INLINED_ENV` in `babel.config.js`, or it is always its
 * default. Which platforms read each value is documented in `.env.example`.
 *
 * Firebase on iOS and Android is configured from the Google services files,
 * through native Firebase — not from here (see `AuthContext`). The desktops
 * are Firebase web apps, configured below: the project's and its web apps'
 * shared values, then each desktop's own app and measurement ids. An absent
 * API key is not an error: it means this build is local-only.
 */
import { Platform } from 'react-native';
import type { FirebaseWebConfig } from '@sudobility/auth_lib/signin';

export const env = {
  // Firebase, for the desktops' web apps: shared by the project's web apps
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ?? '',
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN ?? '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? '',
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET ?? '',
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID ?? '',
  // ...and each desktop's own web app
  FIREBASE_APP_ID_MACOS: process.env.FIREBASE_APP_ID_MACOS ?? '',
  FIREBASE_MEASUREMENT_ID_MACOS:
    process.env.FIREBASE_MEASUREMENT_ID_MACOS ?? '',
  FIREBASE_APP_ID_WINDOWS: process.env.FIREBASE_APP_ID_WINDOWS ?? '',
  FIREBASE_MEASUREMENT_ID_WINDOWS:
    process.env.FIREBASE_MEASUREMENT_ID_WINDOWS ?? '',

  // Google sign-in on the desktops, through the system browser. macOS: the
  // iOS-type client. Windows: a "Desktop app" client and its secret (a
  // loopback redirect is only accepted for that type). iOS and Android take
  // theirs from the services files.
  GOOGLE_OAUTH_CLIENT_ID_MACOS: process.env.GOOGLE_OAUTH_CLIENT_ID_MACOS ?? '',
  GOOGLE_OAUTH_CLIENT_ID_WINDOWS:
    process.env.GOOGLE_OAUTH_CLIENT_ID_WINDOWS ?? '',
  GOOGLE_OAUTH_CLIENT_SECRET_WINDOWS:
    process.env.GOOGLE_OAUTH_CLIENT_SECRET_WINDOWS ?? '',

  // Apple sign-in on Android (Apple's web flow)
  APPLE_SERVICE_ID: process.env.APPLE_SERVICE_ID ?? '',
  APPLE_REDIRECT_URI: process.env.APPLE_REDIRECT_URI ?? '',
};

const windows = Platform.OS === 'windows';

/**
 * This desktop's Firebase web app (macOS or Windows). Not used on iOS and
 * Android, which read their Google services files.
 */
export const FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: windows ? env.FIREBASE_APP_ID_WINDOWS : env.FIREBASE_APP_ID_MACOS,
  measurementId: windows
    ? env.FIREBASE_MEASUREMENT_ID_WINDOWS
    : env.FIREBASE_MEASUREMENT_ID_MACOS,
};

/**
 * This desktop's GA4 data stream, for analytics through the Measurement
 * Protocol (`src/di/desktopAnalytics.ts`): the stream's measurement id, the
 * one in `FIREBASE_CONFIG`, and an API secret created for it. Blank either and
 * the desktop sends no analytics. Not used on iOS and Android, which send
 * through native Firebase Analytics.
 */
export const GA4_CONFIG = {
  measurementId: FIREBASE_CONFIG.measurementId,
  apiSecret: windows
    ? (process.env.GA4_API_SECRET_WINDOWS ?? '')
    : (process.env.GA4_API_SECRET_MACOS ?? ''),
};

/**
 * The sign-in client ids, in the shape `@sudobility/auth_lib/signin` takes.
 * On iOS and Android auth_lib replaces the Google ones with what the services
 * files say; these are the desktops' and Apple's.
 */
export const SIGN_IN_CONFIG = {
  googleIosClientId: env.GOOGLE_OAUTH_CLIENT_ID_MACOS,
  googleWindowsClientId: env.GOOGLE_OAUTH_CLIENT_ID_WINDOWS,
  googleWindowsClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET_WINDOWS,
  googleWebClientId: '',
  appleServiceId: env.APPLE_SERVICE_ID,
  appleRedirectUri: env.APPLE_REDIRECT_URI,
};

/**
 * The test account a debug build signs in with by itself (`DevAutoSignIn`), or
 * null when `.env` names none. Always null in a release build: `babel.config.js`
 * inlines these two into development bundles only.
 */
export const DEV_SIGN_IN: { email: string; password: string } | null = (() => {
  if (!__DEV__) return null;
  const email = process.env.DEV_SIGNIN_EMAIL ?? '';
  const password = process.env.DEV_SIGNIN_PASSWORD ?? '';
  return email && password ? { email, password } : null;
})();
