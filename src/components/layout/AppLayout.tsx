/**
 * The editor, laid out as the web app lays it out.
 *
 * Title bar (where there is no menu bar to carry it instead — see
 * `hasMenuBar()` below), then the score with the inspector beside it, then the
 * transport, the keyboard and the status strip. The web app's `AppLayout` has
 * exactly this order, and matching it is the point: the two are the same
 * product, and somebody who knows where the transport is should not have to
 * look for it.
 *
 * The inspector is a right-hand column, as it is on the web, and on a touch
 * device it **trades places with the canvas track gutter**: shown, the gutter
 * is off; hidden, the gutter is back. See `TRADES_GUTTER_FOR_INSPECTOR`.
 *
 * It used to be a column only above 760×600 and a strip beneath the score
 * below that, which is a rule that made sense while a portrait tablet was
 * possible. Every device here is landscape-only now, and in landscape a column
 * is the cheap arrangement and a strip is the expensive one: height is what is
 * scarce (the title bar, tabs, editing bar, transport, keyboard and status
 * strip are all fixed rows and only the score absorbs the rest), and a column
 * costs none of it. The strip arrangement was taking the one thing the phone
 * could not spare.
 */
import { Platform, StatusBar as RNStatusBar, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import {
  KEYBOARD_MAX_HEIGHT,
  keyboardPanelHeight,
} from '@sudobility/music_drawing';
import {
  findEvent,
  findTrack,
  isNoteEvent,
  isVocalInstrumentValue,
} from '@sudobility/music_types';
import type { NoteEvent } from '@sudobility/music_types';
import { SafeAreaView, useSafeAreaInsets } from '@/platform/SafeArea';
import { useSafeEdgeList } from '@/platform/safe-edges';
import { HeaderHeightContext } from '@react-navigation/elements';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useStore } from 'zustand';
import {
  beginLyricEntry as beginLyricEntryAt,
  getMusicSelection,
  routeScorePress,
  runScoreContextAction,
  scoreContextMenuModel,
  selectForContextMenu,
  useClipboardPrompts,
} from '@sudobility/music_editing';
import { ClipboardPromptSheets } from '@/features/score-editor/ClipboardPromptSheets';
import type { ReplaceScope } from '@sudobility/music_types';
import {
  selectActiveTrackId,
  selectVisibleTrackIds,
} from '@sudobility/music_editing';
import { ScrollingScore } from '@/features/score/ScrollingScore';
import { SpatialSection } from '@/features/spatial/SpatialSection';
import { useScreenshotScene } from '@/features/screenshots/screenshot-scene';
import type { ScrollOffset } from '@/features/score/useScoreCanvas';
import { TransportBar } from '@/features/transport/TransportBar';
import { usePlayerBinding } from '@/features/transport/usePlayerBinding';
import { KeyboardPanel } from '@/features/piano-keyboard/KeyboardPanel';
import { InspectorPanel } from '@/features/inspector/InspectorPanel';
import { ScoreActionsSheet } from '@/features/score-editor/ScoreActionsSheet';
import { DocumentTabs } from '@/features/documents/DocumentTabs';
import { useScoreSelection } from '@/features/score/useScoreSelection';
import { EditorToolbar } from '@/features/score-editor/EditorToolbar';
import { LyricEntryBar } from '@/features/score-editor/LyricEntryBar';
import { TitleBar } from './TitleBar';
import {
  hasMenuBar,
  useMenuAvailability,
  useMenuCommand,
} from '@/app/menu-commands';
import type { MenuCommand } from '@/app/menu-commands';
import type { ScoreContextAction } from '@sudobility/music_types';
import { hasNativeHeader } from '@/app/native-header';
import { hasTabBar } from '@/app/tab-bar';
import { devicePrefs, useDevicePrefs } from '@/config/useDevicePrefs';
import type { GenerationChoicesProps } from '@/features/generation/GenerationChoices';
import type { ProjectOriginProps } from '@/features/generation/ProjectOriginPanel';
import { StatusBar } from './StatusBar';
import { useContainerSize } from '@/features/layout/useContainerSize';
import { inspectorOpensByDefault } from '@/features/layout/inspector-default';
import type { ReactNode } from 'react';
import type { MusicDocument } from '@/documents/document';
import type {
  ScoreCanvasHit,
  LayoutMode,
  TrackInfoMode,
} from '@sudobility/music_types';

