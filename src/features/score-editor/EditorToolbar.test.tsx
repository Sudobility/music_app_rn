/**
 * The editing bar's controls do what their labels say.
 *
 * Worth testing at this level rather than by calling the library directly: the
 * bar's job is *wiring*, and every bug it has had has been a wiring bug — Copy
 * bound to `duplicateSelected` (which writes into the score) instead of
 * `copySelection` (which fills the clipboard), a chip that reads a value it
 * never writes, a control left live while the transport plays. Types catch
 * none of those, because both sides typecheck.
 */
/*
  `jest` is imported rather than taken from the globals: this repo's tsconfig
  declares vitest's globals (the other half of the suite runs under vitest), and
  loading both packages' global types makes `expect` two incompatible things.
  The runner still injects the globals; this only gives TypeScript a name it can
  resolve.
*/
import { jest } from '@jest/globals';
import { mirrorDevicePrefs } from '@sudobility/music_lib';
import { devicePrefs } from '@/config/useDevicePrefs';
import { act, fireEvent } from '@testing-library/react-native';
import {
  insertNoteAtCaret,
  defaultInsertPitch,
  setPickup,
} from '@sudobility/music_editing';
import {
  getMusicPosition,
  getMusicPositionSource,
  isNoteEvent,
} from '@sudobility/music_types';
import { renderWithApp, testDocument } from '@/test/render';
import type { MusicDocument } from '@/documents/document';
import { EditorToolbar } from './EditorToolbar';

// A tablet shows every control inline; a phone groups all but the note-entry
// essentials behind the "…" sheet, where these tests cannot reach them. The
// toolbar's arrangement is `useFormFactor`'s, so pin it (as `TransportBar.test`
// does); the phone grouping has its own coverage.
jest.mock('@sudobility/components-rn', () => ({
  ...(jest.requireActual('@sudobility/components-rn') as object),
  useFormFactor: () => 'tablet',
}));

// Showing the whole bar mounts the voice-record button, which reads the auth
// context for a token; a component test signs nobody in, so stand it in — the
// phone bar hid it in the "…" sheet, which is why this was never needed.
jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, siteAdmin: false, getToken: async () => null }),
}));

function setup(overrides: Partial<Parameters<typeof EditorToolbar>[0]> = {}) {
  const document = testDocument();
  const onLayoutModeChange = jest.fn();
  const onEnterLyrics = jest.fn();
  const onToggleInspector = jest.fn();
  const view = renderWithApp(
    <EditorToolbar
      document={document}
      layoutMode="page"
      onLayoutModeChange={onLayoutModeChange}
      onEnterLyrics={onEnterLyrics}
      onToggleInspector={onToggleInspector}
      inspectorVisible={false}
      {...overrides}
    />,
  );
  return {
    view,
    document,
    onLayoutModeChange,
    onEnterLyrics,
    onToggleInspector,
  };
}

/**
 * Writes a note and selects it, since a rest is not something Copy takes.
 *
 * Inside `act` because both writes are store changes the rendered bar
 * subscribes to: outside it React warns, and the render the assertion reads may
 * not have happened yet.
 */
function selectFirstNote(document: MusicDocument): void {
  const store = document.store;
  act(() => {
    insertNoteAtCaret(store, defaultInsertPitch(store));
    const score = store.getState().score!;
    const note =
      score.tracks[0].measures[0].voices[0].events.find(isNoteEvent)!;
    store
      .getState()
      .setSelection({ eventIds: [note.id], measureIds: [], trackIds: [] });
  });
}

