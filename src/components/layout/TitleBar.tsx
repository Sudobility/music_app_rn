/**
 * The title bar, mirroring the web app's.
 *
 * Same shape and same order as `music_app`'s header: the document's name, the
 * save state, then the actions that operate on the *document* — save, undo,
 * redo, export — and, pushed to the right, the ones that operate on the *app*.
 * A reader who knows one should not have to relearn the other.
 *
 * Built from `@sudobility/components-rn` and heroicons rather than hand-rolled
 * `Pressable`s, so the two apps inherit the same design tokens: a change to
 * the palette in `@sudobility/design` moves both.
 */
import { useCallback } from 'react';
import { View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  Cog6ToothIcon,
  DocumentArrowDownIcon,
  ClockIcon,
  MusicalNoteIcon,
  PrinterIcon,
  QuestionMarkCircleIcon,
  RectangleStackIcon,
} from 'react-native-heroicons/outline';
import type { SaveState as DocumentSaveState } from '@sudobility/music_lib';
import { IconButton } from './IconButton';
import { OverflowMenu } from '@/components/controls/OverflowMenu';
import type { OverflowAction } from '@/components/controls/OverflowMenu';
import { useNotationInk } from '@/components/icons/notation-ink';
import type { MusicDocument } from '@/documents/document';

/** Matches the web app's `ICON_GLYPH_CLASS` sizing. */
const ICON_SIZE = 18;

export type TitleBarProps = {
  document: MusicDocument;
  onSave: () => void;
  onExport: () => void;
  /** An export is being written: the Export button spins and refuses. */
  exporting?: boolean;
  /**
   * Opens Settings — required, not optional, because it is the only way there.
   *
   * Theme, language, sign-in and the links to Docs, Shortcuts, Resources,
   * About and Credits all live on that screen, and nothing in the app
   * navigated to it: it was in the stack and unreachable. On the Mac the
   * AppKit "Settings…" item (⌘,) is the template item the project was
   * generated with, whose menu entry names no action at all, so it is disabled
   * and cannot carry this without a native change.
   */
  onSettings: () => void;
  /**
   * Opens the projects list.
   *
   * Required, like `onSettings`, and for the same reason: nothing else in the
   * app navigated to that screen. It was in the stack and unreachable — and
   * with it every way *in* to a document that is not the scratch one the app
   * opens at launch: New Project, Import (MIDI, MusicXML, module, audio) and
   * the list of server projects. The Mac reaches those through the File menu,
   * which iOS and Android do not have.
   */
  onDocuments: () => void;
  /**
   * Shows the keyboard shortcuts, over the score — the web title bar's "?".
   * Optional, so a holder with no sheet to show offers no button for one.
   */
  onShortcuts?: () => void;
  /** Absent for a document with no project: a file has no versions on a server. */
  onSnapshots?: () => void;
  /** Prints. Absent on a build with no print service to talk to. */
  onPrint?: () => void;
  printing?: boolean;
};

export function TitleBar({
  document,
  onSave,
  onExport,
  exporting = false,
  onSettings,
  onDocuments,
  onShortcuts,
  onSnapshots,
  onPrint,
  printing = false,
}: TitleBarProps) {
  return (
    <View className="bg-primary flex-row items-center gap-1 px-2 py-1.5">
      <TitleBarTitle document={document} />
      <TitleBarDocumentActions
        document={document}
        onSave={onSave}
        onExport={onExport}
        exporting={exporting}
        {...(onSnapshots ? { onSnapshots } : {})}
        {...(onPrint ? { onPrint } : {})}
        printing={printing}
      />

      {/* Pushes what follows to the right, exactly as the web's `flex-1` div does. */}
      <View className="flex-1" />

      <TitleBarAppActions
        onSettings={onSettings}
        onDocuments={onDocuments}
        {...(onShortcuts ? { onShortcuts } : {})}
      />
    </View>
  );
}

/*
  The bar in three pieces, because it is drawn in two places. Where there is
  neither a menu bar nor a native header it is the row above; on iOS and
  Android the same pieces are handed to the navigator instead
  (`useEditorHeader`), which puts them on the navigation bar and the top app
  bar. One set of controls either way, so the two cannot drift.
*/

/**
 * The document's name and its save state.
 *
 * `tint` is the colour the glyph and the words are drawn in. The native editor
 * header is a default (light) bar, so its content is `foreground`; the shared
 * `bg-primary` bar leaves it unset and gets the inverse `onPrimary`.
 */
export function TitleBarTitle({
  document,
  tint,
}: {
  document: MusicDocument;
  tint?: string;
}) {
  /*
    The name and the save state are the store's. They used to be fields on a
    record beside it — read once per render, so the bar showed "Saved" until
    something else happened to re-render it — plus a `saving` flag the editor
    screen kept for the manual save alone, blind to the autosave.
  */
  const title = useStore(document.store, s => s.title);
  const saveState = useStore(document.store, s => s.saveState);
  const ink = useNotationInk();
  const color = tint ?? ink.onPrimary;
  return (
    <View className="shrink flex-row items-center gap-1">
      <MusicalNoteIcon size={ICON_SIZE} color={color} />
      <Text
        className={
          tint
            ? 'text-foreground shrink px-1 text-lg font-medium'
            : 'text-primary-foreground shrink px-1 text-lg font-medium'
        }
        numberOfLines={1}
      >
        {title}
      </Text>
      <SaveState state={saveState} tint={tint} />
    </View>
  );
}

