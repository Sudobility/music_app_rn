/**
 * React Native composition boundary. `music_lib` supplies platform-free
 * business rules; this harness supplies document state, playback bindings,
 * codecs, drawing, and native-facing packages.
 */
export * from '@sudobility/music_lib-core';
export * from '@sudobility/music_editing';
export * from '@sudobility/music_codecs';
export * from '@sudobility/music_drawing';
export * from '@sudobility/music_io';
export * from '@sudobility/music_player';
export { PlaybackBus } from '@sudobility/music_player/core';

export * from './services/library-copy';
export * from './services/errors';
