# Android native synth

Plan and technical reference for giving Android a native FluidSynth backend,
the way iOS/macOS and Windows already have one. Written for an agent who has
not seen the rest of this session: it is self-contained, but points at the
exact files to read before touching anything.

## Goal

Play MIDI on Android through a native FluidSynth engine running off the JS
thread, instead of the JS MP3 sample engine used today. The outcome is sound
that starts immediately, is low-latency, and matches the quality of the Apple
and Windows builds (same FluidR3 SoundFont, same multi-track mixing).

## Current state (the gap)

The player is chosen once at startup in
`src/config/initialize.ts` (`createPlayer`, around lines 64–102):

```ts
// soundfontUri is the bundled .sf3 on apple + windows, else null.
const soundfontUri =
  Platform.OS === 'macos' || Platform.OS === 'windows' || Platform.OS === 'ios'
    ? bundledSoundfontPath()
    : null;

if (soundfontUri && nativeSynthApi.isSupported()) {
  return new MusicPlayer(
    new SoundfontPlaybackEngine({
      backend: new NativeSynthBackend({ api: nativeSynthApi, soundfontUri }),
    }),
  );
}
// Android falls through to here:
return createMusicPlayer(soundfont); // JS MP3 sample engine
```

On Android `nativeSynthApi.isSupported()` returns `false` (the `@moosiac/synth`
native module is Apple-only — see `native/synth/react-native.config.js`, which
has no `android` entry), so Android gets `createMusicPlayer(soundfont)`. That
engine decodes 88 MP3 clips per instrument in JS on the first Play — hence the
long spin and (on the emulator) no reliable sound.

**The JS side needs no change.** Once the Android native module exists and
reports `isSupported() === true`, and `bundledSoundfontPath()` returns a real
path on Android, this same code picks `NativeSynthBackend` automatically. Do
not special-case Android in `initialize.ts`.

## How the native path works (contract)

`@moosiac/music_player` drives playback through a `SynthBackend`.
`NativeSynthBackend` (in
`node_modules/@sudobility/music_player/dist/rn/playback/native-backend.d.ts`)
is a thin adapter over the `nativeSynthApi` turbo/native module. Read that
`.d.ts` and `native/synth/index.d.ts` for the exact TypeScript signatures — the
Android module must satisfy the **same** JS surface the Apple module does.

The native module methods (from `native/synth/apple/MoosiacSynth.mm`, exported
with `RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD` — they are **synchronous**, called
from the audio-scheduling path):

| Method | Purpose |
| --- | --- |
| `isSupported()` | `true` on this platform. Android must return `true`. |
| `bundledSoundfontPath()` | Absolute path to a readable `.sf3` on disk. |
| `initialize(...)` | Create FluidSynth settings + load the SoundFont. |
| `ensureInstances(count, ...)` | Create N synth instances (one per track + a reserved click instance). |
| `setPrograms(...)` / `programSelect(...)` | Assign GM programs to channels. |
| `setChannelPercussion(...)` | Mark a channel as the GM percussion bank. |
| `noteOn(...)` / `noteOff(...)` / `noteAt(...)` | Note events (scheduled / immediate). |
| `currentTime()` | The engine clock the scheduler reads. |
| `outputLatency()` | Output latency, folded into scheduling. |
| `outputDevices()` / `selectedOutputDevice()` / `setOutputDevice(...)` | Output routing (Apple has a device picker; Android can stub these — see below). |

`NativeSynthBackend` additionally uses `prepare({ instanceCount, programs,
onProgress })`, `setPrograms`, `now()`, `outputLatency`, and a master-gain call
(`fluid_synth_set_gain`, including the multi-track headroom logic) — all of
which map onto the methods above. Keep the Android semantics identical;
anything different will surface as wrong timing or clipping, not a crash.

## The Apple module as the template

Port from these, in `native/synth/`:

