/**
 * The collapsible keyboard.
 *
 * Collapsed by default, and that is a decision rather than an oversight: the
 * transport and the status strip must be reachable before an optional input
 * surface is, and on a phone the keyboard takes a third of the screen.
 */
import { Profiler } from 'react';
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import { allNotes, changeTrackPropsCommand } from '@sudobility/music_types';
import type { SoundingNote } from '@sudobility/music_types';
import { insertNoteAtCaret } from '@sudobility/music_editing';
import type { IMusicPlayer } from '@sudobility/music_player';
import {
  getAppServices,
  installTestAppServices,
  resetAppServices,
} from '@/config/initialize';
import { renderWithApp, testDocument } from '@/test/render';
import type { MusicDocument } from '@/documents/document';
import { KeyboardPanel } from './KeyboardPanel';
import { PianoKeyboard } from './PianoKeyboard';
import { StyleSheet } from 'react-native';
import { PITCH_LABEL_GUTTER } from '@sudobility/music_drawing';

function setup(collapsed = true) {
  const view = renderWithApp(
    <KeyboardPanel document={testDocument()} collapsed={collapsed} />,
  );
  return { view };
}

/**
 * The panel, opened and laid out.
 *
 * Nothing draws until the container has been measured (`useContainerSize`), and
 * a test renderer measures nothing — so the layout has to be reported by hand
 * or there is no key to point at.
 */
function openKeyboard(document: MusicDocument) {
  const view = renderWithApp(
    <KeyboardPanel document={document} collapsed={false} />,
  );
  const measured = view.getByTestId('piano-keyboard-panel').children[0];
  if (measured === undefined || typeof measured === 'string')
    throw new Error('the panel drew no measurable container');
  act(() => {
    fireEvent(measured, 'layout', {
      nativeEvent: { layout: { width: 900, height: 120 } },
    });
  });
  return view;
}

/** A player whose auditions can be counted. */
function recordingPlayer() {
  installTestAppServices();
  const silent = getAppServices().player;
  const noteOn = jest.fn();
  const noteOff = jest.fn();
  installTestAppServices({
    player: { ...silent, noteOn, noteOff } as IMusicPlayer,
  });
  return { noteOn, noteOff };
}

describe('KeyboardPanel', () => {
  it('draws nothing at all when collapsed', () => {
    /*
      It used to be a bar of its own carrying the show/hide control — a whole
      row for one button, and the control that reveals the keyboard sat inside
      the thing it reveals, so the row had to survive collapsing to stay
      reachable. The control is the transport bar's now, so there is nothing
      down here that has to stay on screen.
    */
    const { view } = setup(true);
    // The wrapper the test renderer provides is all that is left; the panel
    // itself contributes nothing.
    const tree = view.toJSON();
    expect(Array.isArray(tree) ? tree : (tree?.children ?? null)).toBeNull();
  });

  it('renders the keys once opened', () => {
    const { view } = setup(false);
    expect(view.toJSON()).not.toBeNull();
  });

  it('does not render for a note sounding on another track', () => {
    // The player reports every track's notes; the keyboard shows one. Each
    // used to hand React a new set and re-render all the keys.
    let publish: (notes: readonly SoundingNote[]) => void = () => undefined;
    installTestAppServices();
    const player = getAppServices().player;
    installTestAppServices({
      player: {
        ...player,
        onSounding: (listener: (notes: readonly SoundingNote[]) => void) => {
          publish = listener;
          return () => undefined;
        },
      } as IMusicPlayer,
    });
    try {
      const document = testDocument();
      const trackId = document.store.getState().score!.tracks[0]!.id;
      const commits = jest.fn();
      renderWithApp(
        <Profiler id="keyboard" onRender={commits}>
          <KeyboardPanel document={document} collapsed={false} />
        </Profiler>,
      );
      const mine: SoundingNote = { noteId: 'a', trackId, midi: 60 };
      act(() => publish([mine]));
      commits.mockClear();

      act(() => publish([mine, { noteId: 'b', trackId: 'other', midi: 67 }]));

      expect(commits).not.toHaveBeenCalled();
    } finally {
      resetAppServices();
    }
  });
});

