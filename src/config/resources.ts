/**
 * Resources catalog wiring (public, read-only).
 *
 * The catalog is served per (app, locale) from the shared Sudobility catalog,
 * reached through music_api's public `/api/v1/resources` forwarder. It needs no
 * identity, so it is built from the shared network client (not the auth stack),
 * exactly like `publicServerContext()`.
 *
 * `ensureResourcesInitialized()` is idempotent — call it from the Resources
 * screen before rendering the connected component.
 */
import {
  ResourcesApiClient,
  initializeResources,
} from '@sudobility/resources_client';
import { getNetworkClient } from '@/config/server';
import { CONSTANTS } from '@/config/constants';

let initialized = false;

export function ensureResourcesInitialized(): boolean {
  if (!CONSTANTS.API_URL) return false;
  if (!initialized) {
    initializeResources({
      apiClient: new ResourcesApiClient({
        // baseUrl carries /api/v1; resources_client appends `/resources`.
        baseUrl: `${CONSTANTS.API_URL}/api/v1`,
        networkClient: getNetworkClient(),
      }),
    });
    initialized = true;
  }
  return true;
}
