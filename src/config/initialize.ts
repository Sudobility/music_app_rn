/**
 * The composition root: everything platform-bound, constructed once.
 *
 * The order matters in one place. `initializeMusicPlayer` comes first, because
 * music_lib's playback adapter resolves the player from that singleton the
 * first time it is used — the same rule the web app follows, and for the same
 * reason.
 *
 * Deliberately no `MusicClient` and no auth. A local document needs neither,
 * and `StoreContext` now says so: `client` and `getToken` are optional, and
 * anything server-backed reports itself unavailable rather than failing. Server
 * projects add those later without changing anything here.
 */
import { Platform } from 'react-native';
import { setNativeDialogsSupported } from '@sudobility/components-rn';
import { createMusicIo } from '@sudobility/music_io';
import type { MusicIo } from '@sudobility/music_io';
import {
  initializeMusicPlayer,
  resetMusicPlayer,
} from '@sudobility/music_player';
import type { IMusicPlayer } from '@sudobility/music_player';
import i18next from 'i18next';
import { initializeMusicSelection } from '@sudobility/music_editing';
import { initializeMusicPosition } from '@sudobility/music_types';
import {
  createLibraryCopy,
  installLibraryCopy,
  setErrorLogging,
} from '@sudobility/music_lib';
import type { LibraryCopy } from '@sudobility/music_lib';
import { BUNDLED_SOUNDFONT, readBundledPack } from './soundfont-packs';
import { createNativeMusicPlayer } from './native-player';
import type { SoundfontOptions } from './native-player';
import { installWindowsAnimationFrames } from '@/platform/windows-animation-frames';

if (Platform.OS === 'windows') installWindowsAnimationFrames();

/*
  Dialogs as real macOS sheets. This app patches a modal host into React Native
  macOS (`patches/react-native-macos+0.81.9.patch`), which stock React Native
  macOS does not have — so the shared components only mount `Modal` there when
  an app says it can.
*/
if (Platform.OS === 'macos') setNativeDialogsSupported(true);

/**
 * The player is built by `createNativeMusicPlayer` (`./native-player`): the
 * native synth from `@sudobility/music_synth_rn` wherever one is built in, else
 * the MP3 sample fallback from `@sudobility/music_sample_engine`. music_player
 * is only the scheduler now; the app composes it with a backend.
 */

export type AppServices = {
  io: MusicIo;
  player: IMusicPlayer;
  /**
   * The sample packs, shared between playback and audio export on purpose.
   *
   * An exported file should be a recording of what was heard, so both sides
   * have to resolve the same instruments. Two sets of URLs would become two
   * different soundfonts the first time one of them was updated, and the
   * symptom is an export that sounds subtly unlike the app.
   */
  soundfont: SoundfontOptions;
};

export type { SoundfontOptions } from './native-player';

let services: AppServices | null = null;

/**
 * The words the libraries need — undo labels, editing refusals, the selection
 * readout, MusicXML warnings, autosave failures — built by music_lib from this
 * app's `t`.
 *
 * The keys are music_lib's and the sentences are this app's locale files. The
 * table used to be written out here by hand (`i18n/lib-copy.ts`), a second copy
 * of the web's that agreed with it only until one of them changed, and it
 * captured three strings at start-up — so a reader who switched to Chinese went
 * on being told in English why a bar could not be deleted. Every entry here is
 * read when it is used.
 *
 * `i18next.t` is wrapped rather than passed: the typed `t` accepts only known
 * keys, and these are built from vocabularies at runtime.
 */
export const libraryCopy: LibraryCopy = createLibraryCopy((key, options) =>
  i18next.t(key, options),
);

export type InitializeOptions = {
  /**
   * Where the instrument packs are served from.
   *
   * The RN engine plays pre-rendered samples rather than synthesising, so it
   * needs somewhere to fetch them. An app shipping to a store should point
   * this at its own copy; the packs are CC-BY 3.0, so that is allowed.
   */
  packBase?: string;
  /** Percussion has no usably-licensed public default, so it must be supplied. */
  percussionBase?: string;
  dev?: boolean;
};

