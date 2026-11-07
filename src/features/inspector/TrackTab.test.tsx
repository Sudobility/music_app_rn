/**
 * The one track editor.
 *
 * There used to be two — a panel beside the keyboard and this tab — which is
 * how they came to disagree about whether program 0 was "Piano" or "Acoustic
 * Grand Piano". This one **reflects and invokes only**: every edit is a
 * `track-slice` action, and the rules those enforce are rules about a score,
 * which is why they live in music_editing rather than here.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import {
  addBlankTrack,
  defaultInsertPitch,
  insertNoteAtCaret,
} from '@sudobility/music_editing';
import { isNoteEvent } from '@sudobility/music_types';
import { renderWithApp, testDocument } from '@/test/render';
import type { MusicDocument } from '@/documents/document';

const { TrackTab } = require('@sudobility/music_ui_rn') as typeof import('@sudobility/music_ui_rn');

function setup(tracks = 1) {
  const document = testDocument();
  act(() => {
    for (let i = 1; i < tracks; i += 1) addBlankTrack(document.store);
  });
  const view = renderWithApp(<TrackTab document={document} />);
  return { view, document };
}

function activeTrack(document: MusicDocument) {
  const state = document.store.getState();
  const id = state.activeTrackId;
  const score = state.score!;
  return score.tracks.find(t => t.id === id) ?? score.tracks[0];
}

describe('TrackTab', () => {
  /*
    `setTrackInstrument` refuses rather than half-applying when the part is
    wider than the instrument can play, and this panel once discarded that
    result — so a refused change looked exactly like one that happened. It then
    printed the sentence under the picker, because this app had no toasts; it
    has them now, and a refusal is a toast on the web, so it is one here too.
  */
  it('reports a refused instrument as an error toast', () => {
    const { view, document } = setup();
    const pushToast = jest.fn(() => 'toast');
    /*
      The refusal is stubbed rather than provoked. Building a part wider than
      an instrument's compass takes a score fixture that says nothing about
      this panel; what regressed here is that the *result was discarded*, and
      that is exactly what this drives.
    */
    act(() => {
      document.store.setState({
        setTrackInstrument: () => ({
          ok: false,
          reason: 'outOfRange',
          instrumentName: 'Clavinet',
        }),
        pushToast,
      });
    });

    fireEvent.press(view.getByText('Acoustic Grand Piano'));
    fireEvent.press(view.getByText('Clavinet'));

    expect(pushToast).toHaveBeenCalledWith({
      message: expect.stringMatching(/Clavinet cannot cover/),
      severity: 'error',
    });
    expect(view.queryByText(/cannot cover/i)).toBeNull();
  });

  /*
    The notation marks a note its instrument cannot play in its own colour,
    which says something is wrong; this line says what, beside the instrument
    picker — the other half of the fix. The web's Track tab has always had it.
  */
  it('counts the notes its instrument cannot play', () => {
    const { view, document } = setup();
    const outside = /outside this instrument's range/;
    expect(view.queryByText(outside)).toBeNull();

    act(() => {
      const store = document.store;
      insertNoteAtCaret(store, defaultInsertPitch(store));
      const score = store.getState().score!;
      store.getState().setScore({
        ...score,
        tracks: score.tracks.map(track => ({
          ...track,
          midiProgram: 73, // a flute, which cannot reach C1
          measures: track.measures.map(measure => ({
            ...measure,
            voices: measure.voices.map(voice => ({
              ...voice,
              events: voice.events.map(event =>
                isNoteEvent(event)
                  ? { ...event, pitch: { ...event.pitch, octave: 1 } }
                  : event,
              ),
            })),
          })),
        })),
      });
    });

    expect(
      view.getByText(
        /^1 note is outside this instrument's range of [A-G][#b]*\d-[A-G][#b]*\d and cannot be played on it\.$/,
      ),
    ).toBeTruthy();
  });

  it('puts a declined rename back to the name the track has', () => {
    // `renameTrack` refuses a blank name; the field must not keep showing one.
    const { view, document } = setup();
    const name = activeTrack(document).name;
    const field = view.getByLabelText(/name/i);
    fireEvent.changeText(field, '   ');
    fireEvent(field, 'blur');
    expect(activeTrack(document).name).toBe(name);
    expect(view.getByLabelText(/name/i).props.value).toBe(name);
  });

  it('shows the active track without needing one to be chosen', () => {
    /*
      `selectActiveTrackId` falls back to the first track, which is what makes
      "one track is always active" true with no reconciliation step. Reading
      the raw field gives null on a fresh score and the panel renders nothing.
    */
    const { view } = setup();
    expect(view.getByLabelText(/name/i)).toBeTruthy();
  });

  it('commits a rename on blur, not per keystroke', () => {
    // Otherwise every letter is its own undo entry.
    const { view, document } = setup();
    const field = view.getByLabelText(/name/i);
    fireEvent.changeText(field, 'Cello');
    expect(activeTrack(document).name).not.toBe('Cello');
    fireEvent(field, 'blur');
    expect(activeTrack(document).name).toBe('Cello');
  });

  /*
    On a percussion track `midiProgram` addresses a *kit*, not an instrument —
    Brush is kit 40 and program 40 is Violin. This panel offered the melodic
    catalogue on every track, so a drum part reported itself as whatever
    instrument happened to share its number.
  */
  it('offers drum kits on a percussion track, not instruments', () => {
    const { view, document } = setup();
    const track = activeTrack(document);
    act(() => {
      document.store
        .getState()
        .setTrackClef(track.id, 'percussion', 'Change clef');
    });
    expect(view.getByLabelText(/drum kit/i)).toBeTruthy();
  });

  it('offers instruments on a pitched track', () => {
    const { view } = setup();
    expect(view.getByLabelText(/^instrument$/i)).toBeTruthy();
    expect(view.queryByLabelText(/drum kit/i)).toBeNull();
  });

  it('sets the clef the part opens in', () => {
    const { view, document } = setup();
    expect(view.getByLabelText(/^clef$/i)).toBeTruthy();
    expect(activeTrack(document).clef).toBeDefined();
  });

  it('refuses to delete the last track, because the store refuses', () => {
    // `canDeleteTrack` is the store's own rule, asked rather than restated —
    // a score with no tracks is not a score.
    const { view } = setup();
    expect(
      view.getByLabelText(/delete track/i).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('withdraws Delete Track once the other tracks are removed elsewhere', () => {
    /*
      The rule is subscribed to rather than read once during render, so the
      button follows a track removed from somewhere other than this tab.
      (Today other subscriptions happen to re-render the tab as well; this pins
      the behaviour, not which subscription delivers it.)
    */
    const { view, document } = setup(2);
    const state = document.store.getState();
    const active = activeTrack(document);
    const other = state.score!.tracks.find(t => t.id !== active.id)!;
    expect(
      view.getByLabelText(/delete track/i).props.accessibilityState.disabled,
    ).toBe(false);
    act(() => {
      document.store.getState().removeTrack(other.id, 'Delete track');
    });
    expect(
      view.getByLabelText(/delete track/i).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('asks before deleting a track it can delete', () => {
    const { view, document } = setup(2);
    const before = document.store.getState().score!.tracks.length;
    fireEvent.press(view.getByLabelText(/delete track/i));
    // The confirm has not been given, so nothing is gone yet.
    expect(document.store.getState().score!.tracks).toHaveLength(before);
  });

  it('keeps mix controls live, because mixing is not editing', () => {
    /*
      Volume, pan, mute and solo are `kind: 'mix'` and reach the engine live —
      muting a part while listening is how an arrangement gets listened to.
      Only *content* controls go disabled while the transport plays.
    */
    const { view, document } = setup();
    act(() => {
      // Straight onto the slice, as music_editing's own tests do: the
      // transport state is reported *by the engine*, so there is no action to
      // set it — which is the point, since nothing in the UI may claim to be
      // playing when the engine is not.
      document.store.setState({ state: 'playing' });
    });
    const mute = view.getByLabelText(/mute/i);
    expect(mute.props.accessibilityState?.disabled).not.toBe(true);
  });
});
