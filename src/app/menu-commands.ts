/**
 * The desktop menu bar (macOS and Windows), as events.
 *
 * Every command a desktop window offers instead of the on-screen title bar:
 * File's New/Open/Save/Save As/Print/Snapshots, Import and Export, and Edit's
 * Undo/Redo, plus the two navigation commands (Projects, Settings) a phone
 * reaches from the title bar and a desktop window reaches from a menu. `Print`
 * and `Snapshots` were AppKit's own unwired template items (`print:` on the
 * first responder, and nothing at all) until they had selectors of their own —
 * the same problem `file.new` and its siblings had: AppKit disables an item
 * whose selector nobody in the responder chain implements, and this is not an
 * `NSDocument` app, so nothing answered.
 *
 * Each platform owns its own menu — AppKit's storyboard on macOS, a Win32 menu
 * bar in `windows/MoosiacRN/MoosiacRN.cpp` on Windows — and JavaScript owns
 * what a command *does*, so each platform's app shell answers a click and
 * hands it to a small native module named `MoosiacMenuBridge`
 * (`AppDelegate.mm` on macOS, `MenuBridgeModule` on Windows) that turns it
 * into one JS event. This is the JS end of that, and it does not care which
 * native module answered — the two are declared under the same RN module
 * name for exactly that reason.
 *
 * iPadOS has the same menu (`ios/music_app_rn/AppDelegate.swift` and
 * `MoosiacMenuBridge.m`), alongside the title bar rather than instead of it.
 *
 * Absent on every other platform, and that is the whole guard: Android
 * and the tests have no such module, `emitter` stays null, and subscribing is
 * a no-op rather than a crash. Nothing here should be conditional on
 * `Platform.OS` — the module's presence is the honest test, and it keeps
 * working if a third platform ever grows a menu bar.
 */
import { useEffect, useMemo, useRef } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { focusMainWindow } from '@/platform/projectsWindow';

export const MENU_COMMANDS = [
  'file.new',
  'file.open',
  'file.save',
  'file.saveAs',
  'file.print',
  'file.snapshots',
  'import.midi',
  'import.musicxml',
  'import.tracker',
  'import.audio',
  'export.midi',
  'export.musicxml',
  'export.xm',
  'export.wav',
  'export.mp3',
  'edit.undo',
  'edit.redo',
  // The Edit menu's clipboard items, on the score. A text field that has
  // focus answers Cut/Copy/Paste/Delete/Select All itself and these never
  // arrive; only when nothing editable has focus does AppKit hand them to the
  // app, which posts them here.
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.delete',
  'edit.selectAll',
  'nav.projects',
  'nav.settings',
  // Help ▸ Moosiac Help: the Docs screen.
  'nav.docs',
] as const;

export type MenuCommand = (typeof MENU_COMMANDS)[number];

const bridge = NativeModules.MoosiacMenuBridge as
  Record<string, unknown> | undefined;

const emitter = bridge ? new NativeEventEmitter(bridge as never) : null;

/*
  Whether the menu bar *replaces* the editor's title bar. True on macOS and
  Windows; an iPad has the same menu (`ios/music_app_rn/AppDelegate.swift`)
  but is used by touch as much as from a keyboard, so its bridge says
  `replacesTitleBar: false` and keeps the title bar. Read both ways because a
  legacy module's constants are properties under the bridge and only
  `getConstants()` under bridgeless interop.
*/
function replacesTitleBar(): boolean {
  if (!bridge) return false;
  const getConstants = bridge.getConstants;
  const constants =
    typeof getConstants === 'function'
      ? (getConstants as () => Record<string, unknown>)()
      : bridge;
  return (constants.replacesTitleBar ?? bridge.replacesTitleBar) !== false;
}

/** Whether this platform's menu bar stands in for the editor's title bar. */
export function hasMenuBar(): boolean {
  return emitter !== null && replacesTitleBar();
}