/**
 * On a touch device the inspector and the track gutter never share the screen.
 *
 * The canvas reserves `TRACK_INFO_WIDTH` (220) at the left of every system for
 * each track's name, instrument and mute/solo. On a landscape phone measured at
 * 874×402 — 756 inside the safe area — a 320pt inspector plus that 220pt
 * column left **216pt of music**: one bar per system. The arithmetic simply
 * does not close on a phone, and it does not close on a tablet either once the
 * reader has opened the panel they opened it to use.
 *
 * So they trade: inspector shown → no gutter, inspector hidden → gutter. (The
 * gutter at its full width, that is. Narrowed to the instrument icon it is
 * 40pt, which the arithmetic does close on, so that mode stays: see
 * `trackInfoShown`.) What
 * the gutter was telling you is exactly what the inspector's Track tab tells
 * you — the name, the instrument, mute and solo — so nothing is lost while it
 * is off, and the active track is still changed by tapping a staff, which
 * was never the gutter's job.
 *
 * **macOS keeps both**, which is why this is a platform question and not a
 * width one: the desktop window is large enough for a gutter, a panel and a
 * readable system at once, and a rule derived purely from width would have to
 * pick a threshold that quietly re-enabled the gutter on an 11" iPad — which
 * is the device this was decided against.
 */
const TRADES_GUTTER_FOR_INSPECTOR = Platform.OS !== 'macos';

/**
 * How much of the track-info gutter the score draws, from what the reader
 * chose and what else is on screen.
 *
 * The reader's choice, except that the full column gives way to the inspector
 * where the two trade. The icon alone does not: it was the full column's
 * width the trade was decided against, and a reader who narrowed the gutter
 * to keep it has not asked for it to vanish when they open a panel.
 */
export function trackInfoShown(
  chosen: TrackInfoMode,
  inspectorVisible: boolean,
  trades: boolean = TRADES_GUTTER_FOR_INSPECTOR,
): TrackInfoMode {
  return chosen === 'full' && trades && inspectorVisible ? 'hidden' : chosen;
}

export type AppLayoutProps = {
  document: MusicDocument;
  onSave: () => void;
  onExport: () => void;
  /** An export is being written. See `TitleBar`. */
  exporting?: boolean;
  /** Opens Settings. See `TitleBar`. */
  onSettings: () => void;
  /** Opens the projects list — the only route to New Project and to imports. */
  onDocuments: () => void;
  /** Shows the keyboard shortcuts. Absent where the holder has no sheet for them. */
  onShortcuts?: () => void;
  /** Reports a server-side voice transcription job to the editor's job strip. */
  onVoiceTranscriptionJob?: (
    projectId: string,
    cancel: () => void,
    progress?: {
      stage: 'plan' | 'part' | 'section' | 'chunk';
      label: string;
      done: number;
      total: number;
    },
  ) => void;
  /**
   * The export sheet, mounted here rather than built here.
   *
   * Which formats exist and how one is written is the editor screen's business
   * — it owns the services. What this layout owns is *where* a sheet is
   * mounted: inside the safe area, above everything, so it is not clipped by
   * the scrolling toolbar that opens it.
   */
  exportSheet?: ReactNode;
  /**
   * The row that says a job owns the score — a generation in progress.
   *
   * Mounted between the score and the transport rather than over the
   * notation: the job's notes stream into the score as they are written, and
   * the score is what the reader opened it to watch. What must not happen
   * meanwhile is refused by `scoreReadOnly`, `playDisabled` and the store's
   * edit lock, not by hiding the sheet.
   */
  overlay?: ReactNode;
  /**
   * Drops the score's touch handlers, so a tap neither moves the caret nor
   * opens the menu that edits. For a project a job is writing.
   */
  scoreReadOnly?: boolean;
  /** Keeps the transport's Play off. For a score about to be replaced. */
  playDisabled?: boolean;
  /**
   * Generate Again, for a project whose score came from a generation: shown on
   * the property sheet's Score tab, where the web shows it. Absent otherwise.
   */
  generation?: GenerationChoicesProps;
  /**
   * Where the open project came from — its job, file, recording or source
   * project — shown on the Score tab above Generate Again, as on the web.
   * Absent for a document with no project.
   */
  origin?: ProjectOriginProps;
  /** Opens the snapshot history. Absent for a document with no project. */
  onSnapshots?: () => void;
  /**
   * Asks the server to rewrite part of the score.
   *
   * Passed through to the toolbar rather than the title bar: replacing is
   * something you do *to a selection*, so it belongs beside the other things
   * that act on one.
   */
  onReplace?: (scope: ReplaceScope) => void;
  /** Asks the server for one more track, matched to this score. */
  onGenerateTrack?: () => void;
  /** Generates the bars just inserted by the editor toolbar. */
  onGenerateInsertedBars?: () => void | Promise<void>;
  /** Prints. Absent on a build with no print service to talk to. */
  onPrint?: () => void;
  /** True while the pages are being rendered, which is not instant. */
  printing?: boolean;
  /**
   * Where the score opens scrolled to, and where to report it on the way out —
   * the document list's memory for this tab (see `ScrollingScore`).
   */
  initialScroll?: ScrollOffset | null;
  onLeaveScroll?: (offset: ScrollOffset) => void;
  /**
   * False while the editor is mounted but not on screen — behind the Projects
   * or Settings tab — so the Edit menu neither offers nor runs score actions
   * nobody can see. Defaults to true.
   */
  menuActive?: boolean;
};

