/**
 * Sets the window's title bar text, and the app's own name in the menu bar —
 * macOS and Windows only; every other platform has no window chrome or menu
 * bar for either to touch.
 *
 * Native rather than a static build-time name, on both platforms: neither
 * Xcode nor MSBuild has a way to read `.env`'s `VITE_APP_NAME` (that is read
 * at Metro-bundle time, not native-build time), and duplicating the name into
 * a native build setting would be the branding name declared twice — see
 * `CONSTANTS`'s own comment in `config/constants.ts`. `MoosiacWindowTitle` is
 * the one bridge that lets this stay a single JS call instead:
 * `AppDelegate.mm` on macOS, `WindowTitleModule.cpp` on Windows — the same
 * two-native-implementations-one-JS-module-name shape `menu-commands.ts`
 * uses for `MoosiacMenuBridge`, and for the same reason.
 *
 * `applyWindowTitle` is called reactively, not once at start-up — see
 * `WindowTitleSync.tsx`, which is what actually calls it as the active
 * document changes. `applyAppName` is the opposite: the app's own name does
 * not change mid-session, so it is called once, at start-up (`App.tsx`).
 * Windows has no `setAppName` to call — its menu bar is authored here, in
 * `windows/MoosiacRN/MoosiacRN.cpp`, with no Xcode-style template to have
 * baked a codebase name into; the macOS storyboard's "About/Hide/Quit music_app_rn" and
 * "music_app_rn Help" are what this exists to fix, and Windows never had
 * the equivalent to begin with.
 */
import { NativeModules, Platform } from 'react-native';

type WindowTitleModule = {
  setTitle: (title: string) => void;
  setAppName?: (name: string) => void;
};

const DESKTOP_PLATFORMS = new Set(['macos', 'windows']);

export function applyWindowTitle(title: string): void {
  if (!DESKTOP_PLATFORMS.has(Platform.OS)) return;
  const native = NativeModules.MoosiacWindowTitle as
    WindowTitleModule | undefined;
  native?.setTitle(title);
}

export function applyAppName(name: string): void {
  if (Platform.OS !== 'macos') return;
  const native = NativeModules.MoosiacWindowTitle as
    WindowTitleModule | undefined;
  native?.setAppName?.(name);
}
