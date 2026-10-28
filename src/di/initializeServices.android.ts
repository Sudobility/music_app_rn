/**
 * Service initialization for music_app_rn (Android).
 *
 * Uses @sudobility/di_rn for centralized initialization: native Firebase —
 * analytics, crashlytics, messaging — configured
 * from `google-services.json`. The same arrangement as sudojo_app_rn's
 * and svgr_app_rn's `src/di`.
 */

import {
  initializeRNApp,
  type FirebaseAnalyticsService,
} from '@sudobility/di_rn';

let servicesInitialized = false;
let analyticsService: FirebaseAnalyticsService | null = null;

/**
 * Initialize all services using di_rn's centralized initialization.
 *
 * This sets up:
 * - Storage service
 * - Firebase service (analytics, messaging)
 * - Network service
 * - Info service (for toast notifications)
 */
export async function initializeAllServices(): Promise<FirebaseAnalyticsService> {
  if (servicesInitialized && analyticsService) {
    return analyticsService;
  }

  analyticsService = await initializeRNApp({
    firebaseOptions: {
      enableAnalytics: true,
      enableMessaging: true,
    },
  });

  // Firebase Auth is the JS SDK, initialised lazily by AuthContext on every
  // platform; native Firebase here is analytics and messaging.

  servicesInitialized = true;
  return analyticsService;
}

/**
 * Get the analytics service
 */
export function getAnalytics(): FirebaseAnalyticsService | null {
  return analyticsService;
}
