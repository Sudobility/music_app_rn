/**
 * The keyboard, bound to a document.
 *
 * Pressing a key auditions it through the player and nothing else — no caret
 * move, no transport change. On release the whole group goes to `playKeyGroup`,
 * which is music_editing's: it decides whether the keys join a chord, replace a
 * selected note, or enter at the caret, and turns the held time into a note
 * value. That rule used to live inside the web app's keyboard component, which
 * is precisely why a second keyboard would have had to copy it.
 *
 * Keys pressed together are one group: a chord is keys that overlap in time, so
 * the group closes when the last finger lifts rather than the first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  auditionVoiceFor,
  chordSelection,
  pitchToMidi,
} from '@sudobility/music_types';
import type { SoundingNote, UUID } from '@sudobility/music_types';
import {
  Animated,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useStore } from 'zustand';
import {
  EMPTY_GROUP,
  playKeyGroup,
  pressKey,
  releaseKey,
  selectActiveTrackId,
  selectSelectedNotes,
} from '@sudobility/music_editing';
import { midiIsInRange } from '@sudobility/music_types';
import {
  DARK_RENDER_THEME,
  KEYBOARD_MAX_HEIGHT,
  LIGHT_RENDER_THEME,
  keyboardKeys,
  KEYBOARD_SCROLL_INDICATOR_HEIGHT,
  keyboardScrollIndicator,
  keyboardScrollStart,
  KineticScroller,
} from '@sudobility/music_drawing';
import { getAppServices } from '@/config/initialize';
import { useTheme } from '@/config/ThemeContext';
import type { MusicDocument } from '@/documents/document';
import { PianoKeyboard } from './PianoKeyboard';
import { useContainerSize } from '@sudobility/music_ui_rn';

import {
  litKeys,
  playingPitchesForTrack,
  samePitchSet,
} from '@sudobility/music_drawing';
import type { KeyGroup } from '@sudobility/music_types';

/**
 * How long an assistive activation sounds for.
 *
 * A press auditions for as long as the finger is down; an activation is an
 * instant, so there is nothing to hold it open and the note has to be given a
 * length of its own. Unrelated to what gets *written*, which is the toolbar's
 * note value — this is only long enough to be heard.
 */
const TAP_AUDITION_MS = 300;

export type KeyboardPanelProps = {
  document: MusicDocument;
  /** Collapsed hides the keys and leaves the header, as the web panel does. */
  /**
   * Whether the panel is collapsed.
   *
   * Only to skip drawing when it is: the *control* is the transport bar's now,
   * so this panel no longer offers one and takes no `onToggle`.
   */
  collapsed: boolean;
  /**
   * The panel's whole height, label gutter included — music_drawing's
   * `keyboardPanelHeight` of the room the score and the keyboard share, which
   * only `AppLayout` can measure. `keyboardKeys` takes the gutter out of it.
   */
  height?: number;
};

