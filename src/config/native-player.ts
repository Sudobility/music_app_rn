/**
 * The player and audio export, assembled from the scheduler and the synths.
 *
 * `@sudobility/music_player` is the platform-neutral scheduler; the synths are
 * their own packages and neither depends on it, so this composition root joins
 * them — the native-app counterpart of the web app's `config/web-player.ts`,
 * and the former home of music_player's rn `createMusicPlayer`/`renderScoreAudio`.
 *
 * Primary path: libfluidsynth/TinySoundFont via `@sudobility/music_synth_rn`'s
 * `SynthBackend`. Fallback, when no native synth is built in or the font cannot
 * be read: the MP3 sample engine in `@sudobility/music_sample_engine`, which
 * logs its own use so the fallback can be monitored and eventually retired.
 */
import {
  MusicPlayer,
  SoundfontPlaybackEngine,
  renderScoreWith,
} from '@sudobility/music_player';
import type { IMusicPlayer } from '@sudobility/music_player';
import { createNativeSynthBackend } from '@sudobility/music_synth_rn';
import {
  createSamplePlayer,
  renderSamples,
} from '@sudobility/music_sample_engine';
import type { DecodedAudio, Score } from '@sudobility/music_types';

/** Where the MP3 sample packs come from — used by the fallback and by export. */
export type SoundfontOptions = {
  packBase?: string;
  percussionBase?: string;
  /**
   * Reads a pack body. Carried beside the bases, not only handed to the
   * fallback player, because audio export renders through the same packs — so a
   * loader on one side only would let an exported file be voiced from different
   * bytes than the ones that were heard.
   */
  fetchPack?: (url: string) => Promise<string>;
};

/**
 * The player for this device. The native synth wherever there is one, scheduled
 * against the audio clock; otherwise the sample fallback, which decodes MP3
 * clips in JavaScript — slower to start and logged as a fallback.
 */
export function createNativeMusicPlayer(
  soundfont: SoundfontOptions,
): IMusicPlayer {
  const backend = createNativeSynthBackend();
  if (backend) {
    return new MusicPlayer(new SoundfontPlaybackEngine({ backend }));
  }
  return createSamplePlayer(soundfont);
}

/**
 * A score rendered to PCM through the sample packs — the whole of an audio
 * export short of encoding it. `renderEvents` (in music_player, via
 * `renderScoreWith`) decides what sounds; `renderSamples` (music_sample_engine)
 * voices it. music_io then encodes the PCM. Export stays on the sample packs on
 * every device, so an exported file sounds the same regardless of the live
 * engine.
 */
export function renderScoreAudio(
  score: Score,
  soundfont: SoundfontOptions,
): Promise<DecodedAudio> {
  return renderScoreWith(score, renderSamples(soundfont));
}