/**
 * Calls `handler` when a File-menu item fires.
 *
 * The handler is held in a ref so a caller needn't memoize it: an inline arrow
 * would otherwise resubscribe on every render, and a menu command that landed
 * mid-resubscribe would be dropped.
 */
export function useMenuCommand(handler: (command: MenuCommand) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!emitter) return;
    const sub = emitter.addListener(
      'menuCommand',
      (event: { command?: string }) => {
        const command = event?.command;
        if (!command) return;
        /*
          Every command here acts on, or navigates within, the main window —
          except `nav.projects`, which deliberately shows a *different* one
          instead (`showProjectsWindow`, called by whichever listener
          actually handles that command). Without this, the main window can
          be sitting hidden behind the desktop Projects window (true at
          launch, and after however long a reader spends in it) and a
          command that changes it — File ▸ New's sheet, an import landing in
          the document list, Cmd+Z — would do exactly what it says and be
          seen by nobody. Safe to call from every `useMenuCommand` consumer
          that receives this same event: bringing an already-front window
          forward again is a no-op, not a second effect.
        */
        if (command !== 'nav.projects') focusMainWindow();
        ref.current(command as MenuCommand);
      },
    );
    return () => sub.remove();
  }, []);
}

/*
  Which commands can do something right now, as one set for the whole app.

  A menu item that is enabled but does nothing is the failure this exists to
  prevent: Export, Print and Undo are answered only by the editor, so with the
  editor not on screen (Settings, the Projects tab) they used to fire into
  nothing. Every component that answers commands declares, with
  `useMenuAvailability`, the ones it can answer in its current state; the
  union goes to the native menu, which greys out everything else (AppKit's
  `validateMenuItem:`, UIKit's `canPerformAction`). A component that unmounts takes its commands with it.

  Only where the native module can take it: the macOS bridge has
  `setEnabledCommands`, as does the iPad's (`canPerformAction`); Windows'
  does not, and elsewhere there is no bridge.
*/
const available = new Map<symbol, readonly MenuCommand[]>();
let publishScheduled = false;

function publishAvailability(): void {
  publishScheduled = false;
  const setEnabledCommands = bridge?.setEnabledCommands;
  if (typeof setEnabledCommands !== 'function') return;
  const union = new Set<MenuCommand>();
  for (const commands of available.values()) {
    for (const command of commands) union.add(command);
  }
  (setEnabledCommands as (commands: MenuCommand[]) => void)([...union]);
}

function scheduleAvailability(): void {
  // Coalesced: one mount can register and update several components in the
  // same tick, and the menu needs only the state they settle on.
  if (publishScheduled) return;
  publishScheduled = true;
  queueMicrotask(publishAvailability);
}

/**
 * Declares the commands this component can answer right now. Pass every
 * command it handles whose action is currently possible; the rest of the menu
 * is greyed out. Re-declared whenever the list changes, withdrawn on unmount.
 */
export function useMenuAvailability(commands: readonly MenuCommand[]): void {
  const key = useMemo(() => Symbol('menu-availability'), []);
  const signature = [...commands].sort().join(' ');
  useEffect(() => {
    if (!bridge) return;
    available.set(
      key,
      signature === '' ? [] : (signature.split(' ') as MenuCommand[]),
    );
    scheduleAvailability();
  }, [key, signature]);
  useEffect(
    () => () => {
      if (!bridge) return;
      available.delete(key);
      scheduleAvailability();
    },
    [key],
  );
}

/**
 * Adds a document to the system's File ▸ Open Recent menu (macOS). AppKit
 * keeps it there across launches, and in the sandbox keeps the access to it
 * too, so a file opened from anywhere can be reopened after a relaunch.
 * A no-op where the menu bridge cannot take it.
 */
export function noteRecentDocument(uri: string): void {
  const note = bridge?.noteRecentDocument;
  if (typeof note === 'function') (note as (uri: string) => void)(uri);
}