export function KeyboardPanel({
  document,
  collapsed,
  height = KEYBOARD_MAX_HEIGHT,
}: KeyboardPanelProps) {
  const { size, onLayout, measured } = useContainerSize();
  const [sounding, setSounding] = useState<ReadonlySet<number>>(NO_PITCHES);
  /** What `sounding` holds, readable from the player's callback without a render. */
  const shownSounding = useRef(sounding);
  const activeTrackId = useStore(document.store, selectActiveTrackId);
  const transportState = useStore(document.store, s => s.state);
  const pitchDisplay = useStore(document.store, s => s.pitchDisplay);
  const { resolved } = useTheme();
  const theme = resolved === 'dark' ? DARK_RENDER_THEME : LIGHT_RENDER_THEME;

  /**
   * The group being played. A ref, not state: it changes on every touch and
   * nothing renders from it — putting it in state would re-render the whole
   * keyboard on each press.
   */
  const group = useRef<KeyGroup>(EMPTY_GROUP);
  /**
   * The keys a finger is holding, drawn pressed. State rather than the group
   * ref because this *is* drawn — the native keyboard showed no held key at
   * all, where the web's always has.
   */
  const [held, setHeld] = useState<ReadonlySet<number>>(NO_PITCHES);
  /**
   * Auditions still ringing from an assistive activation, so unmounting can
   * silence them — nothing else ever switches them off.
   */
  const soundingTaps = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const timer of soundingTaps.current) clearTimeout(timer);
      soundingTaps.current.clear();
    },
    [],
  );

  useEffect(() => {
    const player = getAppServices().player;
    /*
      The active track's sounding notes, not every track's.

      This lit whatever was sounding anywhere, so on a multi-track score the
      keys flickered with parts the reader cannot see — the keyboard shows one
      track. Same rule and same reasoning as the notation's playing colour, and
      `playingPitchesForTrack` is where it lives so the two agree.
    */
    return player.onSounding(notes => {
      const next = playingPitchesForTrack(notes, activeTrackId);
      // Nothing to do when no key of this track moved: the player reports
      // every track's notes, and a new set each time re-rendered all the keys
      // for notes this keyboard does not show. Compared before `setSounding`
      // rather than inside an updater, which React still renders to evaluate.
      if (samePitchSet(shownSounding.current, next)) return;
      shownSounding.current = next;
      setSounding(next);
    });
  }, [activeTrackId]);

  /*
    What is drawn pressed is music_drawing's `litKeys`, the web keyboard's rule:
    the active track's sounding pitches **only while playing** — the engine
    clears sounding notes on stop but not on pause, so without the gate a paused
    chord stayed lit here — plus the keys held down.

    Fed from the kept set rather than the raw notes, and memoized on it: the
    kept set only changes identity when one of this track's keys does, so the
    lit set does too, and a note on another part still renders nothing.
  */
  const lit = useMemo(
    () =>
      litKeys(
        asSounding(sounding, activeTrackId),
        activeTrackId,
        transportState,
        held,
      ),
    [sounding, activeTrackId, transportState, held],
  );

  /*
    The pitches of the one selected chord, so the keys can show what is in it.

    `chordSelection` is the same rule `playKeyGroup` applies when deciding
    whether a press adds to a chord or writes a new note — asked here so the
    keyboard shows the state that rule is about, rather than the reader having
    to press a key to find out.
  */
  const selectedNotes = useStore(document.store, selectSelectedNotes);
  const selectedMidis = useMemo(() => {
    const chord = chordSelection(selectedNotes);
    return new Set<number>(
      (chord?.notes ?? []).map(note => pitchToMidi(note.pitch)),
    );
  }, [selectedNotes]);

  const track = useStore(document.store, s =>
    s.score?.tracks.find(t => t.id === activeTrackId),
  );
  /*
    What a pressed key sounds as — music_types' `auditionVoiceFor`, the web
    keyboard's call. The clef is as load-bearing as the program: it decides
    whether that number is an instrument or a drum kit, and a percussion address
    GM defines no kit at resolves to the kit whose region holds it, as playback
    does.
  */
  const { program, isPercussion } = auditionVoiceFor(track);

  /**
   * The keys, their size, names and label rows — music_drawing's
   * `keyboardKeys`, the web keyboard's own call.
   *
   * It folds in the range (the instrument's compass widened to every note the
   * track holds, keys outside the compass marked, through the track rather
   * than `midiProgram` alone since a percussion track's program is a kit), the
   * naming, the label gutter, and the lettering of a transposing part read in
   * written pitch. Its white keys are `WHITE_KEY_WIDTH` everywhere: centred in
   * a wider panel, scrolled in a narrower one.
   */
  const keyboard = useMemo(
    () => keyboardKeys({ height, track, pitchDisplay }),
    [height, track, pitchDisplay],
  );
  const { playable } = keyboard;

  /**
   * A key went down. Answers whether it took — the compass refusal is stated
   * here once, and an assistive activation reads it rather than repeating it.
   */
  const onKeyDown = useCallback(
    (midi: number): boolean => {
      // Out of the instrument's compass: neither sounded nor written.
      if (playable && !midiIsInRange(midi, playable)) return false;
      group.current = pressKey(group.current, midi, Date.now());
      setHeld(current => new Set(current).add(midi));
      // Audition only: `noteOn` touches no transport state.
      getAppServices().player.noteOn(midi, program, isPercussion);
      return true;
    },
    [program, isPercussion, playable],
  );

  /**
   * The key is no longer down.
   *
   * `timed` is whether there was a hold to measure at all: a finger lifting
   * has one, an assistive activation has none. Handing `heldMs: null` over is
   * what makes the second write the toolbar's note value, and it is the same
   * call either way — a second write path here would be a second copy of the
   * caret advance, the chord toggle and the edit lock to keep in step.
   */
  const release = useCallback(
    (midi: number, timed: boolean) => {
      setHeld(current => {
        if (!current.has(midi)) return current;
        const next = new Set(current);
        next.delete(midi);
        return next;
      });
      const { group: next, finished } = releaseKey(
        group.current,
        midi,
        Date.now(),
      );
      group.current = next;
      // Only once the last finger lifts. `playKeyGroup` decides the rest —
      // whether these join a chord, replace a selected note or enter at the
      // caret, and what note value the held time comes to.
      if (!finished) return;
      playKeyGroup(
        document.store,
        timed ? finished : { ...finished, heldMs: null },
      );
    },
    [document],
  );

  const onKeyUp = useCallback(
    (midi: number) => {
      getAppServices().player.noteOff(midi);
      release(midi, true);
    },
    [release],
  );

  /*
    An assistive activation: one event, no press and no release.

    It runs the press and the release the ordinary gesture runs — the same
    range refusal, the same audition, the same `playKeyGroup` — so nothing
    about what a key does is stated twice. The two differences are forced by
    the event's shape rather than chosen: there is no held time, so the note
    takes the toolbar's value, and there is no moment the finger lifts, so the
    audition is switched off on a timer instead. Without that timer the note
    would be stopped in the instant it started and a VoiceOver user would hear
    nothing at all — which is most of what an audition is for.
  */
  const onKeyTap = useCallback(
    (midi: number) => {
      // The compass refusal is `onKeyDown`'s, asked rather than restated: a
      // key the instrument cannot play sounds nothing and writes nothing here
      // too.
      if (!onKeyDown(midi)) return;
      release(midi, false);
      const timer = setTimeout(() => {
        soundingTaps.current.delete(timer);
        getAppServices().player.noteOff(midi);
      }, TAP_AUDITION_MS);
      soundingTaps.current.add(timer);
    },
    [onKeyDown, release],
  );

  const scroller = useRef<ScrollView>(null);
  /*
    Where the keyboard is scrolled to, for the indicator under the strip —
    drawn in place of the platform's scrollbar, which is hidden: a full bar of
    chrome across a panel 160 high, for something a drag in the strip already
    does.
  */
  const [scrollX, setScrollX] = useState(0);

  /*
    Drag-scrolling, from the strip under the keys (`labelGutter` in
    music_drawing — the labels and the scroll strip, which no key covers).

    On a touch screen it is the only way to scroll: the scroll view's own
    dragging is off there, because a finger on the keys plays them, and a
    glissando that turned into a scroll would be neither. On macOS and Windows
    the scroll view keeps its trackpad and wheel scrolling, and the strip is
    what a mouse drags, which no scroll view there does by itself.

    With momentum, as a touch screen scrolls — music_drawing's
    `KineticScroller`, the web keyboard's too: it keeps going after the finger
    lets go, slowing down, and springs back from past either end. Android does
    not scroll past an end, so the overscroll is drawn by shifting the
    content (`overshoot`, an animated value, so a frame does not re-render).
  */
  const overshoot = useRef(new Animated.Value(0)).current;
  const geometry = useRef({ view: size.width, content: keyboard.width });
  geometry.current = { view: size.width, content: keyboard.width };
  const kinetic = useMemo(
    () =>
      new KineticScroller({
        max: () =>
          Math.max(0, geometry.current.content - geometry.current.view),
        viewport: () => geometry.current.view,
        apply: position => {
          const max = Math.max(
            0,
            geometry.current.content - geometry.current.view,
          );
          const x = Math.min(Math.max(position, 0), max);
          scroller.current?.scrollTo({ x, animated: false });
          overshoot.setValue(x - position);
          setScrollX(x);
        },
      }),
    [overshoot],
  );
  useEffect(() => () => kinetic.stop(), [kinetic]);

  /*
    A keyboard wider than the panel opens on its middle, as a narrower one is
    centred — again whenever its width changes, which a new instrument's range
    does. Not on every render: a reader who scrolled to the bass keeps it.
  */
  useEffect(() => {
    if (!measured) return;
    kinetic.jumpTo(keyboardScrollStart(size.width, keyboard.width));
  }, [measured, size.width, keyboard.width, kinetic]);

  // A trackpad or wheel scroll (macOS, Windows): the next drag starts there.
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (kinetic.active) return;
      kinetic.sync(event.nativeEvent.contentOffset.x);
      setScrollX(event.nativeEvent.contentOffset.x);
    },
    [kinetic],
  );

  const strip = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A scroll view asking for the touch mid-drag does not get it.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => kinetic.grab(),
        onPanResponderMove: (_event, gesture) => kinetic.drag(gesture.dx),
        onPanResponderRelease: () => kinetic.release(),
        onPanResponderTerminate: () => kinetic.release(),
      }),
    [kinetic],
  );

  /*
    Nothing at all when collapsed.

    This used to be a bar of its own carrying the show/hide control, which cost
    a whole row for one button — and put the control that *reveals* the keyboard
    inside the thing it reveals, so the row had to survive collapsing in order
    to stay reachable. The control is the transport bar's now, directly above,
    so there is nothing left down here that has to stay on screen.
  */
  if (collapsed) return null;

  const indicator = measured
    ? keyboardScrollIndicator(size.width, keyboard.width, scrollX)
    : null;

  return (
    // `testID` so the panel is addressable as a whole: its keys are not drawn
    // until it has been measured, and a test renderer measures nothing, so
    // there is no key to point at when asserting where the panel sits.
    <View testID="piano-keyboard-panel" className="border-border border-t">
      <ScrollView
        ref={scroller}
        horizontal
        onLayout={onLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        scrollEnabled={POINTER_SCROLLS}
        showsHorizontalScrollIndicator={false}
        style={{ height }}
        // Grows to the panel's width so a keyboard narrower than it can be
        // centred; a wider one is wider than this and simply scrolls.
        contentContainerStyle={styles.centred}
        bounces={false}
        keyboardShouldPersistTaps="always"
      >
        {measured ? (
          <Animated.View
            style={{
              width: keyboard.width,
              height,
              transform: [{ translateX: overshoot }],
            }}
          >
            <PianoKeyboard
              keys={keyboard.keys}
              width={keyboard.width}
              height={height}
              theme={theme}
              lit={lit}
              selected={selectedMidis}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onKeyTap={onKeyTap}
            />
            <View
              testID="piano-keyboard-scroll-strip"
              style={[styles.strip, { height: keyboard.labelGutter }]}
              {...strip.panHandlers}
            />
          </Animated.View>
        ) : null}
      </ScrollView>
      {indicator ? (
        <View
          testID="piano-keyboard-scroll-indicator"
          pointerEvents="none"
          className="bg-muted-foreground absolute rounded-full opacity-50"
          style={{
            bottom: 2,
            left: indicator.left,
            width: indicator.width,
            height: KEYBOARD_SCROLL_INDICATOR_HEIGHT,
          }}
        />
      ) : null}
    </View>
  );
}

const NO_PITCHES: ReadonlySet<number> = new Set();

/**
 * Whether the scroll view scrolls by itself: on macOS and Windows, by trackpad
 * and wheel. Off on a touch screen, where its dragging would take a finger
 * meant for the keys — the strip scrolls there.
 */
const POINTER_SCROLLS = Platform.OS === 'macos' || Platform.OS === 'windows';

const styles = StyleSheet.create({
  centred: { flexGrow: 1, justifyContent: 'center' },
  // Over the labels, which take no touches of their own.
  strip: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 },
});

/** The kept pitch set, in the shape `litKeys` reads: already this track's. */
function asSounding(
  pitches: ReadonlySet<number>,
  trackId: UUID | null,
): SoundingNote[] {
  if (!trackId) return [];
  return [...pitches].map(midi => ({ noteId: '', trackId, midi }));
}
