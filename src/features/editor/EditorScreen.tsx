/**
 * One document, on screen.
 *
 * Wiring only: the arrangement lives in `AppLayout`, which mirrors the web
 * app's. What is here is the handful of actions that need the document, the
 * storage and the transport at once.
 */
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  useIsFocused,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import { Spinner } from '@/components/controls/Spinner';
import { AppLayout } from '@/components/layout/AppLayout';
import { createKeyValueStore } from '@/documents/rn-key-value';
import { defaultDocumentUri } from '@/documents/rn-storage';
import { createFilePicker } from '@/documents/file-picker';
import { RecentDocuments } from '@/features/documents/RecentDocuments';
import { ImportButtons } from '@/features/documents/ImportButtons';
import { UnsavedQuitGuard } from '@/features/documents/UnsavedQuitGuard';
import { exportDocument } from '@/documents/export';
import type { ExportFormat } from '@/documents/export';
import { ExportSheet } from '@/features/documents/ExportSheet';
import { useMenuAvailability, useMenuCommand } from '@/app/menu-commands';
import { useEditorHeader } from './useEditorHeader';
import { ProjectsPopup } from './ProjectsPopup';
import { ShortcutsSheet } from '@/features/shortcuts/ShortcutsSheet';
import { goToTab, hasTabBar } from '@/app/tab-bar';
import type { MenuCommand } from '@/app/menu-commands';
import { canPrint, printScore } from '@/features/print/print-service';
import { trackButtonClick, trackEvent, trackScreenView } from '@/analytics';
import { PrintSheet } from '@/features/print/PrintSheet';
import type { PrintPlanOptions } from '@sudobility/music_drawing';
import { ReplaceMusicSheet } from '@/features/generation/ReplaceMusicSheet';
import { GenerateTrackSheet } from '@/features/generation/GenerateTrackSheet';
import { prepareReplacement } from '@sudobility/music_editing';
import type { ReplaceScope } from '@sudobility/music_types';
import { GenerationOverlay } from '@/features/generation/GenerationOverlay';
import { SnapshotsSheet } from '@/features/snapshots/SnapshotsSheet';
import { useScreenshotScene } from '@/features/screenshots/screenshot-scene';
import { useDocumentGeneration } from '@/features/generation/useDocumentGeneration';
import { CreditPaywallSheet } from '@/features/credits/CreditPaywallSheet';
import { useCreditBalance } from '@/features/credits/useCreditBalance';
import { ExportScopeSheet } from '@/features/documents/ExportScopeSheet';
import {
  exportScopeNeedsPrompt,
  hiddenTrackCount,
  selectActiveTrackId,
  selectVisibleTrackIds,
} from '@sudobility/music_editing';
import { renderEvents, renderSamples } from '@sudobility/music_player';
import {
  DOCUMENT_EXTENSION,
  estimateReplacementCredits,
  defaultReplaceSubmission,
  exportFilename as documentFilename,
  isOutOfCredits,
  regenerateWithLocks,
  replacementRegion,
  reportError,
} from '@sudobility/music_lib';
import { getAppServices } from '@/config/initialize';
import { getMusicClient } from '@/config/server';
import { useServerContext } from '@/config/useServerContext';
import { useAuth } from '@/auth/AuthContext';
import { useSiteAdmin } from '@/auth/useSiteAdmin';
import {
  useActiveDocument,
  useDocumentList,
  useDocumentServices,
} from '@/documents/DocumentsContext';
import { openProject } from '@/documents/document';
import type { RootStackParamList } from '@/app/Navigation';
import type { MusicDocument } from '@/documents/document';
import type { ScrollOffset } from '@/features/score/useScoreCanvas';
import type { ExportScope } from '@sudobility/music_types';
import { usePendingAction } from '@/components/controls/usePendingAction';

const keyValue = createKeyValueStore();

