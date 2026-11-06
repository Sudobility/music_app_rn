/**
 * The native implementations live in the app projects: CocoaPods links the
 * iOS and macOS source (the same `apple/` files, a vendored XCFramework — see
 * MoosiacSynth.podspec), Gradle links the Android library (`android/`, a
 * Kotlin shell over a JNI core and a prebuilt libfluidsynth.so), while RNW
 * links the Windows TinySoundFont/WASAPI module.
 */
module.exports = {
  dependency: {
    platforms: {
      ios: { podspecPath: __dirname + '/MoosiacSynth.podspec' },
      macos: { podspecPath: __dirname + '/MoosiacSynth.podspec' },
      // Relative to the package root, unlike `podspecPath`: the Android
      // resolver joins it onto the root itself, so an absolute path here
      // resolves to nothing and the module is silently not linked.
      android: { sourceDir: 'android' },
      windows: null,
    },
  },
};
