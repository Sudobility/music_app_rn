import { NativeModules, Platform } from 'react-native';
import {
  AudioManager,
  AudioRecorder,
  FileFormat,
} from 'react-native-audio-api';
import type { NativeUploadFile } from '@sudobility/music_client';

export type VoiceRecording = {
  stop(): Promise<NativeUploadFile>;
};

type NativeVoiceRecorder = {
  startVoiceRecording(): Promise<void>;
  stopVoiceRecording(): Promise<string>;
};

/** Capture a WAV on the device; only the resulting file path is sent over JS. */
export async function startVoiceRecording(): Promise<VoiceRecording> {
  if (Platform.OS === 'windows' || Platform.OS === 'macos') {
    const native = NativeModules.MoosiacSynth as
      NativeVoiceRecorder | undefined;
    if (!native?.startVoiceRecording)
      throw new Error('Microphone recording is unavailable');
    await native.startVoiceRecording();
    return {
      async stop() {
        const path = await native.stopVoiceRecording();
        const uri =
          Platform.OS === 'windows'
            ? encodeURI(`file:///${path.replaceAll('\\', '/')}`)
            : path;
        return { uri, name: 'voice.wav', type: 'audio/wav' };
      },
    };
  }

  const permission = await AudioManager.requestRecordingPermissions();
  if (permission !== 'Granted') throw new Error('Microphone access was denied');
  if (Platform.OS === 'ios') {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'default',
      iosOptions: [],
    });
  }
  await AudioManager.setAudioSessionActivity(true);
  const recorder = new AudioRecorder();
  const enabled = recorder.enableFileOutput({
    format: FileFormat.Wav,
    channelCount: 1,
    fileNamePrefix: 'voice',
  });
  if (enabled.status === 'error') {
    await AudioManager.setAudioSessionActivity(false);
    throw new Error(enabled.message);
  }
  const started = await recorder.start();
  if (started.status === 'error') {
    await AudioManager.setAudioSessionActivity(false);
    throw new Error(started.message);
  }
  return {
    async stop() {
      try {
        const result = await recorder.stop();
        if (result.status === 'error') throw new Error(result.message);
        const uri = result.paths[0];
        if (!uri) throw new Error('The recording was empty');
        return { uri, name: 'voice.wav', type: 'audio/wav' };
      } finally {
        await AudioManager.setAudioSessionActivity(false);
      }
    },
  };
}
