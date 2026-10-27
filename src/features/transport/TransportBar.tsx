/**
 * The playback bar, mirroring the web app's — control for control.
 *
 * Same controls in the same order, drawn with the same glyphs: reset (pause
 * and go to start), play/pause, loop, metronome, the bar:beat
 * readout, the tempo, the speed, the master volume, the position scrubber and
 * the timecode, with the load indicator last so it never shifts the rest.
 *
 * **The glyphs are shared, as data.** `GoToStartIcon` and `MetronomeIcon` live
 * in `NOTATION_ICONS` and are drawn by both apps, so a metronome here is the
 * web's metronome rather than a lookalike.
 *
 * **Every position-driven readout is its own subscriber.** Position arrives
 * about thirty times a second; reading it here would re-render the whole bar —
 * and, through it, the notation — at that rate. The web app learned this by
 * profiling (124 renders in 4s) and split `MeasureBeatReadout`,
 * `PositionScrubber` and `Timecode` out for exactly this reason. Same split
 * here, same reason.
 *
 * **Tempo is the one control that edits the score.** Loop, metronome, speed,
 * volume and seeking are real-time device control and go to the player; the BPM
 * field is persisted with the score and goes through `commitOpeningTempoText`
 * (music_editing, the web field's own rule: blank is no change, the rest rounded
 * and bounded to the tempos the validator accepts).
 *
 * **Every control reaches the player through the binding, and every setting is
 * read back from the store.** `bindPlayer` writes loop, metronome, speed, volume
 * and the load state into the document store as it tells the player, the way
 * the web adapter writes them into the app store — so this bar holds none of
 * them in `useState` any more. It used to, which meant a second document's bar
 * showed the metronome off while the one player still ticked, and the loop it
 * set was always the whole score even with bars selected.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useStore } from 'zustand';

import { useTranslation } from 'react-i18next';
import { Input, MIN_TOUCH_TARGET, Text } from '@sudobility/components-rn';
import {
  ArrowPathRoundedSquareIcon,
  CubeTransparentIcon,
  PauseIcon,
  PlayIcon,
} from 'react-native-heroicons/solid';
import {
  barBeatForTick,
  formatBarBeat,
  formatTimecode,
  PLAYBACK_SPEEDS,
  TempoMap,
  transportExtent,
} from '@sudobility/music_types';
import {
  commitOpeningTempoText,
  openingTempoBpm,
} from '@sudobility/music_editing';
import type { Score } from '@sudobility/music_types';
import { NotationIcon } from '@/components/icons/NotationIcon';
import { useNotationInk } from '@/components/icons/notation-ink';
import { LevelSlider } from '@/components/controls/LevelSlider';
import { ToolbarSelect } from '@/components/controls/ToolbarSelect';
import { SynthLoadIndicator } from './SynthLoadIndicator';
import { AudioOutputSelect } from './AudioOutputSelect';
import { getMusicPlayerIfInitialized } from '@sudobility/music_player/core';
import { usePlaybackReadiness } from '@sudobility/music_player/react';
import { IconButton } from '@/components/layout/IconButton';
import { trackButtonClick } from '@/analytics';
import { useOnPositionFrame, usePositionReadout } from './usePositionReadout';
import type { PositionSource } from './usePositionReadout';
import type { TransportBinding, TransportStoreApi } from './usePlayerBinding';

const ICON_SIZE = 18;

export type TransportBarProps = {
  score: Score;
  transport: TransportBinding;
  /** The document's store: settings are read from it, the tempo written to it. */
  store: TransportStoreApi;
  /**
   * Whether the piano keyboard below is collapsed, and how to toggle it.
   *
   * The keyboard's own bar used to carry this. Optional so the transport still
   * renders standalone in a test, and so a host with no keyboard under it
   * simply does not offer the control rather than offering a dead one.
   */
  keyboardCollapsed?: boolean;
  onToggleKeyboard?: () => void;
  /**
   * Whether the Spatial 3D stage is showing in the notation's place, and how
   * to toggle it. Optional for the same reasons as the keyboard's: a host
   * without the view does not offer a dead control.
   */
  spatialActive?: boolean;
  onToggleSpatial?: () => void;
  /**
   * Keeps Play off while something else owns the score — a generation job
   * writing it live. Everything else on the bar still works: reset, the
   * position controls, loop, metronome, tempo and volume change nothing the
   * job is about to replace.
   */
  playDisabled?: boolean;
  /**
   * On a page nobody edits — a published score. The tempo is the one control
   * on this bar that changes the *score* rather than the playback, so it is
   * shown as a readout, not the button that opens a field; everything else
   * (play, position, loop, metronome, speed, volume) is playback and stays.
   * The web's bar has the same switch, for the same page.
   */
  readOnly?: boolean;
};