- **`apple/MoosiacSynth.mm`** — the reference implementation. All the
  `fluid_*` calls (settings, `new_fluid_synth`, `fluid_synth_sfload`,
  `fluid_synth_program_select`, `fluid_synth_noteon/noteoff`,
  `fluid_synth_set_gain`, `new_fluid_audio_driver`) port almost line-for-line
  to C/C++ on Android. The only platform piece is the audio driver:
  Apple sets `fluid_settings_setstr(settings, "audio.driver", "coreaudio")`.
- **`apple/MoosiacSynth.podspec`** — apple-only (`osx 14` / `ios 15`), bundles
  `resources/FluidR3Mono_GM.sf3`. The Android equivalent is a Gradle module
  that packages the same `.sf3` as an asset.
- **`react-native.config.js`** — currently `{ ios: {podspecPath}, macos:
  {podspecPath}, windows: null }` and **no `android` key**. Add an `android`
  entry so autolinking finds the Gradle module.
- **`scripts/build-fluidsynth-apple.sh`** — the dependency-chain build. The
  Android script mirrors it (see next section).

## Work items

### 1. `scripts/build-fluidsynth-android.sh`

Cross-compile FluidSynth and its SF3 dependencies with the Android NDK, for
`arm64-v8a` and `x86_64` (arm64 for devices, x86_64 for the emulator). Mirror
the Apple script's dependency chain and flags:

```
libogg 1.3.5
  → libvorbis 1.3.7, FLAC 1.4.3, Opus 1.5.2
    → libsndfile 1.2.2
      → FluidSynth 2.6.0
```

Carry over the Apple script's gotchas — they are not optional:

- **Build FLAC + Opus even though only Vorbis is needed for SF3.** libsndfile
  disables Vorbis/SF3 support if FLAC and Opus are absent at configure time.
- `CMAKE_FIND_PACKAGE_PREFER_CONFIG=ON` so FluidSynth finds libsndfile's CMake
  config and turns SF3 on.
- `PKG_CONFIG_LIBDIR` pointed at the per-ABI install prefix.
- After configuring FluidSynth, assert the log line **"Support for SF3 files:
  yes"** — if it says no, the SoundFont will not load and the build is useless.
- Verify the Vorbis symbols made it in (the Apple script does `nm | grep
  vorbis_synthesis`); do the same with `llvm-nm` on the Android `.so`.
- FluidSynth OS layer: `-Denable-osal=cpp11` (C++11, not glib — same as Apple).

Android-specific CMake:

