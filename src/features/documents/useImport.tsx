/**
 * Importing a file into a new document, and saying what was lost.
 *
 * Extracted from `ImportButtons` when the macOS File menu grew Import items:
 * the menu and the dashboard buttons do exactly the same thing, and a second
 * copy of "pick a file, decode it, report the warnings" is a second place for
 * the warning contract to drift out of step with music_io's.
 *
 * The feedback dialogs travel with the hook rather than being left to each
 * caller, because an importer that silently drops a warning is the failure
 * this whole path exists to prevent.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FormModal, Text } from '@sudobility/components-rn';
import { ProjectFileError } from '@sudobility/music_lib';
import type { MidiImportOptions, MidiSummary } from '@sudobility/music_lib';
import { IMPORT_EXTENSIONS, importDocument } from '@/documents/import';
import type { ImportFormat } from '@/documents/import';
import { createFilePicker } from '@/documents/file-picker';
import { createImportSource } from '@/documents/rn-storage';
import {
  useDocumentList,
  useDocumentServices,
} from '@/documents/DocumentsContext';
import { getAppServices, libraryCopy } from '@/config/initialize';
import { trackButtonClick, trackError, trackEvent } from '@/analytics';
import { MidiImportSheet } from './MidiImportSheet';
import { usePendingAction } from '@sudobility/music_ui_rn';

/**
 * A failure, in the reader's language where the failure has a reason.
 *
 * `ProjectFileError` is the one refusal this path makes on purpose — an
 * unreadable, foreign or newer-version `.moo` — and it carries a `reason`
 * rather than a sentence, precisely so each host can say it in its own words.
 * Reporting `error.message` instead prints the library's English at a Chinese
 * reader, which is the thing the warning contract exists to prevent. The keys
 * are `dashboard.projectFileError.*`, the same keys and the same words the web
 * app uses, so the two cannot come to disagree about what a bad file is.
 *
 * Anything else is a decoder or a filesystem throwing, where the message is all
 * there is.
 */
function describeFailure(error: unknown, t: (key: string) => string): string {
  if (error instanceof ProjectFileError) {
    return t(`dashboard.projectFileError.${error.reason}`);
  }
  return error instanceof Error ? error.message : String(error);
}

export type UseImportOptions = {
  /**
   * Called once a file has actually landed in the document list — after
   * `importDocument` succeeds, warnings or not, since a warning is not a
   * failure. The desktop Projects window's `ImportPane` is the one caller
   * that needs this: it is what tells `ProjectsSplitView` a project opened,
   * so the window can focus the editor and dismiss itself the same way
   * New and Template do.
   */
  onImported?: () => void;
};