export type TitleBarDocumentActionsProps = Pick<
  TitleBarProps,
  | 'document'
  | 'onSave'
  | 'onExport'
  | 'exporting'
  | 'onSnapshots'
  | 'onPrint'
  | 'printing'
>;

/** What operates on the *document*: save, undo, redo, export, print, snapshots. */
export function TitleBarDocumentActions({
  document,
  onSave,
  onExport,
  exporting = false,
  onSnapshots,
  onPrint,
  printing = false,
  tint,
}: TitleBarDocumentActionsProps & { tint?: string }) {
  const { t } = useTranslation();
  const saveState = useStore(document.store, s => s.saveState);
  const canUndo = useStore(document.store, s => s.canUndo);
  const canRedo = useStore(document.store, s => s.canRedo);
  const playing = useStore(document.store, s => s.state) === 'playing';
  const ink = useNotationInk();
  const color = tint ?? ink.onPrimary;

  const undo = useCallback(() => document.store.getState().undo(), [document]);
  const redo = useCallback(() => document.store.getState().redo(), [document]);

  return (
    <View className="flex-row items-center gap-1">
      {/* Any write in flight — this button's or the autosave's — is the wait
          this button would start, so it spins for both. */}
      <IconButton
        label={t('editor.saveNow')}
        onPress={onSave}
        loading={saveState === 'saving'}
        spinnerColor={color}
      >
        <ArrowDownTrayIcon size={ICON_SIZE} color={color} />
      </IconButton>
      <IconButton
        label={t('editor.undo')}
        onPress={undo}
        disabled={!canUndo || playing}
      >
        <ArrowUturnLeftIcon size={ICON_SIZE} color={color} />
      </IconButton>
      <IconButton
        label={t('editor.redo')}
        onPress={redo}
        disabled={!canRedo || playing}
      >
        <ArrowUturnRightIcon size={ICON_SIZE} color={color} />
      </IconButton>
      {/* The export sheet closes before the file is written — what follows
          it is the share sheet or the hidden-tracks question, neither of
          which can be raised over a sheet still dismissing — so the wait is
          shown here, on the control that started it. */}
      <IconButton
        label={t('editor.export')}
        onPress={onExport}
        loading={exporting}
        spinnerColor={color}
      >
        <DocumentArrowDownIcon size={ICON_SIZE} color={color} />
      </IconButton>
      {/*
        There is no Generate here. A whole new score is where a project starts
        (New Project); what an open project offers is Generate Again, on the
        property sheet's Score tab — the web app's arrangement.
      */}
      {onPrint ? (
        <IconButton
          label={t('editor.print')}
          onPress={onPrint}
          disabled={printing}
        >
          <PrinterIcon size={ICON_SIZE} color={color} />
        </IconButton>
      ) : null}
      {onSnapshots ? (
        <IconButton label={t('snapshot.openTitle')} onPress={onSnapshots}>
          <ClockIcon size={ICON_SIZE} color={color} />
        </IconButton>
      ) : null}
    </View>
  );
}

export type TitleBarAppActionsProps = Pick<
  TitleBarProps,
  'onSettings' | 'onDocuments' | 'onShortcuts'
>;

/**
 * The app's own actions, on the right, where the web header puts them.
 *
 * Both of them are the *only* route to their screen: each was in the
 * navigator with nothing in the app pointing at it.
 *
 * Projects first, then Settings, matching what each is — one opens a
 * document, the other configures the app. Behind Projects sit New Project
 * and every import, which the Mac reaches from the File menu and a phone
 * has no equivalent of.
 */
export function TitleBarAppActions({
  onSettings,
  onDocuments,
  onShortcuts,
  tint,
}: TitleBarAppActionsProps & { tint?: string }) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const color = tint ?? ink.onPrimary;
  return (
    <View className="flex-row items-center gap-1">
      {/* First, as on the web: help with this screen, before the ways out
          of it. */}
      {onShortcuts ? (
        <IconButton label={t('editor.keyboardShortcuts')} onPress={onShortcuts}>
          <QuestionMarkCircleIcon size={ICON_SIZE} color={color} />
        </IconButton>
      ) : null}
      <IconButton label={t('nav.projects')} onPress={onDocuments}>
        <RectangleStackIcon size={ICON_SIZE} color={color} />
      </IconButton>
      <IconButton label={t('nav.settings')} onPress={onSettings}>
        <Cog6ToothIcon size={ICON_SIZE} color={color} />
      </IconButton>
    </View>
  );
}

