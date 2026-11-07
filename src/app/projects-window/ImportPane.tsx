/**
 * The desktop Projects window's Import pane — the five formats
 * `ImportButtons`' dropdown offers, as a plain list instead: clicking a
 * format opens the OS picker directly (`useImport`'s `run`, the same one
 * `ImportButtons` and the macOS File menu's Import submenu call — see
 * `FileImportModal.tsx` on the web for the sibling fix this already had
 * here), with no extra "are you sure" step in between.
 *
 * Audio is the one exception, same as everywhere else it is offered: it
 * uploads to the server rather than decoding on the device, so it keeps its
 * own sheet (`AudioImportSheet`, which *also* opens its own picker
 * immediately) instead of a bare `run('audio')`.
 */
import { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import { PressableCard } from '@sudobility/music_ui_rn';
import type { NativeUploadFile } from '@sudobility/music_client';
import type { ImportFormat } from '@/documents/import';
import { OFFERED } from '@/features/documents/ImportButtons';
import { ImportFeedback, useImport } from '@/features/documents/useImport';
import { AudioImportSheet } from '@/features/documents/AudioImportSheet';
import { getMusicClient } from '@/config/server';
import { useServerContext } from '@/config/useServerContext';
import { useAuth } from '@/auth/AuthContext';
import {
  useDocumentList,
  useDocumentServices,
} from '@/documents/DocumentsContext';
import { openProjectInto } from '@/documents/document';
import { useDetailScroll } from '@/components/layout/detail-safe-area';

type OfferedFormat = (typeof OFFERED)[number];

export type ImportPaneProps = {
  /** A project landed — from a local import, or an audio upload starting. */
  onOpened: () => void;
  /**
   * Stands before a format is chosen, where one project is open at a time:
   * asked *before* the file picker, since an answer of "no" after somebody
   * has gone and found their file is the question asked too late.
   */
  guard?: (action: () => void) => void;
};

const unguarded = (action: () => void) => action();

export function ImportPane({ onOpened, guard = unguarded }: ImportPaneProps) {
  const { t } = useTranslation();
  const importer = useImport({ onImported: onOpened });
  const { run } = importer;
  const context = useServerContext();
  const { user } = useAuth();
  const list = useDocumentList();
  const services = useDocumentServices();
  const [audioOpen, setAudioOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Vertically scrollable: full-bleed with a scroll inset and safe-area sides.
  const detail = useDetailScroll({ gap: 8 });

  /**
   * Uploads a recording and opens the project it becomes — the same call
   * `DashboardScreen`'s `ProjectList` makes. The project is `transcribing`
   * when it opens, and the editor shows each part arriving; it goes into the
   * document list both windows share, which is what "opened" means here.
   */
  const transcribeAudio = useCallback(
    async (file: NativeUploadFile) => {
      const client = getMusicClient();
      const token = await context?.getToken?.();
      // Said, not swallowed. Returning here closed the sheet as though the
      // recording had gone, and then nothing happened: no project, no
      // window, no reason.
      if (!client || !token) throw new Error(t('importAudio.signInRequired'));
      const project = await client.transcribeAudio(file, file.name, token);
      await openProjectInto(list, services, project.id);
      onOpened();
    },
    [context, list, services, onOpened, t],
  );

  return (
    <>
      <FlatList
        {...detail}
        data={OFFERED}
        extraData={`${importer.importing}:${uploading}`}
        keyExtractor={(item: OfferedFormat) => item.value}
        accessibilityLabel={t('dashboard.importFormat')}
        renderItem={({ item }: { item: OfferedFormat }) => {
          const choose = () =>
            guard(() => {
              if (item.value === 'audio') setAudioOpen(true);
              else void run(item.value as ImportFormat);
            });
          return (
            <PressableCard
              label={t(item.labelKey)}
              onPress={choose}
              loading={
                item.value === 'audio'
                  ? uploading
                  : importer.importing === item.value
              }
              disabled={importer.importing !== null || uploading}
            >
              <Text className="text-foreground font-medium">
                {t(item.labelKey)}
              </Text>
              <Text className="text-muted-foreground text-sm">
                {t(item.descriptionKey)}
              </Text>
            </PressableCard>
          );
        }}
      />
      <AudioImportSheet
        open={audioOpen}
        busy={uploading}
        available={context !== null && user !== null}
        unavailableReason={context !== null ? 'signedOut' : 'server'}
        onClose={() => setAudioOpen(false)}
        onUpload={async file => {
          setUploading(true);
          try {
            await transcribeAudio(file);
            setAudioOpen(false);
          } catch (error) {
            // Closed first, same order `ImportButtons` uses: the sheet's own
            // job is done (a file was picked and sent), and the failure is
            // this pane's to report, not a reason to leave the sheet open
            // stacked on top of it.
            setAudioOpen(false);
            importer.setFailure(
              error instanceof Error ? error.message : String(error),
            );
          } finally {
            setUploading(false);
          }
        }}
      />
      <ImportFeedback state={importer} />
    </>
  );
}
