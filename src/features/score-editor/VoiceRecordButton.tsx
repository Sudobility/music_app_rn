import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MicrophoneIcon } from 'react-native-heroicons/solid';
import {
  dispatchTracked,
  transcribedScoreCommand,
} from '@sudobility/music_editing';
import { getMusicPosition } from '@sudobility/music_types';
import { AudioManager } from 'react-native-audio-api';
import { FormModal, Select, Text } from '@sudobility/components-rn';
import { IconButton } from '@sudobility/music_ui_rn';
import { useNotationInk } from '@sudobility/music_ui_rn';
import { useAuth } from '@/auth/AuthContext';
import { getMusicClient } from '@/config/server';
import type { MusicDocument } from '@/documents/document';
import { startVoiceRecording } from './voice-recorder';
import type { VoiceRecording } from './voice-recorder';
import { transcribeVoiceRecording } from './transcribe-recording';
import { voiceRecordingAsMp3 } from './voice-mp3';

type Capture = {
  recording: VoiceRecording;
  anchorTick: number;
  scope: 'voice' | 'all';
};

export function VoiceRecordButton({
  document,
  onTranscriptionJob,
}: {
  document: MusicDocument;
  onTranscriptionJob?: (
    projectId: string,
    cancel: () => void,
    progress?: {
      stage: 'plan' | 'part' | 'section' | 'chunk';
      label: string;
      done: number;
      total: number;
    },
  ) => void;
}) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const { getToken } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scope, setScope] = useState<'voice' | 'all'>('voice');
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const capture = useRef<Capture | null>(null);
  const cancelled = useRef(false);
  const store = document.store;

  useEffect(() => {
    if (!dialogOpen) return;
    void AudioManager.getDevicesInfo()
      .then(info =>
        setDevices(
          info.availableInputs.map(device => ({
            value: device.id,
            label: device.name,
          })),
        ),
      )
      .catch(() => setDevices([]));
  }, [dialogOpen]);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      if (capture.current) void capture.current.recording.stop();
    };
  }, []);

  const start = async () => {
    if (busy) return;
    cancelled.current = false;
    const state = store.getState();
    const client = getMusicClient();
    const token = await getToken();
    if (!client || !token) {
      Alert.alert(t('editor.recordVoice'), t('importAudio.signInRequired'));
      return;
    }
    if (!state.score) {
      Alert.alert(t('editor.recordVoice'), t('editor.recordVoiceError'));
      return;
    }
    setBusy(true);
    try {
      const capability = await client.getTranscriptionCapability(token);
      if (!capability.available) throw new Error(t('importAudio.unavailable'));
      if (deviceId) await AudioManager.setInputDevice(deviceId);
      const recording = await startVoiceRecording();
      capture.current = {
        recording,
        anchorTick: getMusicPosition().tick,
        scope,
      };
      setOn(true);
    } catch (error) {
      Alert.alert(
        t('editor.recordVoice'),
        error instanceof Error ? error.message : t('editor.recordVoiceError'),
      );
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    const active = capture.current;
    if (!active) return;
    capture.current = null;
    setOn(false);
    setBusy(true);
    let cleanupTranscriptionProject: () => Promise<unknown> = async () =>
      undefined;
    try {
      const file = await voiceRecordingAsMp3(active.recording);
      const client = getMusicClient();
      const token = await getToken();
      if (!client || !token) throw new Error(t('importAudio.signInRequired'));
      let projectId = '';
      let cancelJob = () => undefined;
      const result = await transcribeVoiceRecording(
        client,
        token,
        file,
        file.name,
        () => cancelled.current,
        id => {
          projectId = id;
          cleanupTranscriptionProject = () =>
            client.deleteProject(id, token).catch(() => undefined);
          cancelJob = () => {
            cancelled.current = true;
            void client
              .cancelProjectGeneration(id, token)
              .then(() => client.deleteProject(id, token))
              .catch(() => undefined);
          };
          onTranscriptionJob?.(id, cancelJob);
        },
        progress => onTranscriptionJob?.(projectId, cancelJob, progress),
        active.scope,
      );
      if (cancelled.current) return;
      const command = transcribedScoreCommand(
        result.score,
        active.anchorTick,
        active.scope,
      );
      if (!command) throw new Error(t('editor.noVoiceNotes'));
      const before = store.getState().score;
      dispatchTracked(store, command);
      if (store.getState().score === before)
        throw new Error(t('editor.recordVoiceError'));
    } catch (error) {
      if (!cancelled.current)
        Alert.alert(
          t('editor.recordVoice'),
          error instanceof Error ? error.message : t('editor.recordVoiceError'),
        );
    } finally {
      onTranscriptionJob?.('', () => undefined);
      await cleanupTranscriptionProject();
      setBusy(false);
    }
  };

  return (
    <>
      <IconButton
        label={t(on ? 'editor.stopVoiceRecording' : 'editor.recordVoice')}
        hint={t('editor.recordVoiceHint')}
        onPress={() => (on ? void stop() : setDialogOpen(true))}
        disabled={busy}
        selected={on}
        loading={busy}
      >
        <MicrophoneIcon size={18} color={on ? ink.primary : ink.foreground} />
      </IconButton>
      <FormModal
        visible={dialogOpen}
        title={t('editor.captureAudio')}
        onClose={() => setDialogOpen(false)}
        closeAriaLabel={t('common.closeDialog')}
        actions={[
          {
            label: t('common.cancel'),
            onPress: () => setDialogOpen(false),
            variant: 'ghost',
          },
          {
            label: t('editor.startRecording'),
            onPress: () => {
              setDialogOpen(false);
              void start();
            },
            disabled: busy,
          },
        ]}
      >
        <View className="gap-3">
          <Text className="text-muted-foreground text-sm">
            {t('editor.recordFrom')}
          </Text>
          <Text className="text-foreground text-base">
            {t('editor.microphone')}
          </Text>
          <Text className="text-muted-foreground text-sm">
            {t('editor.inputDevice')}
          </Text>
          <Select
            value={deviceId}
            accessibilityLabel={t('editor.inputDevice')}
            options={[
              { value: '', label: t('editor.defaultInput') },
              ...devices,
            ]}
            onValueChange={setDeviceId}
          />
          <Text className="text-muted-foreground text-sm">
            {t('editor.transcriptionScope')}
          </Text>
          <Select
            value={scope}
            accessibilityLabel={t('editor.transcriptionScope')}
            options={[
              { value: 'voice', label: t('editor.voiceTrackOnly') },
              { value: 'all', label: t('editor.allTracks') },
            ]}
            onValueChange={value => setScope(value as 'voice' | 'all')}
          />
        </View>
      </FormModal>
    </>
  );
}