// Held, so the safe-area views are handed the same arrays on every render.
// Which of these edges actually gets cleared is the one rule's
// (`useSafeEdges`): these say only what each view is responsible for.
const TOP_EDGE = ['top'] as const;
const SIDE_EDGES = ['left', 'right'] as const;
const LEFT_EDGE = ['left'] as const;
const BOTTOM_ROW_EDGES = ['left', 'right', 'bottom'] as const;
const NO_EDGES = [] as const;

/** The Edit menu's clipboard items, by the score action each one runs. */
const EDIT_MENU_COMMAND: Partial<Record<ScoreContextAction, MenuCommand>> = {
  cut: 'edit.cut',
  copy: 'edit.copy',
  paste: 'edit.paste',
  delete: 'edit.delete',
  selectAll: 'edit.selectAll',
};
const EDIT_MENU_ACTION: Partial<Record<MenuCommand, ScoreContextAction>> =
  Object.fromEntries(
    Object.entries(EDIT_MENU_COMMAND).map(([action, command]) => [
      command,
      action,
    ]),
  );

export function AppLayout({
  document,
  onSave,
  onExport,
  exporting = false,
  onSettings,
  onDocuments,
  onShortcuts,
  onVoiceTranscriptionJob,
  exportSheet,
  overlay,
  scoreReadOnly = false,
  playDisabled = false,
  generation,
  origin,
  onSnapshots,
  onReplace,
  onGenerateTrack,
  onGenerateInsertedBars,
  onPrint,
  printing,
  initialScroll,
  onLeaveScroll,
  menuActive = true,
}: AppLayoutProps) {
  /*
    The **whole editor** inside the safe area, not the row the score sits in.

    This used to measure that row, which is the score and the inspector side by
    side — and its height is the window's *minus* every fixed row above and
    below it, the piano keyboard included. So the number it answered with
    depended on whether the keyboard happened to be expanded (516pt against
    640pt on an 11" iPad, 109 against 234 on an iPhone), and a rule about how
    much room there is would have changed its mind every time somebody opened
    the keyboard. Measured on the frame, the answer is a fact about the device.
  */
  const { size, onLayout } = useContainerSize();
  /*
    How far the navigator's header reaches over the editor, on an iPhone.

    The native stack lays the screen out below the bar's standard height, but
    the bar the editor's header draws is taller than that: a title with its
    save badge and two clusters of glass buttons. Measured on an iPhone 18 Pro
    in landscape, the header was 78pt and the screen began at 54, so the
    editor toolbar's top 24pt sat under the bar. The difference is measured
    rather than assumed, so a bar that fits leaves it at zero.

    **Not on an iPad.** There the native stack insets the screen below the full
    header with no overlap left — measured as zero, fullscreen and in a Stage
    Manager window alike. Running the measurement there bought nothing and cost
    a flash: `rootTop` is read while the screen is still settling below the
    header, so the first frames saw it too small and padded a tall blank band
    between the header and the editing bar that vanished once it settled. iPad
    is `isPad`, not a width, so a narrow window keeps the overlap off too.
  */
  const isPad = (Platform as { isPad?: boolean }).isPad === true;
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const rootRef = useRef<View>(null);
  const [rootTop, setRootTop] = useState<number | null>(null);
  const headerOverlap =
    Platform.OS === 'ios' && !isPad && hasNativeHeader() && rootTop !== null
      ? Math.max(0, Math.ceil(headerHeight - rootTop))
      : 0;
  const insets = useSafeAreaInsets();
  // The navigator's header has already cleared the status bar where it
  // draws one; clearing it again left an empty band under the header.
  const topEdges = useSafeEdgeList(hasNativeHeader() ? NO_EDGES : TOP_EDGE);
  const sideEdges = useSafeEdgeList(SIDE_EDGES);
  const leftEdge = useSafeEdgeList(LEFT_EDGE);
  const bottomEdges = useSafeEdgeList(BOTTOM_ROW_EDGES);
  /*
    A device pref, expanded by default and remembered, as on the web. It was a
    `useState(true)` here: collapsed on every launch and forgotten on every tab,
    so a reader who played from the keyboard reopened it every time.
  */
  const keyboardCollapsed = useDevicePrefs(s => s.keyboardCollapsed);
  /*
    The keyboard's height: half of the room the score and the keyboard share —
    the editor less its fixed bars — up to 160 (`keyboardPanelHeight`). On a
    screen short enough for half to be less, the two are the same height.

    That room is the score's measured height plus the keyboard's as it was
    when the score was measured, so a new keyboard height changes only how
    the room is split, never the room — one layout pass settles it. The
    keyboard's height is what was drawn, kept in a ref for the layout callback
    rather than state, which would render once more for nothing.
  */
  const [sharedHeight, setSharedHeight] = useState<number | null>(null);
  const keyboardHeight =
    sharedHeight === null
      ? KEYBOARD_MAX_HEIGHT
      : keyboardPanelHeight(sharedHeight);
  const drawnKeyboardHeight = useRef(0);
  drawnKeyboardHeight.current = keyboardCollapsed ? 0 : keyboardHeight;
  const onScoreLayout = useCallback((event: LayoutChangeEvent) => {
    const shared =
      event.nativeEvent.layout.height + drawnKeyboardHeight.current;
    setSharedHeight(previous => (previous === shared ? previous : shared));
  }, []);
  /*
    Page by default, matching the web app. Continuous is one wide system, which
    is the right shape for following a single line and the wrong one for reading
    a full score on a phone.
  */
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('page');
  /*
    The Spatial 3D stage, in the notation's place while on. Session state,
    not a device preference, as on the web: a view you step into and out of,
    not a way the app is set up. `SpatialSection` itself switches the
    Unplugged mix on for as long as it is mounted.
  */
  const [spatialActive, setSpatialActive] = useState(false);
  /*
    Open by default only where the music still reads beside it.

    Width alone, and height nowhere in it: a column takes no height, so opening
    one costs the notation nothing but width. An unmeasured 0 answers false,
    which is the same first-render behaviour as before. The frame includes the
    side insets; subtract them to measure the space available to the score.
  */
  const roomForBoth = inspectorOpensByDefault(size.width, insets);
  const [inspectorOpen, setInspectorOpen] = useState<boolean | null>(null);
  const inspectorVisible = inspectorOpen ?? roomForBoth;
  /*
    The trade. On macOS both are drawn; on touch the full gutter is the
    inspector's other half and only one of them is on screen.
  */
  const trackInfo = trackInfoShown(
    useDevicePrefs(s => s.trackInfo),
    inspectorVisible,
  );
  const score = useStore(document.store, s => s.score);
  const sharedSelection = useSyncExternalStore(
    onChange => getMusicSelection().subscribe(onChange),
    () => getMusicSelection().selection,
    () => getMusicSelection().selection,
  );
  /*
    Through `selectActiveTrackId`, never the raw field: the field is empty until
    somebody picks a track, and the selector's rule — the first visible track
    when none is chosen, or when the chosen one is gone — is what makes one track
    always active. Reading the field left a freshly opened score with no active
    track, so every stave drew in the same ink and no note lit during playback.
    The web editor reads the same selector.
  */
  const activeTrackId = useStore(document.store, selectActiveTrackId);
  // Memoized in music_editing, so this is reference-stable between renders
  // that did not change the score or the hidden set.
  const visibleTrackIds = useStore(document.store, selectVisibleTrackIds);
  const zoom = useStore(document.store, s => s.zoom);
  const pitchDisplay = useStore(document.store, s => s.pitchDisplay);
  /*
    music_lib's `bindPlayer`, bound to this document's store: loading each
    score, mirroring the transport into the store, looping the selection and
    reporting failures as toasts — the web adapter's rules, not a copy of them.
  */
  const transport = usePlayerBinding(document.store);
  /*
    A store screenshot (`ScreenshotLinks.tsx`): the Spatial stage on or off
    and the transport playing or stopped, as the scene states. After the
    binding above, whose effect has to run first.
  */
  useScreenshotScene(
    'layout',
    scene => {
      const editor = scene.screen === 'editor' ? scene : null;
      setSpatialActive(editor?.spatial ?? false);
      const playing = document.store.getState().state === 'playing';
      if (editor?.play) {
        if (!playing) void transport.togglePlay();
      } else if (playing) {
        transport.stop();
      }
    },
    document.id,
  );

  /**
   * Lyric entry in progress: the *active track's* notes in tick order, as they
   * were when entry began, and the note at or after the caret to start on — so
   * "start writing words here" means what it looks like. `beginLyricEntry`
   * (music_editing, the web editor's call) decides both, and answers null with
   * nothing to write under or while the transport plays — this layout used to
   * work the notes out itself and would open the bar mid-playback, where the
   * store refused every syllable typed into it.
   */
  const [lyricEntry, setLyricEntry] = useState<{
    notes: NoteEvent[];
    startIndex: number;
  } | null>(null);
  const expectedLyricSelectionRef = useRef<readonly string[] | null>(null);

  const selectedLyricNotes = useMemo(() => {
    if (!score || sharedSelection.eventIds.length === 0) return [];
    const selected = sharedSelection.eventIds
      .map(id => findEvent(score, id))
      .filter(
        (event): event is NoteEvent => event !== null && isNoteEvent(event),
      );
    if (selected.length === 0) return [];
    const tracks = selected.map(note => findTrack(score, note.trackId));
    return tracks.every(
      track =>
        track !== null && isVocalInstrumentValue(String(track.midiProgram)),
    )
      ? selected
      : [];
  }, [score, sharedSelection.eventIds]);

  useEffect(() => {
    if (lyricEntry === null) return;
    const selectedIds = sharedSelection.eventIds;
    const expectedIds = expectedLyricSelectionRef.current;
    const selectionIsExpected =
      expectedIds !== null &&
      expectedIds.length === selectedIds.length &&
      expectedIds.every((id, index) => id === selectedIds[index]);
    if (selectionIsExpected) return;
    if (selectedLyricNotes.length === 0) {
      expectedLyricSelectionRef.current = null;
      setLyricEntry(null);
      return;
    }
    expectedLyricSelectionRef.current = [...selectedIds];
    setLyricEntry({ notes: selectedLyricNotes, startIndex: 0 });
  }, [lyricEntry, selectedLyricNotes, sharedSelection.eventIds]);
  const beginLyricEntry = useCallback(() => {
    const entry = beginLyricEntryAt(document.store);
    if (entry)
      expectedLyricSelectionRef.current = [...sharedSelection.eventIds];
    if (entry)
      setLyricEntry({ notes: entry.notes, startIndex: entry.startIndex });
  }, [document, sharedSelection.eventIds]);

  /*
    The long-press menu. Held here rather than in `ScrollingScore` because the
    actions it offers are the store's, and the score view's job ends at turning
    a touch into a place in the music.
  */
  const [actionsOpen, setActionsOpen] = useState(false);
  const scoreSelection = useScoreSelection(document);
  /*
    The bar a measure-range selection extends from.

    A ref, not state: it is read inside the tap handler and must never cause a
    render — the same reason the web app keeps it in one. The rule for using it
    is `routeScorePress`'s; this only holds it.
  */
  const measureAnchor = useRef<number | null>(null);
  const selection = useStore(document.store, s => s.selection);
  const clipboard = useStore(document.store, s => s.clipboard);
  const isPlaying = useStore(document.store, s => s.state) === 'playing';
  const clipboardPrompts = useClipboardPrompts(document.store);

  /*
    The Edit menu's Cut, Copy, Paste, Delete and Select All, on the score (a
    desktop build). They reach here only when no text field has focus — one
    that has answers them itself — and run exactly what the score's own
    actions menu runs, the cut and paste prompts included. Each is enabled
    exactly when that menu would enable it.
  */
  const scoreActions = useMemo(
    () =>
      scoreContextMenuModel({
        selection,
        clipboard,
        playing: isPlaying,
        score: document.store.getState().score,
      }),
    [selection, clipboard, isPlaying, document],
  );
  useMenuAvailability(
    useMemo(
      () =>
        menuActive
          ? scoreActions.entries
              .filter(entry => entry.enabled && EDIT_MENU_COMMAND[entry.action])
              .map(entry => EDIT_MENU_COMMAND[entry.action] as MenuCommand)
          : [],
      [scoreActions, menuActive],
    ),
  );
  useMenuCommand(
    useCallback(
      (command: MenuCommand) => {
        const action = EDIT_MENU_ACTION[command];
        if (!action || !menuActive) return;
        runScoreContextAction(document.store, action, {
          requestCut: clipboardPrompts.requestCut,
          requestPaste: clipboardPrompts.requestPaste,
        });
      },
      [document, clipboardPrompts, menuActive],
    ),
  );

  /*
    A tap on the score, whatever it landed on. music_editing's `routeScorePress`
    is the web's click handler — the gutter makes a track active, the bar band
    selects a bar, a note selects its chord, a stave aims the caret or, with
    note input on, writes the pressed pitch after taking the display lenses off.
    This used to be five callbacks here, each choosing a store action, and the
    native answers had drifted from the web's.

    Touch has no Shift or Cmd, so both are false; a hardware keyboard's
    modifiers are not reported to a touch on React Native.
  */
  const onScorePress = useCallback(
    (hit: ScoreCanvasHit | null, pointTick: number | null) => {
      const store = document.store;
      measureAnchor.current = routeScorePress(store, hit, {
        shift: false,
        mod: false,
        noteInput: store.getState().noteInput,
        pitchDisplay: store.getState().pitchDisplay,
        anchor: measureAnchor.current,
        pointTick,
      });
    },
    [document],
  );

  /*
    A long press selects what it landed on and opens the menu on that —
    `selectForContextMenu`, the web's right-click. **A press inside the existing
    selection keeps it**, and a press on a bare stave selects nothing and moves
    nothing: this used to aim the caret first, which cleared the very selection
    the menu was then opened to act on.
  */
  const onScoreLongPress = useCallback(
    (hit: ScoreCanvasHit | null) => {
      measureAnchor.current = selectForContextMenu(
        document.store,
        hit,
        measureAnchor.current,
      );
      setActionsOpen(true);
    },
    [document],
  );

  if (!score) return null;
  return (
    /*
      The top inset keeps the title bar below the status bar when present.
      Each section paints to the screen edges while its content clears the
      side cutouts. The bottom remains edge-to-edge.
    */
    <SafeAreaView
      ref={rootRef}
      className="bg-background flex-1"
      edges={topEdges}
      style={headerOverlap > 0 ? { paddingTop: headerOverlap } : undefined}
      onLayout={event => {
        onLayout(event);
        rootRef.current?.measureInWindow((_x, y) => setRootTop(y));
      }}
    >
      {/*
        The title bar is red (`bg-primary`); its clock and battery read in
        light ink. The status bar is app-based, so this entry wins while the
        editor is on screen and reverts to `ThemedStatusBar` on the way out.
        iOS only — Android draws the editor header below an opaque status bar.
      */}
      {Platform.OS === 'ios' ? <RNStatusBar barStyle="light-content" /> : null}
      {/*
        Hidden wherever a menu bar exists to carry its buttons instead —
        `hasMenuBar()` is the honest test, exactly as `menu-commands.ts`
        argues for itself. macOS and Windows both grow one; iOS and Android
        never will, and it is this bar or nothing there. Every button here has
        a menu command by the same name's platform module: Save is `file.save`,
        Undo/Redo are `edit.undo`/`edit.redo`, Export is the five `export.*`
        formats, Print is `file.print`, Snapshots is `file.snapshots`, and
        Projects/Settings are `nav.projects`/`nav.settings` — see
        `MenuFileCommands` and `EditorScreen` for where each lands.

        Hidden on iOS and Android as well, where the same buttons are on the
        navigator's header — the navigation bar and the top app bar — put
        there by `useEditorHeader`. Drawn here they would be there twice.
      */}
      {hasMenuBar() || hasNativeHeader() ? null : (
        <SafeAreaView edges={sideEdges} className="bg-primary">
          <TitleBar
            document={document}
            onSave={onSave}
            onExport={onExport}
            exporting={exporting}
            onSettings={onSettings}
            onDocuments={onDocuments}
            {...(onShortcuts ? { onShortcuts } : {})}
            {...(onSnapshots ? { onSnapshots } : {})}
            {...(onPrint ? { onPrint } : {})}
            {...(printing === undefined ? {} : { printing })}
          />
        </SafeAreaView>
      )}
      {/*
        No tab strip under a tab bar: one project is open at a time there
        (`DocumentList`'s `single`), so there is never a second tab to show.
      */}
      {hasTabBar() ? null : (
        <SafeAreaView edges={sideEdges} className="bg-background">
          <DocumentTabs />
        </SafeAreaView>
      )}
      <SafeAreaView
        edges={sideEdges}
        className="border-border bg-card border-b"
      >
        <EditorToolbar
          document={document}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          onEnterLyrics={beginLyricEntry}
          inspectorVisible={inspectorVisible}
          {...(onGenerateTrack ? { onGenerateTrack } : {})}
          {...(onGenerateInsertedBars ? { onGenerateInsertedBars } : {})}
          {...(onVoiceTranscriptionJob ? { onVoiceTranscriptionJob } : {})}
          onToggleInspector={() => setInspectorOpen(!inspectorVisible)}
        />
      </SafeAreaView>
      {/*
        The right cutout is cleared by whichever element runs up against it:
        the inspector column when it is open, otherwise the score itself —
        which honours it as padding in page mode and as a scroll inset in
        continuous mode (`ScrollingScore.rightInset`). So the row clears both
        sides with the inspector open and only the left without it.
      */}
      <SafeAreaView
        edges={inspectorVisible ? sideEdges : leftEdge}
        className="bg-background min-h-0 flex-1"
      >
        {/*
          Always a row: the inspector is a right-hand column wherever it is
          shown. This was two complete class strings chosen at render, never a
          template with a hole in it, because Tailwind extracts classes by
          scanning source text — worth remembering before writing
          `` `flex-1 ${row ? 'flex-row' : ''}` ``, which yields no `flex-row`
          utility at all and fails silently into a box of zero height.
        */}
        <View className="min-h-0 flex-1 flex-row" onLayout={onScoreLayout}>
          <View className="min-h-0 min-w-0 flex-1">
            {spatialActive ? (
              <SpatialSection store={document.store} />
            ) : (
              <ScrollingScore
                score={score}
                activeTrackId={activeTrackId}
                trackIds={visibleTrackIds}
                selection={scoreSelection}
                zoom={zoom}
                layoutMode={layoutMode}
                pitchDisplay={pitchDisplay}
                trackInfo={trackInfo}
                rightInset={inspectorVisible ? 0 : insets.right}
                {...(scoreReadOnly
                  ? {}
                  : { onPress: onScorePress, onLongPress: onScoreLongPress })}
                {...(initialScroll === undefined ? {} : { initialScroll })}
                {...(onLeaveScroll ? { onLeaveScroll } : {})}
              />
            )}
          </View>
          {inspectorVisible ? (
            /*
              `w-80` is `INSPECTOR_COLUMN_WIDTH`, which is what decides whether
              this opens by default — keep the two in step.
            */
            <View className="border-border w-80 border-l">
              {/*
                Replace goes to the property sheet, not the toolbar: the scope
                is the tab. Replace Notes sits beside the note you selected,
                Replace Measures beside the bars, Replace Track beside the
                part — which is where the web app puts all three.
              */}
              <InspectorPanel
                document={document}
                {...(onReplace ? { onReplace } : {})}
                {...(generation ? { generation } : {})}
                {...(origin ? { origin } : {})}
              />
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={sideEdges} className="bg-card">
        {/*
        Stated heights below the score; only the score absorbs what is left.

        There is no letter-key row: the web app has none, and note entry there
        is the piano keyboard plus typing. A second way to write a C — with its
        own duration picker, duplicating the toolbar's — is a different app
        wearing the same name.
      */}
        {/*
        Above both bars: while writing words, the field is what the software
        keyboard must not cover.
      */}
        {lyricEntry !== null && selectedLyricNotes.length > 0 ? (
          <LyricEntryBar
            store={document.store}
            notes={lyricEntry.notes}
            startIndex={lyricEntry.startIndex}
            onSelectNote={noteId => {
              expectedLyricSelectionRef.current = [noteId];
              document.store.getState().setSelection({
                eventIds: [noteId],
                measureIds: [],
                trackIds: [],
              });
            }}
            onClose={() => setLyricEntry(null)}
          />
        ) : null}

        {/*
        Transport above the keyboard, matching the web app.

        The keyboard is the one panel here that changes height — it collapses,
        and it is optional — so with it in between, opening or closing it moved
        the transport, which is the row a thumb goes to without looking. Fixed
        rows first, the variable one last.
      */}
        {overlay}
      </SafeAreaView>
      <SafeAreaView
        edges={sideEdges}
        className="border-border bg-card border-t"
      >
        <TransportBar
          score={score}
          transport={transport}
          store={document.store}
          playDisabled={playDisabled}
          spatialActive={spatialActive}
          onToggleSpatial={() => setSpatialActive(active => !active)}
          keyboardCollapsed={keyboardCollapsed}
          onToggleKeyboard={() =>
            devicePrefs.getState().setKeyboardCollapsed(!keyboardCollapsed)
          }
        />
      </SafeAreaView>
      <SafeAreaView edges={sideEdges} className="bg-card">
        <KeyboardPanel
          document={document}
          collapsed={keyboardCollapsed}
          height={keyboardHeight}
        />
      </SafeAreaView>
      {/*
        The last row clears the bottom as well, where the rule says to (a
        tablet): Android draws the app under its own navigation bar, and on
        a tablet with the three-button bar the status bar was beneath it.
      */}
      <SafeAreaView
        edges={bottomEdges}
        className="border-border bg-card border-t"
      >
        <StatusBar document={document} />
      </SafeAreaView>
      <ScoreActionsSheet
        open={actionsOpen}
        /*
          music_editing's model — entries, enabled rules and the subject, bars
          counted across tracks — the same one the web's right-click menu draws.
        */
        model={scoreContextMenuModel({
          selection,
          clipboard,
          playing: isPlaying,
          score,
        })}
        /*
          Re-checked against the store as it is now, so an entry chosen after
          the transport started is refused rather than trusted to the flag. Cut
          and paste ask the same insert-or-replace question the shortcuts do.
        */
        onAction={action => {
          runScoreContextAction(document.store, action, {
            requestCut: clipboardPrompts.requestCut,
            requestPaste: clipboardPrompts.requestPaste,
          });
        }}
        onClose={() => setActionsOpen(false)}
      />
      <ClipboardPromptSheets clipboard={clipboardPrompts} />
      {exportSheet}
    </SafeAreaView>
  );
}
