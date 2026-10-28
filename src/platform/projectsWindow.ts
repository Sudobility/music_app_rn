/**
 * Opening the desktop Projects window, and leaving it — macOS and Windows
 * only; a phone has no separate windows to manage.
 *
 * `showProjectsWindow` is what `nav.projects` calls on desktop instead of
 * `navigationRef.navigate('Dashboard')` (see `MenuFileCommands.tsx`): a
 * *separate* native window (`MoosiacProjectsWindow`, created lazily and
 * reused after the first call — `AppDelegate.mm` on macOS,
 * `WindowManagerModule.cpp` on Windows), not a screen pushed onto the main
 * window's own stack. It is not a sheet and not application-modal: the
 * editor window stays interactive while it is open, ordinary-window
 * behaviour, the same as a "Preferences" window.
 *
 * **Dismissed exactly two ways**, per `ProjectsSplitView.tsx`: the reader's
 * own click on the *native* close button (nothing this window draws closes
 * it — there is deliberately no in-app Cancel/X), or opening a project —
 * New, Template, Import or picking one from My Projects — which calls both
 * `focusMainWindow` (so picking a project actually takes you to it) and
 * `closeProjectsWindow` (so a picker that has done its job gets out of the
 * way). Signing in is not on that list: it swaps the sidebar's Connect item
 * for My Projects in place and leaves the window open.
 */
import { NativeModules, Platform } from 'react-native';

type ProjectsWindowModule = {
  show: () => void;
  focusMain: () => void;
  close: () => void;
};

const DESKTOP_PLATFORMS = new Set(['macos', 'windows']);

function native(): ProjectsWindowModule | undefined {
  if (!DESKTOP_PLATFORMS.has(Platform.OS)) return undefined;
  return NativeModules.MoosiacProjectsWindow as
    ProjectsWindowModule | undefined;
}

export function showProjectsWindow(): void {
  native()?.show();
}

export function focusMainWindow(): void {
  native()?.focusMain();
}

export function closeProjectsWindow(): void {
  native()?.close();
}