- `-DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK/build/cmake/android.toolchain.cmake`
- `-DANDROID_ABI=arm64-v8a` (and a second pass for `x86_64`)
- `-DANDROID_PLATFORM=android-24` (or the app's `minSdkVersion`)
- Audio driver: **`-Denable-oboe=ON`** (preferred — Oboe picks AAudio on API
  26+ and falls back to OpenSL ES; lowest latency) **or** `-Denable-opensles=ON`
  (simpler, wider compatibility, higher latency). Disable the other, and
  `-Denable-coreaudio=OFF`. **Decide this early** — it changes which extra
  source/lib FluidSynth links and is the main audio-path risk.
- Build FluidSynth as a shared lib (`libfluidsynth.so`); static-link the deps
  into it the way the Apple script folds static libs into the dynamic one.

Output the `.so` files into the Gradle module's `src/main/jniLibs/<abi>/`.
Commit the prebuilt `.so`s (as the Apple build commits its artifact) so a plain
`npx react-native run-android` works without the NDK toolchain on every machine;
leave a note if a CI step should rebuild them instead.

### 2. Android native module — `native/synth/android/`

A React Native module (new-architecture TurboModule if the app is on the new
arch, else a classic `ReactContextBaseJavaModule`). Kotlin shell + a C++ core
over JNI that holds the FluidSynth handles and makes the `fluid_*` calls ported
from `MoosiacSynth.mm`.

- Methods must be **synchronous** to match the Apple contract
  (`isBlockingSynchronousMethod = true` on classic arch; a sync TurboModule
  method on new arch). The scheduler calls `currentTime()`/`noteAt()` inline.
- `initialize`: create settings, `fluid_settings_setstr(settings,
  "audio.driver", "oboe"|"opensles")`, `new_fluid_synth`, `sfload` the
  SoundFont, `new_fluid_audio_driver`.
- `bundledSoundfontPath`: the `.sf3` ships as an APK **asset** (compressed,
  not on the filesystem). FluidSynth's `sfload` needs a real path, so on first
  `initialize` copy the asset from `assets/` to `context.filesDir` and return
  that path. (Alternative: `aaplay`/custom `fluid_sfloader` reading from the
  AssetManager — more code; the copy is simpler and matches what the rest of
  the app expects from `bundledSoundfontPath`.)
- Output-device methods (`outputDevices` etc.): Android has no per-device
  picker like CoreAudio. Return a single "System default" device and make
  `setOutputDevice` a no-op, so the JS `AudioOutputSelect` has something
  consistent to show. Do not throw.
- Multi-instance + gain: port `ensureInstances` and the `fluid_synth_set_gain`
  headroom logic verbatim; the reserved click instance must exist on Android too.

### 3. Gradle + autolink wiring

- `native/synth/android/build.gradle` (+ `settings.gradle` include if needed),
  `AndroidManifest.xml`, the JNI `CMakeLists.txt` that links the prebuilt
  `libfluidsynth.so` and builds the module's own C++.
- Add the `android` key to `native/synth/react-native.config.js` so RN
  autolinking registers the package. Confirm it appears in
  `android/app/build/generated/autolinking` after a build.
- Package the `.sf3` under the module's `src/main/assets/`.

### 4. JS — no change

Leave `src/config/initialize.ts` as is. Once the module reports
`isSupported() === true` and `bundledSoundfontPath()` returns a path, Android
takes the `NativeSynthBackend` branch automatically. (If you want a staged
rollout, gate on a flag — but the end state is no Android special-casing.)

### 5. Verify

- On a **physical** arm64 device first: open Community → a published piece →
  Play. The button should spin only briefly (SoundFont load), then sound plays
  immediately with no JS MP3 decode.
- Then the editor: play a score, confirm sound and timing.
- Emulator (x86_64) is for a smoke test only — **emulator audio is flaky**, so
  silence there is not proof of a bug. Trust the device.
- Check latency feels comparable to iOS; if Oboe/AAudio, confirm it is not
  falling back to a high-latency OpenSL path (Oboe logs the chosen API).

## Risks / decisions (ranked)

1. **NDK cross-compile of FluidSynth + libsndfile/Vorbis is the hard part.**
   The SF3 dependency chain and the "Support for SF3 files: yes" gate are
   where Apple's build fought hardest; expect the same on Android. Budget most
   of the time here.
2. **Oboe vs OpenSL ES.** Decide before building — it changes the FluidSynth
   configure flags and the linked libs. Oboe = best latency; OpenSL ES =
   simplest. Recommendation: Oboe.
3. **SoundFont asset → file path.** Must copy from APK assets to `filesDir`;
   `sfload` can't read a compressed asset directly.
4. **Synchronous native methods.** Match the Apple contract exactly or timing
   breaks subtly rather than loudly.
5. **Prebuilt `.so` vs CI build.** Committing the `.so`s keeps `run-android`
   working everywhere; revisit if repo size matters.
6. **Emulator audio caveat.** The current "no sound on Android" is partly the
   MP3 engine and partly the emulator. Validate on hardware.

Rough effort: ~1 week, dominated by item 1.

## Files to read first

- `native/synth/apple/MoosiacSynth.mm` — the implementation to port.
- `native/synth/apple/MoosiacSynth.podspec` — packaging reference.
- `native/synth/react-native.config.js` — autolink config to extend.
- `native/synth/scripts/build-fluidsynth-apple.sh` — the build to mirror.
- `native/synth/index.d.ts` — the JS API the module must satisfy.
- `node_modules/@sudobility/music_player/dist/rn/playback/native-backend.d.ts`
  — how `NativeSynthBackend` calls the module.
- `src/config/initialize.ts` (`createPlayer`) — the selection logic (do not
  change).