describe('EditorToolbar', () => {
  /*
    Add Track asks before it acts. It used to add a blank track on the spot
    from an icon it shared with Add Bar, which left "Generate Track" nowhere to
    live — the whole reason this is a menu.
  */
  describe('add track', () => {
    it('opens a menu rather than adding a track outright', () => {
      const { view, document } = setup();
      const before = document.store.getState().score!.tracks.length;
      fireEvent.press(view.getByLabelText(/add track/i));
      expect(document.store.getState().score!.tracks).toHaveLength(before);
      // Each answer appears twice by design — once in the body, which says
      // what it does, and once as the button that does it.
      expect(view.getByRole('button', { name: 'Blank Track' })).toBeTruthy();
      expect(view.getByRole('button', { name: 'Generate Track' })).toBeTruthy();
    });

    it('adds a blank track when that is the answer', () => {
      const { view, document } = setup();
      const before = document.store.getState().score!.tracks.length;
      fireEvent.press(view.getByLabelText(/add track/i));
      act(() => {
        fireEvent.press(view.getByRole('button', { name: 'Blank Track' }));
      });
      expect(document.store.getState().score!.tracks).toHaveLength(before + 1);
    });

    it('hands the other answer to the generator', () => {
      const onGenerateTrack = jest.fn();
      const { view, document } = setup({ onGenerateTrack });
      const before = document.store.getState().score!.tracks.length;
      fireEvent.press(view.getByLabelText(/add track/i));
      fireEvent.press(view.getByRole('button', { name: 'Generate Track' }));
      expect(onGenerateTrack).toHaveBeenCalled();
      // The generator writes the track; the menu must not write one too.
      expect(document.store.getState().score!.tracks).toHaveLength(before);
    });

    it('still lists Generate Track when there is no generator, greyed', () => {
      // Listed rather than dropped: a menu whose entries come and go teaches
      // the reader nothing about where to find them.
      const { view } = setup();
      fireEvent.press(view.getByLabelText(/add track/i));
      const generate = view.getByRole('button', { name: 'Generate Track' });
      expect(generate.props.accessibilityState.disabled).toBe(true);
    });
  });

  it('toggles note input, which decides what a tap on a stave means', () => {
    const { view, document } = setup();
    expect(document.store.getState().noteInput).toBe(false);
    fireEvent.press(view.getByLabelText(/note input/i));
    expect(document.store.getState().noteInput).toBe(true);
  });

  it('zooms by a ratio and clamps at the limits', () => {
    const { view, document } = setup();
    fireEvent.press(view.getByLabelText(/zoom in/i));
    expect(document.store.getState().zoom).toBeCloseTo(1.25, 5);
    // Far more presses than the range holds: the clamp is the point.
    for (let i = 0; i < 30; i += 1)
      fireEvent.press(view.getByLabelText(/zoom out/i));
    expect(document.store.getState().zoom).toBe(0.25);
  });

  it('reports a layout mode change rather than holding one of its own', () => {
    const { view, onLayoutModeChange } = setup();
    fireEvent.press(view.getByLabelText(/continuous/i));
    expect(onLayoutModeChange).toHaveBeenCalledWith('continuous');
  });

  /*
    Copy, Cut, Paste and Delete are the long-press menu's now — see
    `ScoreActionsSheet.test.tsx`, which covers all four plus the Clear that
    joined them, and keeps the guard that Copy must not write into the score.
  */

  it('keeps lyric entry disabled until notes are selected on a voice track', () => {
    // Behind More actions, where the web bar keeps it: a real action, but not
    // one reached often enough to be worth permanent width on the bar.
    const { view, onEnterLyrics } = setup();
    fireEvent.press(view.getByLabelText(/more actions/i));
    fireEvent.press(view.getByLabelText(/enter lyrics/i));
    expect(onEnterLyrics).not.toHaveBeenCalled();
  });

  /*
    Six note values, five accidentals, five articulations, five ornaments and
    four quantize grids were twenty-five chips on one bar. Each is a picker
    now, exactly as the web draws them — one glyph on the trigger, the words in
    the sheet — and the thing worth pinning is that the trigger still *acts*
    rather than merely opening.
  */
  describe('the pickers', () => {
    it('arms a note value chosen from the duration sheet', () => {
      const { view, document } = setup();
      expect(document.store.getState().snapGrid).not.toBe('half');
      fireEvent.press(view.getByLabelText(/note duration/i));
      act(() => {
        fireEvent.press(view.getByLabelText('Half'));
      });
      expect(document.store.getState().snapGrid).toBe('half');
    });

    it('keeps the armed modifier when only the base changes', () => {
      // The web's `withBase`: choosing "quarter" while Dotted is on gives a
      // dotted quarter, which is what the six separate buttons did.
      const { view, document } = setup();
      fireEvent.press(view.getByLabelText(/^dotted$/i));
      fireEvent.press(view.getByLabelText(/note duration/i));
      act(() => {
        fireEvent.press(view.getByLabelText('Half'));
      });
      expect(document.store.getState().snapGrid).toBe('dotted-half');
    });

    it('leaves the accidental picker unavailable with nothing selected', () => {
      // Eleven controls act on the selection and quietly return when it is
      // empty. A control that invites a tap and gives no feedback is worse
      // than one that is plainly unavailable.
      const { view } = setup();
      expect(
        view.getByLabelText(/^accidental$/i).props.accessibilityState.disabled,
      ).toBe(true);
    });

    it('applies an accidental to the selection', () => {
      const { view, document } = setup();
      selectFirstNote(document);
      fireEvent.press(view.getByLabelText(/^accidental$/i));
      act(() => {
        fireEvent.press(view.getByLabelText('Flat'));
      });
      const score = document.store.getState().score!;
      const note =
        score.tracks[0].measures[0].voices[0].events.find(isNoteEvent)!;
      expect(note.pitch.accidental).toBe(-1);
    });
  });

  it('needs two notes for a mark that spans a run', () => {
    // A wedge over one note has nowhere to open to, and a slur over one note
    // means nothing — so both disable rather than doing nothing.
    const { view, document } = setup();
    selectFirstNote(document);
    expect(
      view.getByLabelText(/crescendo/i).props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      view.getByLabelText(/fermata/i).props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('switches the voice the next note is written into', () => {
    const { view, document } = setup();
    expect(document.store.getState().activeVoiceIndex).toBe(0);
    fireEvent.press(view.getByLabelText('Voice 2'));
    expect(document.store.getState().activeVoiceIndex).toBe(1);
  });

  /*
    The bar shows the mode a write will use and leaves the stored choice alone:
    the library's write paths read the effective mode themselves. It used to
    write the effective mode back from an effect, so a visit to a part that
    cannot stack lost Stack for good.
  */
  it('shows Replace on a part that cannot stack, keeping the stored Stack', () => {
    const { view, document } = setup();
    const store = document.store;
    act(() => store.getState().setEditMode('stack'));
    act(() => {
      const score = store.getState().score!;
      store.getState().setScore({
        ...score,
        tracks: score.tracks.map(track => ({ ...track, midiProgram: 73 })),
      });
    });
    expect(
      view.getByLabelText('Replace').props.accessibilityState.selected,
    ).toBe(true);
    expect(store.getState().editMode).toBe('stack');
  });

  it('toggles between written and concert pitch, as a device pref', () => {
    // The label names what tapping *does*, not the current state — so the two
    // names are two states of one control, not two controls. It writes the
    // device prefs, which the app mirrors into every open document's store.
    const { view, document } = setup();
    const unmirror = mirrorDevicePrefs(devicePrefs, document.store);
    try {
      expect(document.store.getState().pitchDisplay).toBe('concert');
      fireEvent.press(view.getByLabelText(/show written pitch/i));
      expect(devicePrefs.getState().pitchDisplay).toBe('written');
      expect(document.store.getState().pitchDisplay).toBe('written');
      fireEvent.press(view.getByLabelText(/show concert pitch/i));
      expect(document.store.getState().pitchDisplay).toBe('concert');
    } finally {
      unmirror();
    }
  });

  /*
    Insert Note steps past what it wrote (decision 4 of the parity plan, and
    music_editing's `insertDefaultNoteAtCaret`), so a second press continues the
    line instead of stacking onto the first.
  */
  it('writes Insert Note at the caret and steps past it', () => {
    const { view, document } = setup();
    act(() => getMusicPositionSource().moveTo(0));
    act(() => {
      // By role: the chip's `Group` carries the same label as the chip, so a
      // bare label match finds both the group and the button.
      fireEvent.press(view.getByRole('button', { name: 'Insert note' }));
    });
    const notes = document.store
      .getState()
      .score!.tracks[0].measures[0].voices[0].events.filter(isNoteEvent);
    expect(notes).toHaveLength(1);
    expect(getMusicPosition().reportedTick).toBe(notes[0].durationTicks);
  });

  /*
    The availability rules are music_editing's `selectToolbarAvailability`,
    shared with the web bar. The More menu is where this bar used to differ:
    only its Glissando entry knew about the transport, so Add Bar, Delete Bar
    and Enter Lyrics were live mid-playback and did nothing when chosen.
  */
  it('greys the More menu content entries while the transport plays', () => {
    const { view, document } = setup();
    act(() => document.store.setState({ state: 'playing' }));
    fireEvent.press(view.getByLabelText(/more actions/i));
    for (const name of [/insert bars/i, /^delete bar$/i, /enter lyrics/i]) {
      expect(view.getByLabelText(name).props.accessibilityState.disabled).toBe(
        true,
      );
    }
    // Going to a bar moves only the caret, which is not an edit.
    expect(
      view.getByLabelText(/go to bar/i).props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('goes to a bar by the number drawn, which skips a pickup', () => {
    /*
      `caretToBar` counted `index + 1`, so on a score opening with an anacrusis
      "bar 1" was the pickup — one bar early, disagreeing with the gutter. The
      sheet now hands its text to `goToBarFromInput`, which counts as drawn.
    */
    const { view, document } = setup();
    act(() => setPickup(document.store, 1));
    act(() => getMusicPositionSource().moveTo(0));
    fireEvent.press(view.getByLabelText(/more actions/i));
    act(() => {
      fireEvent.press(view.getByLabelText(/go to bar/i));
    });
    fireEvent.changeText(view.getByLabelText('Bar number'), '1');
    act(() => {
      fireEvent.press(view.getByRole('button', { name: 'Go' }));
    });
    const second = document.store.getState().score!.tracks[0].measures[1];
    expect(getMusicPosition().reportedTick).toBe(second.startTick);
  });
});

describe('the track info column', () => {
  afterEach(() => {
    act(() => devicePrefs.getState().setTrackInfo('full'));
  });

  it('switches between the whole column and the icons alone', () => {
    const { view } = setup();
    // The whole column until somebody says otherwise; the label names what
    // tapping does.
    const toIcons = view.getByLabelText('Instrument icons only');
    expect(toIcons.props.accessibilityState?.selected).toBe(false);
    fireEvent.press(toIcons);
    expect(devicePrefs.getState().trackInfo).toBe('icon');
    const toFull = view.getByLabelText('Full track info');
    expect(toFull.props.accessibilityState?.selected).toBe(true);
    fireEvent.press(toFull);
    expect(devicePrefs.getState().trackInfo).toBe('full');
  });
});