export function TransportBar({
  score,
  transport,
  store,
  keyboardCollapsed,
  onToggleKeyboard,
  spatialActive,
  onToggleSpatial,
  playDisabled = false,
  readOnly = false,
}: TransportBarProps) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const loop = useStore(store, s => s.loopRange !== null);
  const metronome = useStore(store, s => s.metronome);
  const speed = useStore(store, s => s.tempoMultiplier);
  const masterVolume = useStore(store, s => s.masterVolume);
  const playing = useStore(store, s => s.state) === 'playing';
  const [tempoDraft, setTempoDraft] = useState('');
  const [editingTempo, setEditingTempo] = useState(false);

  /*
    To the end of the *longest* track, floored at one tick — music_types' rule,
    shared with the web bar. This one measured the first track only, so a score
    whose first part stopped early could not be scrubbed to its last notes.
  */
  const { maxTick, totalSeconds } = useMemo(
    () => transportExtent(score),
    [score],
  );
  /*
    Rounded for display as well as on commit: a score can arrive carrying a
    fractional tempo from a MIDI file or a detected one from audio import, and
    "119.87421 BPM" in the transport is noise, not precision.
  */
  const currentBpm = openingTempoBpm(score);

  // Score-time seconds via the same TempoMap the playback engine schedules
  // with, so this readout advances exactly 1 second per wall-clock second at
  // 1x speed — a live check that playback runs at the score's real tempo.
  const tempoMap = useMemo(
    () => new TempoMap([...score.tempoMap], score.ppq),
    [score],
  );

  /*
    Drawn from a draft so the fill follows the finger, as the web's does; the
    gain itself is set on every movement, since a master fader that only took
    effect on release would be useless.
  */
  const [volumeDraft, setVolumeDraft] = useState(masterVolume);
  useEffect(() => setVolumeDraft(masterVolume), [masterVolume]);

  const commitTempo = (): void => {
    setEditingTempo(false);
    commitOpeningTempoText(store, tempoDraft);
  };

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t('transport.transport')}
      className="bg-card flex-row items-center gap-1 px-2 py-1"
    >
      <IconButton
        label={t('transport.goToStart')}
        onPress={() => {
          // Reset: stop where you are and go back to the beginning.
          transport.pause();
          transport.goToStart();
        }}
      >
        <NotationIcon name="GoToStartIcon" color={ink.foreground} />
      </IconButton>
      <PlayPauseButton
        playing={playing}
        disabled={playDisabled}
        onPress={() => {
          trackButtonClick(playing ? 'pause' : 'play');
          void transport.togglePlay();
        }}
      />

      {/*
        Loop and metronome are toggles, and they say so the way every other
        toggle in this app does — a filled chip and `selected` reported to the
        accessibility layer. Tinting the glyph alone said it only to somebody
        looking at it.

        The loop is the web's rule, through the binding: the selection when
        there is one, else the whole score. This bar always looped the whole
        score, so looping four selected bars could not be done here.
      */}
      <IconButton
        label={t('transport.toggleLoop')}
        selected={loop}
        onPress={transport.toggleLoop}
      >
        <ArrowPathRoundedSquareIcon
          size={ICON_SIZE}
          color={loop ? ink.primary : ink.foreground}
        />
      </IconButton>
      <IconButton
        label={t('transport.toggleMetronome')}
        selected={metronome}
        onPress={() => transport.setMetronome(!metronome)}
      >
        {/*
          The accent when it is on, not `onPrimary` — that was white, and it
          was legible only against the grey chip this control no longer has.
        */}
        <NotationIcon
          name="MetronomeIcon"
          color={metronome ? ink.primary : ink.foreground}
        />
      </IconButton>

      <MeasureBeatReadout score={score} transport={transport} />

      {/*
        The BPM, edited in place. A button that becomes a field, like the web's:
        the number is read far more often than it is changed, and a permanent
        text input in a bar of icon buttons reads as somewhere to type rather
        than as a readout.
      */}
      {readOnly ? (
        // No score edit reachable on a read-only host: a readout, not the
        // button that opens the field below.
        <View
          accessibilityLabel={t('transport.tempoBpm')}
          className="justify-center px-2"
          style={{ minHeight: MIN_TOUCH_TARGET }}
        >
          <Text className="text-foreground text-sm tabular-nums">
            {`${currentBpm} BPM`}
          </Text>
        </View>
      ) : editingTempo ? (
        <Input
          keyboardType="number-pad"
          accessibilityLabel={t('transport.tempoBpm')}
          value={tempoDraft}
          autoFocus
          onChangeText={setTempoDraft}
          onBlur={commitTempo}
          onSubmitEditing={commitTempo}
          className="w-20"
        />
      ) : (
        <IconButton
          label={t('transport.tempoBpm')}
          hint={t('transport.editTempo')}
          onPress={() => {
            setTempoDraft(String(currentBpm));
            setEditingTempo(true);
          }}
        >
          <Text className="text-foreground text-sm tabular-nums">
            {`${currentBpm} BPM`}
          </Text>
        </IconButton>
      )}

      <ToolbarSelect
        label={t('transport.speed')}
        hint={t('transport.speedMultiplier')}
        options={PLAYBACK_SPEEDS.map(value => ({
          value: String(value),
          label: `${value}x`,
        }))}
        value={String(speed)}
        onChange={value => transport.setTempoMultiplier(Number(value))}
      >
        <Text className="text-foreground text-sm">{`${speed}x`}</Text>
      </ToolbarSelect>

      {/*
        `w-32`, not `w-24`. This width was picked for a 20px-tall drawn slider
        whose thumb was 12px across; a `UISlider`'s is 28px with a shadow, so
        at the old width the knob very nearly filled its own track and the
        control read as a button rather than as a fader.
      */}
      <AudioOutputSelect />

      <View className="w-32 flex-row items-center gap-1">
        <Text className="text-foreground text-sm">{t('transport.volume')}</Text>
        <LevelSlider
          className="flex-1"
          label={t('transport.masterVolume')}
          value={volumeDraft}
          onChange={next => {
            setVolumeDraft(next);
            // Continuous: a gain must be audible while the finger moves.
            transport.setMasterVolume(next);
          }}
        />
      </View>

      <PositionScrubber maxTick={maxTick} transport={transport} />
      <Timecode
        transport={transport}
        tempoMap={tempoMap}
        maxTick={maxTick}
        totalSeconds={totalSeconds}
      />
      {/*
        The keyboard toggle, rightmost.

        It used to sit on a bar of the keyboard's own, above it — a whole row
        for one button, and the control that *reveals* the keyboard was inside
        the thing it reveals. Here it is a transport control like the metronome
        beside it: something you turn on while playing rather than something you
        edit. The web app puts it in the same place.
      */}
      {/*
        The Spatial toggle, before the keyboard's: the same on/off idiom, in
        the same place the web bar puts it, with the same solid
        `CubeTransparentIcon`.
      */}
      {onToggleSpatial ? (
        <IconButton
          label={
            spatialActive ? t('editor.hideSpatial') : t('editor.showSpatial')
          }
          selected={spatialActive === true}
          fill
          onPress={onToggleSpatial}
        >
          <CubeTransparentIcon
            size={ICON_SIZE}
            color={spatialActive ? ink.onPrimary : ink.foreground}
          />
        </IconButton>
      ) : null}
      {onToggleKeyboard ? (
        <IconButton
          label={
            keyboardCollapsed
              ? t('editor.showKeyboard')
              : t('editor.hideKeyboard')
          }
          selected={!keyboardCollapsed}
          // An on/off switch for the panel below, drawn like the web's: red
          // while the keyboard is showing.
          fill
          onPress={onToggleKeyboard}
        >
          {/*
            The same drawing the web toolbar shows: `NOTATION_ICONS` holds it,
            both apps replay it, so a keyboard here *is* the keyboard there
            rather than a lookalike. A glyph's colour is passed on native —
            `currentColor` is an SVG idea react-native-svg does not resolve — so
            it comes from the theme through `useNotationInk`.
          */}
          <NotationIcon
            name="PianoKeysIcon"
            color={keyboardCollapsed ? ink.foreground : ink.onPrimary}
          />
        </IconButton>
      ) : null}

      {/*
        Last, and self-effacing: it renders nothing once the engine is ready,
        which is every press of Play after the first.
      */}
      <SynthLoadIndicator store={store} />
    </View>
  );
}