export function useImport(options: UseImportOptions = {}) {
  const { onImported } = options;
  const { t } = useTranslation();
  const list = useDocumentList();
  // Signed in, an import becomes a server project; the services say whether
  // there is a server and an account to make one with.
  const services = useDocumentServices();
  const [warnings, setWarnings] = useState<readonly string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /*
    Which format is being imported, from the press to the document (or the
    MIDI wizard) being there. Choosing a file and decoding it — or, signed in,
    making a server project of it — is a wait; the control that started it
    spins through it, and a second import is refused meanwhile.
  */
  const pending = usePendingAction<ImportFormat>();
  const runPending = pending.run;

  /**
   * A MIDI file that has been read and analysed but not yet imported.
   *
   * MIDI is the one format that cannot be imported without deciding things —
   * bar lines, clefs and key are all guesses — so the file is analysed first
   * and the wizard opened over the result. Every other format states its own
   * content outright and goes straight in.
   */
  const [pendingMidi, setPendingMidi] = useState<{
    uri: string;
    summary: MidiSummary;
  } | null>(null);

  const finish = useCallback(
    async (
      format: ImportFormat,
      uri: string,
      midiOptions?: MidiImportOptions,
    ): Promise<void> => {
      try {
        const result = await importDocument(
          list,
          services,
          createImportSource(),
          getAppServices().io,
          format,
          uri,
          libraryCopy.musicXmlWarnings(),
          midiOptions,
        );
        if (result.warnings.length > 0) setWarnings(result.warnings);
        trackEvent('import_complete', { format });
        onImported?.();
      } catch (error) {
        trackError(
          error instanceof Error ? error.message : String(error),
          'import_failed',
        );
        setFailure(describeFailure(error, t));
      }
    },
    [list, services, t, onImported],
  );

  /**
   * Imports a file already chosen — by the picker below, or by an open link.
   * MIDI still goes through its wizard either way.
   */
  const importFile = useCallback(
    async (format: ImportFormat, uri: string): Promise<void> => {
      await runPending(async () => {
        try {
          if (format === 'midi') {
            // Analysed here rather than inside the sheet: reading the file can
            // fail, and a failure belongs in this hook's own report rather than
            // inside a modal that has already opened.
            const bytes = await createImportSource().readBytes(uri);
            setPendingMidi({
              uri,
              summary: getAppServices().io.analyzeMidi(bytes),
            });
            return;
          }
          await finish(format, uri);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          trackError(message, 'import_failed');
          setFailure(message);
        }
      }, format);
    },
    [finish, runPending],
  );

  const run = useCallback(
    async (format: ImportFormat): Promise<void> => {
      const picker = createFilePicker();
      if (!picker.isSupported()) {
        setFailure(t('import.unsupported'));
        return;
      }
      let uri: string | null = null;
      // Pending through the picker too: a second press while the chooser is
      // up would raise a second chooser.
      await runPending(async () => {
        try {
          uri = await picker.pickFile(IMPORT_EXTENSIONS[format]);
        } catch (error) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      }, format);
      // Cancelling is an ordinary outcome, not a failure to report.
      if (!uri) return;
      trackButtonClick('import', { format });
      await importFile(format, uri);
    },
    [t, importFile, runPending],
  );

  // The wizard stays up, Import spinning, until the document is there.
  const confirmMidi = useCallback(
    (options: MidiImportOptions): void => {
      const chosen = pendingMidi;
      if (!chosen) return;
      void runPending(async () => {
        try {
          await finish('midi', chosen.uri, options);
        } finally {
          setPendingMidi(null);
        }
      }, 'midi');
    },
    [pendingMidi, finish, runPending],
  );

  return {
    run,
    importFile,
    /** The format being imported, or null. */
    importing: pending.pendingKey,
    warnings,
    failure,
    setWarnings,
    setFailure,
    pendingMidi,
    confirmMidi,
    cancelMidi: () => setPendingMidi(null),
  };
}

export type ImportState = ReturnType<typeof useImport>;

/**
 * Everything the importer has to say, mounted by whoever ran it.
 *
 * Takes the hook's whole result rather than four hand-picked props: the MIDI
 * wizard joined the warnings and the failure here, and a caller that has to
 * remember to thread each new piece is a caller that will one day drop one —
 * which for an importer means silently losing the warning it exists to give.
 */
export function ImportFeedback({ state }: { state: ImportState }) {
  const { t } = useTranslation();
  const {
    warnings,
    failure,
    setWarnings,
    setFailure,
    pendingMidi,
    confirmMidi,
    cancelMidi,
  } = state;
  const onDismissWarnings = (): void => setWarnings(null);
  const onDismissFailure = (): void => setFailure(null);
  return (
    <>
      {/*
        MIDI asks before it imports: bar lines, clefs and key are all guesses,
        and a guess nobody was shown is a guess nobody can correct.
      */}
      <MidiImportSheet
        open={pendingMidi !== null}
        summary={pendingMidi?.summary ?? null}
        onCancel={cancelMidi}
        onImport={confirmMidi}
        importing={state.importing === 'midi' && pendingMidi !== null}
      />
      <FormModal
        visible={warnings !== null}
        title={t('import.warningsTitle')}
        onClose={onDismissWarnings}
        onSave={onDismissWarnings}
        saveLabel={t('common.ok')}
        closeAriaLabel={t('common.closeDialog')}
      >
        <View className="gap-2">
          <Text className="text-muted-foreground text-base">
            {t('import.warningsExplain')}
          </Text>
          {(warnings ?? []).map(warning => (
            <Text key={warning} className="text-foreground text-base">
              {warning}
            </Text>
          ))}
        </View>
      </FormModal>

      <FormModal
        visible={failure !== null}
        title={t('import.failedTitle')}
        onClose={onDismissFailure}
        onSave={onDismissFailure}
        saveLabel={t('common.ok')}
        closeAriaLabel={t('common.closeDialog')}
      >
        <Text className="text-foreground text-base">{failure}</Text>
      </FormModal>
    </>
  );
}