export function EditorScreen() {
  useEffect(() => {
    trackScreenView('EditorScreen');
  }, []);

  const { t } = useTranslation();
  const document = useActiveDocument();
  const list = useDocumentList();
  const services = useDocumentServices();
  const route = useRoute<RouteProp<RootStackParamList, 'Editor'>>();
  const projectParam = route.params?.projectId ?? null;
  const [openError, setOpenError] = useState<string | null>(null);

  /*
    Opening a project the dashboard sent us to.

    The document already open is raised rather than a second copy fetched —
    two documents over one project would diverge the moment either was edited,
    and both would claim to be the project. The store is music_lib's
    `openProjectDocument`, built clean from the record as read, with its server
    version, its last generation and its view prefs.
  */
  useEffect(() => {
    if (!projectParam) return;
    if (!getMusicClient()) return;
    const origin = { kind: 'project' as const, projectId: projectParam };
    const existing = list.findOpen(origin);
    if (existing) {
      list.activate(existing.id);
      return;
    }
    let cancelled = false;
    void openProject(services, projectParam)
      .then(opened => {
        if (cancelled) opened.store.getState().dispose();
        else list.open(opened);
      })
      .catch(error => {
        if (!cancelled) {
          setOpenError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectParam, list, services]);

  if (openError) return <EmptyState message={openError} />;
  /*
    Navigated here to open a project the list does not hold yet. The editor is
    not drawn until its store holds the project the route asked for — shown
    INSTEAD of the editor, not over it, so a previous tab's score and title
    never leak out from under a spinner while the fetch runs. The create, blank
    and template paths navigate with no `projectId` and have the document ready,
    so they never reach this. Matches the web's `ProjectLoading`.
  */
  if (
    projectParam !== null &&
    getMusicClient() !== null &&
    projectIdOf(document) !== projectParam
  ) {
    return (
      <View
        className="bg-background flex-1 items-center justify-center gap-4 p-4"
        accessibilityRole="progressbar"
        accessibilityLabel={t('overlay.openingProject')}
      >
        <Spinner />
        <Text className="text-muted-foreground">
          {t('overlay.openingProject')}
        </Text>
      </View>
    );
  }
  if (!document) {
    return (
      <View className="bg-background flex-1 items-center justify-center gap-4 p-4">
        <Text className="text-muted-foreground">{t('editor.noScore')}</Text>
        {/*
          Import lives in the empty state and on the dashboard, never on the
          editor's own toolbar: every import makes a *new* document, so an
          Import control inside a score could only throw you out of the score
          you had open.
        */}
        <ImportButtons />
        {/* The way back to something you were working on. */}
        <RecentDocuments keyValue={keyValue} />
      </View>
    );
  }
  // A fresh component per document, so the store a hook reads is never the
  // previous document's.
  return <DocumentEditor key={document.id} document={document} />;
}

function DocumentEditor({ document }: { document: MusicDocument }) {
  const { t } = useTranslation();
  const [voiceJob, setVoiceJob] = useState<{
    cancel: () => void;
    progress: {
      stage: 'plan' | 'part' | 'section' | 'chunk';
      label: string;
      done: number;
      total: number;
    } | null;
  } | null>(null);
  /*
    This tab's scroll memory. The component is fresh per document, so the score
    view would otherwise open at the top whatever caret the list restored: it
    reopens where the tab was left, or at the caret for a tab never scrolled.
  */
  const list = useDocumentList();
  const initialScroll = list.scrollOffset(document.id);
  const onLeaveScroll = useCallback(
    (offset: ScrollOffset) => list.bankScroll(document.id, offset),
    [list, document],
  );
  const { user, getToken } = useAuth();
  const siteAdmin = useSiteAdmin();
  const serverContext = useServerContext();
  const score = useStore(document.store, s => s.score);
  const origin = useStore(document.store, s => s.origin);
  const lastGeneration = useStore(document.store, s => s.lastGeneration);
  const projectOrigin = useStore(document.store, s => s.projectOrigin);

  /**
   * The Save button: write what is pending, to wherever the document lives.
   *
   * Through the store — `saveNow` for a file or a project, which is a no-op when
   * nothing is dirty, and the one save state the title bar reads. A document
   * that has never been written has nowhere to go, so it is asked about: a save
   * panel where the platform has one (macOS), and the app's documents folder
   * under the score's title where it does not (iOS and Android, which have no
   * save panel to raise). A failure is reported by the store's own toast.
   */
  /*
    One save at a time: a second press while the first is choosing a place or
    writing is refused (the button spins on the store's `saveState` meanwhile).
  */
  const saving = usePendingAction();
  const runSave = saving.run;
  const onSave = useCallback(() => {
    void runSave(async () => {
      trackButtonClick('save');
      const state = document.store.getState();
      if (state.origin.kind !== 'unsaved') {
        await state.saveNow();
        return;
      }
      const picker = createFilePicker();
      const suggested = documentFilename(state.title, DOCUMENT_EXTENSION);
      const chosen = picker.isSupported()
        ? await picker.pickSaveLocation(suggested)
        : null;
      await state.saveAs(chosen ?? (await defaultDocumentUri(state.title)));
    }).catch(error => reportError(error, { context: 'save' }));
  }, [document, runSave]);

  const [exportOpen, setExportOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  /*
    Which Replace is being asked for, or null when none is. One sheet serves all
    three scopes — they differ only in the region they overwrite, and
    `prepareReplacement` is what works that out.
  */
  const [replaceScope, setReplaceScope] = useState<ReplaceScope | null>(null);
  const [generateTrackOpen, setGenerateTrackOpen] = useState(false);
  const selection = useStore(document.store, s => s.selection);
  const hasSelection =
    selection.eventIds.length > 0 || selection.measureIds.length > 0;
  const activeTrackId = useStore(document.store, selectActiveTrackId);
  // What the open Replace will bill: the bars its region touches, per track.
  const replaceRegion =
    score && replaceScope
      ? replacementRegion(score, selection, activeTrackId, replaceScope)
      : null;
  const replaceCredits =
    score && replaceRegion
      ? estimateReplacementCredits(score, replaceRegion)
      : 0;

  /*
    A document only has a project to generate into when it came from one. A
    local file has no row on the server, so there is nothing for a job to write
    back to — offering Generate there would be offering something that cannot
    work.
  */
  const projectId = origin.kind === 'project' ? origin.projectId : null;

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const generation = useDocumentGeneration(document, projectId, {
    // A 402 is not a network failure and must not read like one: it is the one
    // refusal with an obvious remedy, so it opens the store.
    onInsufficientCredits: () => setPaywallOpen(true),
    // The job reads the *stored* score, so anything still unwritten has to go
    // first — otherwise it is invisible to the job and then overwritten by its
    // result.
    flush: () => document.store.getState().saveNow(),
    /*
      The live stream delivered the final score — the one `GET /projects/:id`
      would return — so it is adopted from the message rather than fetched
      again, stopping the player first for the reason `onApplied` gives. The
      store refuses it for a project that is no longer this document's.
    */
    onComplete: async final => {
      if (!projectId) return;
      document.store
        .getState()
        .adoptLiveResult(final.score, getAppServices().player, {
          projectId,
          serverUpdatedAt: final.updatedAt,
          ...(final.lastGeneration
            ? { lastGeneration: final.lastGeneration }
            : {}),
          // So a blank project reads as generated the moment its score
          // lands, as the row now says, without fetching the project again.
          job: final.job ? { id: final.job.id, kind: final.job.kind } : null,
        });
    },
    onApplied: async () => {
      /*
        Stop first, then adopt — the invariant the web app keeps too.

        A score arriving from outside does not go through `dispatchCommand`,
        so the edit lock never sees it and the player would treat the swap as
        a mix change and go on playing the old score out of its queue.
        Stopping is also what puts the playhead back to the beginning:
        loading a score deliberately *keeps* the playhead where it is, since
        an edit reloads the player on every note written and resetting there
        sent the caret back to bar 1 each time somebody wrote a note. `stop()`
        is what distinguishes "the same piece, edited" from "a different
        piece". `reloadFromServer` stops the transport it is handed before it
        adopts, resets the history and leaves the document clean.
      */
      await document.store.getState().reloadFromServer(getAppServices().player);
    },
  });

  /*
    The edit lock, for as long as a job owns the project. The read-only score
    and the disabled Play are what the reader sees; this is what holds: every
    edit goes through `dispatchCommand`, and with the lock held it refuses
    content commands from any path — the keyboard, the inspector, a menu — so
    nothing can dirty a score the server is in the middle of replacing.
  */
  const generating = generation.generating;

  /*
    A transcription that ended badly says so after the strip has gone. The
    strip is what shows `generation.error`, and it goes the moment the
    project is ready again — for a failure, the same moment. A generation's
    failure reaches a toast through the hook, by way of its job; a
    transcription has no job, and the reader is now in front of the project
    when it fails rather than learning of it from a row in a list.
  */
  const lastStatusRef = useRef(generation.status);
  useEffect(() => {
    const previous = lastStatusRef.current;
    lastStatusRef.current = generation.status;
    if (
      previous === 'transcribing' &&
      generation.status === 'ready' &&
      generation.error
    ) {
      document.store
        .getState()
        .pushToast({ message: generation.error, severity: 'error' });
    }
  }, [document, generation.status, generation.error]);

  useEffect(() => {
    document.store.getState().setEditLocked(generating);
    return () => document.store.getState().setEditLocked(false);
  }, [document, generating]);

  /*
    Starting a job is a wait — the pending edit is written, then the job is
    posted — before the overlay can say anything. The control that asked spins
    through it (its sheet kept up), and no second job is started meanwhile.
  */
  const starting = usePendingAction<'again' | 'track' | 'replace' | 'bars'>();
  const startGeneration = starting.run;
  const generateInsertedBars = useCallback(async () => {
    if (!projectId) return;
    const prepared = prepareReplacement(document.store, 'measures', {
      ...defaultReplaceSubmission(),
      instruction: t('editor.generateInsertedBarsInstruction'),
    });
    if (prepared) {
      await startGeneration(
        () => generation.start(prepared.kind, prepared.request),
        'bars',
      );
    }
  }, [document, generation, projectId, t, startGeneration]);

  /**
   * Writes the chosen format.
   *
   * Audio takes a renderer because it is the one format this app makes rather
   * than encodes: `renderEvents` decides what sounds (mute, solo, timing, level
   * and pan) and `renderSamples` drives the same soundfont playback uses, so
   * the file is a recording of what was heard. music_io then encodes the PCM —
   * which is what keeps the two platform packages independent of each other.
   */
  const exporting = usePendingAction();
  const runExportWork = exporting.run;
  const writeExport = useCallback(
    (format: ExportFormat, scope: ExportScope = 'all') => {
      void runExportWork(async () => {
        trackButtonClick('export', { format, scope });
        await exportDocument(
          document,
          getAppServices().io,
          format,
          async score => {
            const plan = renderEvents(score);
            const audio = await renderSamples(getAppServices().soundfont)(plan);
            return { samples: audio.samples, sampleRate: audio.sampleRate };
          },
          scope,
        );
        trackEvent('export_complete', { format, scope });
      }).catch(error => reportError(error, { context: 'export' }));
    },
    [document, runExportWork],
  );

  /**
   * The format waiting on an answer about hidden tracks.
   *
   * Asked exactly when the two answers differ: a file that quietly omits parts
   * is hard to notice until it matters, and silently exporting everything would
   * equally surprise somebody who hid tracks precisely to extract a subset.
   */
  const [pendingScope, setPendingScope] = useState<ExportFormat | null>(null);

  /*
    A courtesy gate on Generate Again, decided here because this screen has the
    auth context and the panel must not import it. The rule is music_lib's
    `isOutOfCredits`, the one the New Project gate uses too.

    A **site administrator is never gated**: `music_api` grants them free
    generation — no quota, no balance check, no charge — so they sit at a
    balance of zero forever, and this would refuse work the server would have
    accepted. Unknown is not zero either: a balance still loading is not an
    empty wallet. A job refused anyway (the balance ran out in another tab)
    still reaches the paywall through the 402.
  */
  const { balance } = useCreditBalance(getToken, user !== null);
  const outOfCredits = isOutOfCredits(balance, siteAdmin);

  const runExport = useCallback(
    (format: ExportFormat) => {
      if (exportScopeNeedsPrompt(document.store)) setPendingScope(format);
      else writeExport(format);
    },
    [document, writeExport],
  );

  const onExport = useCallback(() => setExportOpen(true), []);

  /**
   * Prints, if this build has a print service.
   *
   * Rendering the pages is synchronous and takes a moment on a long score, so
   * the flag goes up first — otherwise the app looks frozen between the tap
   * and the print dialog appearing. Declared ahead of the menu-command
   * listener below, which calls it for `file.print`.
   */
  const [printing, setPrinting] = useState(false);
  /*
    The title bar opens the print sheet — what to print, the paper, the
    orientation, as the web print view asks — and the sheet's answer prints.
  */
  const [printOpen, setPrintOpen] = useState(false);
  const visibleTrackIds = useStore(document.store, selectVisibleTrackIds);
  const onPrint = useCallback(() => setPrintOpen(true), []);
  /*
    Print keeps the sheet up, spinning, while the pages are drawn, and closes
    it only once they are — then asks for the dialog. Closing first used to
    race: drawing a long score held the JS thread for seconds, so the close
    reached UIKit late, after the native module had given up waiting and
    presented the print dialog over the still-open sheet; the sheet then left
    and took the dialog with it, leaving a blank screen.
  */
  const printInFlight = useRef(false);
  const printCancelled = useRef(false);
  const runPrint = useCallback(
    (options: PrintPlanOptions) => {
      if (printInFlight.current) return;
      printInFlight.current = true;
      printCancelled.current = false;
      setPrinting(true);
      trackButtonClick('print');
      void printScore(score!, options, {
        isCancelled: () => printCancelled.current,
        beforeDialog: () => {
          setPrintOpen(false);
          // Let React commit the close; the native side then waits for the
          // sheet to finish leaving before it presents.
          return new Promise<void>(resolve => setTimeout(resolve, 50));
        },
      })
        .catch(error => reportError(error, { context: 'print' }))
        .finally(() => {
          printInFlight.current = false;
          setPrinting(false);
        });
    },
    [score],
  );
  const closePrint = useCallback(() => {
    // Closing while the pages are drawn abandons the print.
    printCancelled.current = true;
    setPrintOpen(false);
  }, []);

  /*
    The File menu's Export items run the export directly rather than opening
    the sheet: the menu item already names the format, and making the reader
    choose it a second time would be asking a question they have answered.
    Import is handled above the navigator instead — it makes a new document
    and so belongs to no screen.
  */
  const MENU_EXPORT: Partial<Record<MenuCommand, ExportFormat>> = useMemo(
    () => ({
      'export.midi': 'midi',
      'export.musicxml': 'musicxml',
      'export.xm': 'xm',
      'export.wav': 'wav',
      'export.mp3': 'mp3',
    }),
    [],
  );
  /*
    What the handler below can do right now, for the menu to enable: the same
    guards it applies, read reactively. With the editor unmounted (Settings,
    the Projects tab) none of these is declared and the menu greys them out,
    where it used to offer items that fired into nothing.
  */
  const canUndo = useStore(document.store, s => s.canUndo);
  const canRedo = useStore(document.store, s => s.canRedo);
  const playing = useStore(document.store, s => s.state === 'playing');
  /*
    The editor stays mounted under the Projects and Settings tabs, so being
    mounted is not being on screen: its commands are offered only while it
    is the focused screen, and the handler below ignores them otherwise.
  */
  const focused = useIsFocused();
  const editorCommands = useMemo(() => {
    const commands: MenuCommand[] = [];
    if (!focused) return commands;
    if (score) commands.push(...(Object.keys(MENU_EXPORT) as MenuCommand[]));
    if (score && canPrint()) commands.push('file.print');
    if (projectId) commands.push('file.snapshots');
    if (canUndo && !playing) commands.push('edit.undo');
    if (canRedo && !playing) commands.push('edit.redo');
    return commands;
  }, [MENU_EXPORT, score, projectId, canUndo, canRedo, playing, focused]);
  useMenuAvailability(editorCommands);

  useMenuCommand(
    useCallback(
      (command: MenuCommand) => {
        if (!focused) return;
        const format = MENU_EXPORT[command];
        if (format) {
          runExport(format);
          return;
        }
        // Undo/Redo, Print and Snapshots: the title bar's own buttons, and
        // this is where they land now that a desktop build has no title bar
        // to press (`AppLayout`'s `hasMenuBar()` gate). Guarded exactly as
        // the buttons were — `canUndo`/`canRedo`/`playing` off the store,
        // `canPrint()` for a build with no print service, `projectId` for a
        // local file with no snapshot history — so a command that arrives for
        // an unavailable action does nothing rather than something wrong.
        const state = document.store.getState();
        if (command === 'edit.undo') {
          if (state.canUndo && state.state !== 'playing') state.undo();
        } else if (command === 'edit.redo') {
          if (state.canRedo && state.state !== 'playing') state.redo();
        } else if (command === 'file.print') {
          if (canPrint()) onPrint();
        } else if (command === 'file.snapshots') {
          if (projectId) setSnapshotsOpen(true);
        }
      },
      [MENU_EXPORT, runExport, document, onPrint, projectId, focused],
    ),
  );

  /*
    Settings holds the theme, the language, the account, Credits, Shortcuts
    and About. On iOS and Android it is a tab, behind the editor; on a
    desktop build the title bar is gone (`hasMenuBar()`) and `nav.settings`
    — the App menu's Preferences… on macOS, wired in `AppDelegate.mm` — is
    the way there.
  */
  const onSettings = useCallback(
    () => goToTab(navigation, 'Settings'),
    [navigation],
  );
  /*
    And the projects list: New Project, every import and the server
    project list. Same split — this is iOS/Android's route, and a
    desktop build reaches it through `nav.projects` in the File menu
    instead, handled in `MenuFileCommands` rather than here because it
    must work with no document open at all.
  */
  const onDocuments = useCallback(
    () => goToTab(navigation, 'Dashboard'),
    [navigation],
  );
  /*
    The Projects sidebar, drawn over the score: what a split view offers once
    its detail has the whole screen. Only under a tab bar — a desktop build
    has its Projects window, and the editor there was never pushed from one.
  */
  const [masterOpen, setMasterOpen] = useState(false);
  const onMaster = useCallback(() => setMasterOpen(open => !open), []);
  const onSnapshots = useCallback(() => setSnapshotsOpen(true), []);
  /*
    The keyboard shortcuts, over the score they work in. They were a section
    of Settings and a pushed screen, and either took the reader out of the
    project to read about the keys that work in the project.
  */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const onShortcuts = useCallback(() => setShortcutsOpen(true), []);

  /*
    A store screenshot (`ScreenshotLinks.tsx`): every sheet closed, the
    track it names selected (or nothing), and the one sheet it asks for
    open, so a shot does not depend on the one taken before it.

    Create Snapshot is the snapshot history opened on its create form, so
    it needs a project: the demo is one when the debug build is signed in
    (`DevAutoSignIn`), and the shot is the bare editor when it is not.
  */
  const [printScope, setPrintScope] = useState<string | undefined>();
  const [snapshotsCreate, setSnapshotsCreate] = useState(false);
  useScreenshotScene(
    'editor',
    scene => {
      setExportOpen(false);
      setReplaceScope(null);
      setPendingScope(null);
      setPaywallOpen(false);
      setShortcutsOpen(false);
      setMasterOpen(false);
      const editor = scene.screen === 'editor' ? scene : null;
      const state = document.store.getState();
      const track = editor?.track
        ? state.score?.tracks[editor.track - 1]
        : undefined;
      if (track) {
        state.setActiveTrack(track.id);
        state.selectTrack(track.id);
      } else {
        state.clearSelection();
      }
      setPrintScope(track?.id);
      setPrintOpen(editor?.sheet === 'print');
      setGenerateTrackOpen(editor?.sheet === 'generate-track');
      const createSnapshot =
        editor?.sheet === 'create-snapshot' && projectId !== null;
      setSnapshotsCreate(createSnapshot);
      setSnapshotsOpen(createSnapshot);
    },
    document.id,
  );

  /*
    On iOS and Android the title bar is the navigator's header — the
    navigation bar and the top app bar — so it is handed over here, and
    `AppLayout` draws none of its own there.
  */
  useEditorHeader(
    navigation,
    {
      document,
      onSave,
      onExport,
      exporting: exporting.pending,
      onSettings,
      onDocuments,
      onShortcuts,
      ...(projectId ? { onSnapshots } : {}),
      ...(canPrint() ? { onPrint, printing } : {}),
    },
    hasTabBar() ? onMaster : undefined,
  );

  if (!score) return <EmptyState message={t('editor.noScore')} />;
  return (
    <AppLayout
      document={document}
      initialScroll={initialScroll}
      onLeaveScroll={onLeaveScroll}
      menuActive={focused}
      onSave={onSave}
      onExport={onExport}
      exporting={exporting.pending}
      onSettings={onSettings}
      onDocuments={onDocuments}
      onShortcuts={onShortcuts}
      onVoiceTranscriptionJob={(projectId, cancel, progress) =>
        setVoiceJob(projectId ? { cancel, progress: progress ?? null } : null)
      }
      {...(canPrint() ? { onPrint, printing } : {})}
      {...(projectId
        ? {
            origin: {
              origin: projectOrigin,
              projectId,
              context: serverContext,
            },
          }
        : {})}
      {...(projectId && lastGeneration
        ? {
            generation: {
              record: lastGeneration,
              // Nothing starts while a job owns the project, and a spent
              // balance gates it like every other generation here.
              generating: generation.generating || outOfCredits,
              // The same request, with only the locked choices kept and the
              // rest rolled again by the server.
              onGenerateAgain: async lockedKeys => {
                await startGeneration(
                  () =>
                    generation.start(
                      'generate-score',
                      regenerateWithLocks(lastGeneration, lockedKeys),
                    ),
                  'again',
                );
              },
            },
          }
        : {})}
      onSnapshots={projectId ? onSnapshots : undefined}
      onReplace={projectId ? setReplaceScope : undefined}
      onGenerateTrack={projectId ? () => setGenerateTrackOpen(true) : undefined}
      onGenerateInsertedBars={projectId ? generateInsertedBars : undefined}
      // Read-only while a job writes the score: its notes arrive live and
      // are worth watching, but not touching; and nothing plays music that
      // is about to be replaced.
      scoreReadOnly={generating}
      playDisabled={generating}
      overlay={
        generating ? (
          <GenerationOverlay
            visible
            status={generation.status}
            error={generation.error}
            progress={generation.progress}
            live={generation.live}
            onCancel={() => void generation.cancel()}
          />
        ) : voiceJob ? (
          <GenerationOverlay
            visible
            status="transcribing"
            error={null}
            progress={voiceJob.progress}
            onCancel={voiceJob.cancel}
          />
        ) : null
      }
      exportSheet={
        <>
          <PrintSheet
            open={printOpen}
            score={score}
            visibleTrackIds={visibleTrackIds}
            onClose={closePrint}
            onPrint={runPrint}
            printing={printing}
            initialScope={printScope}
          />
          <GenerateTrackSheet
            open={generateTrackOpen}
            score={score}
            onClose={() => setGenerateTrackOpen(false)}
            submitting={starting.pendingKey === 'track'}
            onSubmit={request => {
              // The same runner every other generation uses, so adding a track
              // behaves like the rest: the overlay appears, the project locks
              // server-side, and leaving the screen is safe. The sheet stays
              // up, Generate spinning, until the job has been posted.
              void startGeneration(async () => {
                try {
                  await generation.start('generate-track', request);
                } finally {
                  setGenerateTrackOpen(false);
                }
              }, 'track');
            }}
          />
          <ExportScopeSheet
            open={pendingScope !== null}
            hiddenCount={hiddenTrackCount(document.store)}
            onCancel={() => setPendingScope(null)}
            onChoose={scope => {
              const format = pendingScope;
              setPendingScope(null);
              if (!format) return;
              writeExport(format, scope);
            }}
          />
          <CreditPaywallSheet
            open={paywallOpen}
            onClose={() => setPaywallOpen(false)}
            onOpenCredits={() => navigation.navigate('Credits')}
          />
          <ReplaceMusicSheet
            open={replaceScope !== null}
            scope={replaceScope ?? 'notes'}
            canSubmit={hasSelection}
            estimatedCredits={replaceCredits}
            onClose={() => setReplaceScope(null)}
            submitting={starting.pendingKey === 'replace'}
            onSubmit={submission => {
              const scope = replaceScope;
              if (!scope) return;
              /*
                `prepareReplacement` turns the settings into the request the
                server needs, and answers null when there is nothing to
                replace — which is the same test the button's `canSubmit`
                uses, checked again here because the selection can change
                while the sheet is open.
              */
              const prepared = prepareReplacement(
                document.store,
                scope,
                submission,
              );
              // The sheet stays up, Replace spinning, until the job has been
              // posted; then it closes either way.
              void startGeneration(async () => {
                try {
                  if (prepared) {
                    await generation.start(prepared.kind, prepared.request);
                  }
                } finally {
                  setReplaceScope(null);
                }
              }, 'replace');
            }}
          />
          <ShortcutsSheet
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
          <SnapshotsSheet
            open={snapshotsOpen}
            document={document}
            startCreating={snapshotsCreate}
            onClose={() => {
              setSnapshotsOpen(false);
              setSnapshotsCreate(false);
            }}
          />
          <ExportSheet
            open={exportOpen}
            document={document}
            onClose={() => setExportOpen(false)}
            onExport={runExport}
          />
          {/*
            Android's Back button, guarded. Mounted here because this is where
            `AppLayout` puts anything modal — inside the safe area, above the
            toolbars that would otherwise clip it — and it renders nothing at
            all until Back is pressed with work unwritten.

            Only where the editor is the stack's first route, so that Back is
            a quit. Under a tab bar Back leaves the editor for the tabs, the
            documents stay open behind it, and the guard sits on the tabs
            instead (`MainTabs`), which is where Back finishes the activity.
          */}
          {hasTabBar() ? null : <UnsavedQuitGuard />}
          <ProjectsPopup
            open={masterOpen}
            onClose={() => setMasterOpen(false)}
            onSelect={pane =>
              goToTab(navigation, 'Dashboard', { pane, at: Date.now() })
            }
          />
        </>
      }
    />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <Text className="text-muted-foreground">{message}</Text>
    </View>
  );
}

/** The project a document was read from, or null for a file or a scratch score. */
function projectIdOf(document: MusicDocument | null): string | null {
  if (!document) return null;
  const { origin } = document.store.getState();
  return origin.kind === 'project' ? origin.projectId : null;
}