/*
  The size is music_drawing's, the same on every platform: white keys 44 wide
  however wide the panel, the panel as tall as `AppLayout` says, and a
  keyboard wider than the panel scrolled rather than squeezed.
*/
describe('size', () => {
  afterEach(() => resetAppServices());

  it('draws 44-wide white keys at the height it is given, in a scroller', () => {
    const view = renderWithApp(
      <KeyboardPanel document={testDocument()} collapsed={false} height={80} />,
    );
    const scroller = view.getByTestId('piano-keyboard-panel').children[0];
    if (scroller === undefined || typeof scroller === 'string')
      throw new Error('no scroller');
    act(() => {
      fireEvent(scroller, 'layout', {
        nativeEvent: { layout: { width: 300, height: 80 } },
      });
    });
    const board = view.UNSAFE_getByType(PianoKeyboard);
    expect(board.props.height).toBe(80);
    const whites = board.props.keys.filter(
      (k: { isBlack: boolean }) => !k.isBlack,
    );
    expect(whites[0].width).toBe(44);
    expect(board.props.width).toBe(whites.length * 44);
    expect(scroller.props.horizontal).toBe(true);
  });

  it('hides the scrollbar and draws a thin indicator when the keys overflow', () => {
    // The panel is laid out 900 wide; a piano is 2288.
    const view = openKeyboard(testDocument());
    const scroller = view.getByTestId('piano-keyboard-panel').children[0];
    if (scroller === undefined || typeof scroller === 'string')
      throw new Error('no scroller');
    expect(scroller.props.showsHorizontalScrollIndicator).toBe(false);
    const indicator = view.getByTestId('piano-keyboard-scroll-indicator');
    expect(StyleSheet.flatten(indicator.props.style).height).toBe(3);
  });

  it('scrolls from the strip under the keys, not by a finger on the keys', () => {
    // On a touch screen a finger on the keys plays them, so the scroll view's
    // own dragging is off; the strip (labels plus `KEYBOARD_SCROLL_STRIP`) is
    // what scrolls. The test platform is a touch one.
    const view = openKeyboard(testDocument());
    const scroller = view.getByTestId('piano-keyboard-panel').children[0];
    if (scroller === undefined || typeof scroller === 'string')
      throw new Error('no scroller');
    expect(scroller.props.scrollEnabled).toBe(false);

    const strip = view.getByTestId('piano-keyboard-scroll-strip');
    expect(StyleSheet.flatten(strip.props.style).height).toBe(
      PITCH_LABEL_GUTTER,
    );
    expect(typeof strip.props.onResponderMove).toBe('function');
  });
});

/*
  A key is press-and-hold, and assistive technology cannot hold anything: on
  react-native-macos an activation arrives as `onAccessibilityTap` alone, so
  before this a VoiceOver user could focus a key, hear its name, and never
  sound or write a note with it.

  The tap runs the ordinary press and release rather than a path of its own —
  the same range refusal, the same audition, the same `playKeyGroup` — so the
  caret advance, the chord toggle and the edit lock come with it. The one thing
  it cannot bring is a held time, and that is what the toolbar's note value is
  for.
*/
describe('an assistive activation', () => {
  afterEach(() => resetAppServices());

  /** The key for a midi note, by the accessible name `keyboardKeys` gives it. */
  function key(view: ReturnType<typeof openKeyboard>, name: string) {
    return view
      .getAllByRole('button')
      .find(k => k.props.accessibilityLabel === name)!;
  }

  it("auditions the pitch and writes it at the toolbar's note value", () => {
    const { noteOn } = recordingPlayer();
    const document = testDocument();
    // Deliberately not the default quarter, so the assertion can tell the
    // toolbar's value apart from a length invented for the tap.
    act(() => document.store.getState().setSnapGrid('half'));
    const ppq = document.store.getState().score!.ppq;
    const view = openKeyboard(document);

    act(() => {
      fireEvent(key(view, 'C4'), 'accessibilityTap');
    });

    expect(noteOn).toHaveBeenCalledWith(60, expect.anything(), false);
    const written = allNotes(document.store.getState().score!);
    expect(written).toHaveLength(1);
    expect(written[0]!.durationTicks).toBe(ppq * 2);
  });

  it('does neither on a key the instrument cannot play', () => {
    // The drawn key already ignores a press; the activation has to as well, or
    // it is the one way past the compass.
    const { noteOn } = recordingPlayer();
    const document = testDocument();
    const store = document.store;
    /*
      A part holding a note its own instrument cannot reach — which is the case
      the drawn-but-inert key exists for, and what an import produces. Written
      as a piano and the program swapped underneath it, because
      `setTrackInstrument` refuses a swap that would strand a note rather than
      leaving one outside the compass.
    */
    act(() =>
      insertNoteAtCaret(
        store,
        { step: 'C', accidental: 0, octave: 2 },
        { duration: 'quarter' },
      ),
    );
    const trackId = store.getState().score!.tracks[0]!.id;
    act(() =>
      store
        .getState()
        .dispatchCommand(
          changeTrackPropsCommand(
            trackId,
            { midiProgram: 40, instrumentName: 'Violin' },
            'test',
          ),
        ),
    );
    const view = openKeyboard(document);
    expect(key(view, 'C2').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    /*
      Called rather than fired, and deliberately.

      The keys themselves withhold `onAccessibilityTap` from an out-of-range
      key — `PianoKeyboard.test` pins that — and the test renderer will not
      dispatch to a disabled element either, so firing the event here would
      pass whatever this panel did with the midi. What is being checked is the
      panel's own refusal: handed the key anyway, it neither sounds nor writes.
    */
    const tap = view.UNSAFE_getByType(PianoKeyboard).props.onKeyTap!;
    act(() => tap(36)); // C2, below a violin

    expect(noteOn).not.toHaveBeenCalled();
    // Still only the note that was there: nothing was added at the caret.
    expect(allNotes(store.getState().score!)).toHaveLength(1);
  });

  it('still auditions while the transport plays, and still writes nothing', () => {
    // Exactly what a press does today: the score is immutable while playing,
    // and auditioning a key is not an edit.
    const { noteOn } = recordingPlayer();
    const document = testDocument();
    const view = openKeyboard(document);
    act(() => document.store.setState({ state: 'playing' }));

    act(() => {
      fireEvent(key(view, 'C4'), 'accessibilityTap');
    });

    expect(noteOn).toHaveBeenCalledWith(60, expect.anything(), false);
    expect(allNotes(document.store.getState().score!)).toHaveLength(0);
  });
});
