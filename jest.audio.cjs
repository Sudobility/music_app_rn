/**
 * `react-native-audio-api`, stubbed.
 *
 * It ships ESM the jest transform does not carry the babel for, and behind that
 * it reaches a native recorder jest has no device for. No component test
 * records: the voice button (`VoiceRecordButton`) and the editing bar only need
 * the module to import and the button to mount, so this hands back inert
 * stand-ins — `AudioManager`'s session calls, an `AudioRecorder` that does
 * nothing, and the one `FileFormat` the recorder names. The recording path is
 * exercised by running the app, like Skia and the Spatial stage
 * (`jest.skia.cjs`, `jest.spatial.cjs`).
 */
class AudioRecorder {
  enableFileOutput() {
    return true;
  }
  start() {
    return Promise.resolve(true);
  }
  stop() {
    return Promise.resolve(null);
  }
  onAudioReady() {}
}

const AudioManager = {
  getDevicesInfo: () => Promise.resolve([]),
  setInputDevice: () => Promise.resolve(),
  requestRecordingPermissions: () => Promise.resolve('Granted'),
  setAudioSessionOptions: () => {},
  setAudioSessionActivity: () => Promise.resolve(),
};

module.exports = {
  AudioManager,
  AudioRecorder,
  FileFormat: { Wav: 'wav' },
};