export function initializeApp(options: InitializeOptions = {}): AppServices {
  if (services) return services;

  // The library reads no `import.meta.env` of its own — that is syntax React
  // Native's parser rejects outright, so the host says what it knows.
  setErrorLogging(options.dev ?? false);
  installLibraryCopy(libraryCopy);

  /*
    The playhead and the selection are singletons in music_types/music_editing,
    and the editing helpers reach for them directly — `placeCaret` moves the
    position source rather than writing to a store. Without these, aiming the
    caret is a silent no-op.

    A singleton playhead is right even here, where several documents are open:
    only one transport plays at a time, so there is only ever one playhead to
    disagree about. Both calls are idempotent.
  */
  initializeMusicPosition();
  initializeMusicSelection();

  /*
    Bundled packs by default: a native app carries its instruments, so pressing
    play needs no network. An explicit `packBase` still wins — a development
    build pointed at a local server, say — and supplying one drops the bundled
    loader with it, since a URL the loader cannot read on disk would fail every
    lookup.
  */
  const hosted = options.packBase ?? options.percussionBase;
  const soundfont: SoundfontOptions = hosted
    ? {
        ...(options.packBase ? { packBase: options.packBase } : {}),
        ...(options.percussionBase
          ? { percussionBase: options.percussionBase }
          : {}),
      }
    : { ...BUNDLED_SOUNDFONT, fetchPack: readBundledPack };
  const player = initializeMusicPlayer(createNativeMusicPlayer(soundfont));

  /*
    macOS is told it has no share sheet, rather than left to work it out.

    `react-native-share` is iOS/Android only, but on macOS it imports fine and
    `open()` resolves without doing anything — so an export silently landed in
    a cache directory nobody browses, with no error to catch. The library
    cannot detect that from the inside; the composition root can, which is the
    same reason `setErrorLogging` is called here rather than sniffed for. Told
    false, `saveMidi` and friends write a real file into Downloads, which is
    what a desktop app should do anyway.
  */
  services = {
    io: createMusicIo({
      shareSheet: Platform.OS !== 'macos' && Platform.OS !== 'windows',
    }),
    player,
    soundfont,
  };
  return services;
}

export function getAppServices(): AppServices {
  if (!services) {
    throw new Error('App not initialized — call initializeApp() at start-up.');
  }
  return services;
}

/**
 * Test hook: installs stand-in services without starting an audio engine.
 *
 * A component that reaches for `getAppServices()` — the keyboard, the export
 * sheet, anything that touches a file — otherwise throws in a test, and the
 * message points at start-up rather than at what the component needed. Mirrors
 * `music_app`'s `installTestAppServices()`, and for the same reason: the
 * alternative is every such test mocking the module itself, which is a
 * different fake in each file.
 */
export function installTestAppServices(
  overrides: Partial<AppServices> = {},
): AppServices {
  services = {
    io: {} as MusicIo,
    player: silentPlayer(),
    soundfont: {},
    ...overrides,
  };
  // The singleton too, as start-up does: a Play button reads the player's
  // readiness from there (`usePlaybackReadiness`), and a test that installs a
  // player of its own means that one — so the last one wins here, where in
  // the app the first does.
  resetMusicPlayer();
  initializeMusicPlayer(services.player);
  return services;
}

/**
 * A player that makes no sound and reports nothing.
 *
 * Every subscription hands back an unsubscribe, because components call it from
 * an effect's cleanup — an empty object throws `onSounding is not a function`
 * on mount and `undefined is not a function` on unmount, and the second is the
 * one that leaks into the next test.
 */
function silentPlayer(): IMusicPlayer {
  const unsubscribe = (): void => {};
  return {
    onSounding: () => unsubscribe,
    onPosition: () => unsubscribe,
    onTransport: () => unsubscribe,
    onLoadState: () => unsubscribe,
    noteOn: () => {},
    noteOff: () => {},
    setLoop: () => {},
    setMetronome: () => {},
    setSoundingRenderDelay: () => {},
    setTempoMultiplier: () => {},
    setMasterVolume: () => {},
    load: async () => {},
    play: async () => {},
    pause: () => {},
    stop: () => {},
    seek: () => {},
    applyMix: () => {},
  } as unknown as IMusicPlayer;
}

/** Whether anything has been installed yet — for a test helper's own guard. */
export function appServicesInstalled(): boolean {
  return services !== null;
}

/** Test hook: drops the singletons so a suite cannot leak into the next. */
export function resetAppServices(): void {
  services = null;
}