/**
 * Play/Pause, and the only control that knows the synth may not be ready.
 *
 * Its own subscriber for the reason the position readouts are: the load
 * reports per percent, and read at the bar's top level each of those would
 * re-render every control in the row. Here it touches one button.
 */
function PlayPauseButton({
  playing,
  disabled = false,
  onPress,
}: {
  playing: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  /*
    Whether the engine is up is the player's own readiness, read and driven
    by music_player's `usePlaybackReadiness` — the same hook the web's Play
    button uses — not the store's load state. The store only hears about a
    load that something started, and on a screen opened cold nothing had:
    the button sat enabled over an engine that had not begun, and the press
    that should have played started the load instead. The hook starts it the
    moment this button is on screen, so the spinner is the first thing shown
    and Play the second, on every path in. Only the first bring-up blocks:
    once up, the engine stays `ready` for the session.
  */
  const preparing =
    usePlaybackReadiness(getMusicPlayerIfInitialized()) === 'preparing';
  const label = preparing
    ? t('transport.preparingUnknown')
    : playing
      ? t('transport.pause')
      : t('transport.play');
  return (
    // The button's own spinner rather than the library `Spinner`, which
    // draws a fixed blue in both themes: this one is the theme's ink.
    <IconButton
      label={label}
      loading={preparing}
      disabled={disabled}
      onPress={onPress}
    >
      {playing ? (
        <PauseIcon size={ICON_SIZE} color={ink.foreground} />
      ) : (
        <PlayIcon size={ICON_SIZE} color={ink.foreground} />
      )}
    </IconButton>
  );
}

/**
 * Bar and beat. Its own subscriber, so a position report re-renders these two
 * numbers and nothing else.
 */
export const MeasureBeatReadout = memo(function MeasureBeatReadout({
  score,
  transport,
}: {
  score: Score;
  transport: PositionSource;
}) {
  const { t } = useTranslation();
  const readout = usePositionReadout(transport, tick =>
    formatBarBeat(barBeatForTick(score, tick)),
  );
  return (
    // The name sits on a wrapper: this package's `Text` styles text and takes
    // no accessibility props of its own.
    <View accessibilityLabel={t('transport.measureBeat')} className="w-20">
      <Text className="text-foreground text-center text-base tabular-nums">
        {/* Shared with the web transport: this app floored the beat inline
            and the web one did not, so the same position rendered "1.1" here
            and "1.1.3333333333333333" there. */}
        {readout}
      </Text>
    </View>
  );
});

/** Elapsed time over total. Also its own subscriber, for the same reason. */
const Timecode = memo(function Timecode({
  transport,
  tempoMap,
  maxTick,
  totalSeconds,
}: {
  transport: PositionSource;
  tempoMap: TempoMap;
  maxTick: number;
  totalSeconds: number;
}) {
  const { t } = useTranslation();
  const elapsed = usePositionReadout(transport, tick =>
    formatTimecode(tempoMap.ticksToSeconds(Math.min(tick, maxTick))),
  );
  return (
    <View accessibilityLabel={t('transport.time')} className="w-32">
      <Text className="text-foreground text-right text-sm tabular-nums">
        {`${elapsed} / ${formatTimecode(totalSeconds)}`}
      </Text>
    </View>
  );
});

/**
 * Where you are, and where you can drag to.
 *
 * Seeks on release rather than continuously: a seek rebuilds the engine's
 * lookahead, and doing that per frame while a finger moves is what makes a
 * scrubber stutter. That is the one place this deliberately differs from the
 * web, which seeks on every event because a mouse drag is cheap.
 *
 * Painted from a local draft while dragging, so the fill follows the finger
 * rather than waiting for the engine's next position report.
 */
const PositionScrubber = memo(function PositionScrubber({
  maxTick,
  transport,
}: {
  maxTick: number;
  transport: PositionSource & Pick<TransportBinding, 'seek'>;
}) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  // Per frame, not per report — and never from inside the report; see
  // `useOnPositionFrame` for the render-phase update this used to trip.
  useOnPositionFrame(transport, setTick);

  return (
    <View className="min-w-24 flex-1">
      <LevelSlider
        label={t('transport.position')}
        value={dragging ?? Math.min(tick, maxTick)}
        min={0}
        max={maxTick}
        step={1}
        onChange={setDragging}
        onSlidingComplete={next => {
          setDragging(null);
          transport.seek(next);
        }}
      />
    </View>
  );
});
