/**
 * Importing a recording as a project.
 *
 * Nothing is analysed here. The file is handed to the server, which separates
 * it and transcribes each part, so this picks a file and uploads it. The
 * models and the weights that used to make this the heaviest screen in the
 * web app all live in `midi_transcriber_api`.
 *
 * **Choosing the file is the whole of it.** The OS picker opens the moment
 * this is asked to open, as every other import on the menu does, and the
 * recording is sent as soon as one is chosen. There used to be a dialog in
 * between — the file's name, what would happen, a Transcribe button — which
 * asked the reader to confirm the thing they had just done. There is nothing
 * to decide in it: no tempo, no options, and the project that opens next is
 * where the result is watched arriving.
 *
 * **The picker opens whatever the answer is going to be.** Every format on
 * the Import list opens the file picker, and one that answered with a
 * message instead read as the one that was broken. So a recording is chosen
 * first even where it cannot be transcribed, and *then* the reader is told
 * why — nothing has been uploaded at that point, so nothing has been wasted
 * but a choice, and needing to sign in is a different thing to be told than
 * needing a server.
 *
 * The other thing still said is that the recording is on its way, while it
 * is: an upload takes seconds and a screen that does nothing for that long
 * reads as a tap that missed.
 *
 * **The recording is uploaded by path, not by bytes.** React Native's `Blob`
 * cannot be constructed from an `ArrayBuffer`, so reading a recording in order
 * to send it is not possible — and would mean holding a whole audio file in
 * memory if it were. `MusicClient.transcribeAudio` takes an `UploadableFile`
 * for exactly this: the browser passes its `File`, native passes
 * `{ uri, name, type }` and RN's networking layer streams it.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FormModal, Text } from '@sudobility/components-rn';
import { Spinner } from '@sudobility/music_ui_rn';
import type { NativeUploadFile } from '@sudobility/music_client';
import { audioMimeFor } from '@sudobility/music_io';
import { createFilePicker } from '@/documents/file-picker';
import { AUDIO_IMPORT_EXTENSIONS } from '@sudobility/music_types';

export function nativeUploadFor(uri: string): NativeUploadFile {
  const name = uri.split('/').pop() ?? 'recording';
  // `audioMimeFor` defaults rather than refusing: the server sniffs the
  // container anyway, and React Native will not infer a type for an upload.
  return { uri, name, type: audioMimeFor(name) };
}

export type AudioImportSheetProps = {
  open: boolean;
  /** True while the recording is being uploaded. */
  busy?: boolean;
  /** False where a recording cannot be transcribed at all. */
  available?: boolean;
  /**
   * Why not, when it cannot. A recording is transcribed on the server into a
   * project that belongs to an account, so there are two ways to be without
   * it: no server, or nobody signed in. They have different remedies, and
   * telling a reader who only has to sign in that the server cannot do it
   * sends them away from a feature they have.
   */
  unavailableReason?: 'server' | 'signedOut';
  onClose: () => void;
  onUpload: (file: NativeUploadFile) => void;
};

export function AudioImportSheet({
  open,
  busy = false,
  available = true,
  unavailableReason = 'server',
  onClose,
  onUpload,
}: AudioImportSheetProps) {
  const { t } = useTranslation();
  /** A recording was chosen where none can be sent: the reason is owed. */
  const [refused, setRefused] = useState(false);

  const choose = async (): Promise<void> => {
    const picker = createFilePicker();
    if (!picker.isSupported()) {
      onClose();
      return;
    }
    const uri = await picker.pickFile(AUDIO_IMPORT_EXTENSIONS);
    // Chosen is sent. Cancelled closes the whole flow — there is nothing on
    // screen to leave open instead.
    if (!uri) onClose();
    else if (available) onUpload(nativeUploadFor(uri));
    else setRefused(true);
  };

  useEffect(() => {
    // Deliberately keyed on `open` alone: `choose` closes over
    // `onClose`/`onUpload`, which change identity every render on the
    // callers below, and listing them would fire the picker again on every
    // render rather than once per open. Not on `available` either — it can
    // settle while the picker is up, and that must not open a second one.
    if (open) void choose();
    else setRefused(false);
  }, [open]);

  // The caller closes this when the upload lands or fails; nothing here can
  // be cancelled part-way, so while it is busy there is no way out offered.
  const sending = available && busy;

  return (
    <FormModal
      visible={open && (sending || refused)}
      title={t('importAudio.title')}
      onClose={sending ? () => undefined : onClose}
      actions={
        sending
          ? []
          : [{ label: t('common.cancel'), onPress: onClose, variant: 'ghost' }]
      }
      closeAriaLabel={t('common.closeDialog')}
    >
      <View className="gap-2 p-1">
        {sending ? (
          <View className="flex-row items-center gap-3">
            <Spinner />
            <Text className="text-foreground text-base">
              {t('importAudio.sending')}
            </Text>
          </View>
        ) : (
          <Text className="text-foreground text-base">
            {t(
              unavailableReason === 'signedOut'
                ? 'importAudio.signInRequired'
                : 'importAudio.unavailable',
            )}
          </Text>
        )}
      </View>
    </FormModal>
  );
}