/**
 * The editor's title-bar actions, grouped for the width in hand.
 *
 * On a tablet or desktop there is room, so every control is shown:
 * `TitleBarDocumentActions` beside `TitleBarAppActions`, exactly as before. On
 * a **phone** the full-size (minimum-touch-target) buttons do not all fit, so
 * only Save, Undo and Redo stay on the bar and the rest — Export, Print,
 * Snapshots, Help, Projects and Settings — go behind one overflow "…". Projects
 * also has the leading hamburger, so the overflow entry is a convenience.
 */
export function TitleBarActions({
  document,
  onSave,
  onExport,
  exporting = false,
  onSnapshots,
  onPrint,
  printing = false,
  onSettings,
  onDocuments,
  onShortcuts,
  phone,
  tint,
}: TitleBarDocumentActionsProps &
  TitleBarAppActionsProps & { phone: boolean; tint?: string }) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const color = tint ?? ink.onPrimary;
  const saveState = useStore(document.store, s => s.saveState);
  const canUndo = useStore(document.store, s => s.canUndo);
  const canRedo = useStore(document.store, s => s.canRedo);
  const playing = useStore(document.store, s => s.state) === 'playing';
  const undo = useCallback(() => document.store.getState().undo(), [document]);
  const redo = useCallback(() => document.store.getState().redo(), [document]);

  if (!phone) {
    return (
      <View className="flex-row items-center gap-1">
        <TitleBarDocumentActions
          document={document}
          onSave={onSave}
          onExport={onExport}
          exporting={exporting}
          {...(onSnapshots ? { onSnapshots } : {})}
          {...(onPrint ? { onPrint } : {})}
          printing={printing}
          {...(tint ? { tint } : {})}
        />
        <TitleBarAppActions
          onSettings={onSettings}
          onDocuments={onDocuments}
          {...(onShortcuts ? { onShortcuts } : {})}
          {...(tint ? { tint } : {})}
        />
      </View>
    );
  }

  const overflow: OverflowAction[] = [
    { key: 'export', label: t('editor.export'), onPress: onExport },
    ...(onPrint
      ? [
          {
            key: 'print',
            label: t('editor.print'),
            onPress: onPrint,
            disabled: printing,
          },
        ]
      : []),
    ...(onSnapshots
      ? [
          {
            key: 'snapshots',
            label: t('snapshot.openTitle'),
            onPress: onSnapshots,
          },
        ]
      : []),
    ...(onShortcuts
      ? [
          {
            key: 'shortcuts',
            label: t('editor.keyboardShortcuts'),
            onPress: onShortcuts,
          },
        ]
      : []),
    { key: 'projects', label: t('nav.projects'), onPress: onDocuments },
    { key: 'settings', label: t('nav.settings'), onPress: onSettings },
  ];

  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        label={t('editor.saveNow')}
        onPress={onSave}
        loading={saveState === 'saving'}
        spinnerColor={color}
      >
        <ArrowDownTrayIcon size={ICON_SIZE} color={color} />
      </IconButton>
      <IconButton
        label={t('editor.undo')}
        onPress={undo}
        disabled={!canUndo || playing}
      >
        <ArrowUturnLeftIcon size={ICON_SIZE} color={color} />
      </IconButton>
      <IconButton
        label={t('editor.redo')}
        onPress={redo}
        disabled={!canRedo || playing}
      >
        <ArrowUturnRightIcon size={ICON_SIZE} color={color} />
      </IconButton>
      <OverflowMenu actions={overflow} tint={color} />
    </View>
  );
}

/**
 * The save state, as a pill — the web app's `SAVE_STATE_CLASS` badge.
 *
 * Three states rather than two: "saving" has to be distinguishable from
 * "saved", or a slow write looks like nothing happened.
 */
const SAVE_STATE_LABEL: Record<DocumentSaveState, string> = {
  saving: 'editor.saving',
  unsaved: 'editor.unsaved',
  saved: 'editor.saved',
};

/*
  One pill for all three states, in the bar's own inverse ink.

  Each state used to have a colour of its own — amber, red, green — as a tint
  on the pill and as `text-*` on the `View`. Neither reached the reader. A
  `Text` does not inherit colour from the view around it, so the words were
  drawn in `foreground`: black on the bar's red in light mode (3.6:1) and
  white on it in dark (3.9:1), both under the 4.5:1 small text needs. And the
  bar is `bg-primary`, which in this theme is the same red as `destructive`,
  so the "unsaved" tint was red on red. The state is carried by the word,
  which is the part that was always readable.
*/
const SAVE_STATE_PILL = 'bg-primary-foreground/20 rounded-full px-2 py-0.5';

function SaveState({
  state,
  tint,
}: {
  state: DocumentSaveState;
  tint?: string;
}) {
  const { t } = useTranslation();
  const label = t(SAVE_STATE_LABEL[state]);
  return (
    <View
      className={
        tint ? 'bg-foreground/10 rounded-full px-2 py-0.5' : SAVE_STATE_PILL
      }
    >
      <Text
        className={
          tint
            ? 'text-foreground text-sm font-medium'
            : 'text-primary-foreground text-sm font-medium'
        }
      >
        {label}
      </Text>
    </View>
  );
}
