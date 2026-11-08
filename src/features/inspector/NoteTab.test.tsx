/**
 * The selected note's properties.
 *
 * The tab says note values, bars and key names — never ticks or fifths.
 * "Duration 480" states the storage format; the reader is looking at a quarter
 * note. Those conversions live in music_lib's `music-vocabulary.ts`, because
 * they are music theory rather than panel code, and `durationNameForTicks`
 * answers null for a length no single notehead spells — which the picker shows
 * as Custom rather than relabelling as the nearest name.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import {
  changeDuration,
  insertNoteAtCaret,
  defaultInsertPitch,
} from '@sudobility/music_editing';
import { isNoteEvent } from '@sudobility/music_types';
import { renderWithApp, testDocument } from '@/test/render';
import type { MusicDocument } from '@/documents/document';

const { NoteTab } =
  require('@sudobility/music_ui_rn') as typeof import('@sudobility/music_ui_rn');

function withSelectedNote() {
  const document = testDocument();
  act(() => {
    insertNoteAtCaret(document.store, defaultInsertPitch(document.store));
    const score = document.store.getState().score!;
    const note =
      score.tracks[0].measures[0].voices[0].events.find(isNoteEvent)!;
    document.store
      .getState()
      .setSelection({ eventIds: [note.id], measureIds: [], trackIds: [] });
  });
  return document;
}

/** Two notes in a row on the first track, both selected. */
function withTwoSelectedNotes() {
  const document = testDocument();
  act(() => {
    insertNoteAtCaret(document.store, defaultInsertPitch(document.store), {
      advanceCaret: true,
    });
    insertNoteAtCaret(document.store, defaultInsertPitch(document.store));
    const score = document.store.getState().score!;
    const ids = score.tracks[0].measures[0].voices[0].events
      .filter(isNoteEvent)
      .map(n => n.id);
    document.store
      .getState()
      .setSelection({ eventIds: ids, measureIds: [], trackIds: [] });
  });
  return document;
}

function selectedNote(document: MusicDocument) {
  const score = document.store.getState().score!;
  const ids = document.store.getState().selection.eventIds;
  return score.tracks[0].measures[0].voices[0].events
    .filter(isNoteEvent)
    .find(n => ids.includes(n.id))!;
}

describe('NoteTab', () => {
  it('says so when nothing is selected, rather than rendering blank', () => {
    // A blank panel is indistinguishable from a broken one.
    const view = renderWithApp(<NoteTab document={testDocument()} />);
    expect(view.getByText(/select/i)).toBeTruthy();
  });

  it('names the note value rather than showing its tick count', () => {
    /*
      "Duration 480" states the storage format. The reader is looking at a
      quarter note, and the conversion is music theory — music_lib's, not this
      panel's.
    */
    const view = renderWithApp(<NoteTab document={withSelectedNote()} />);
    expect(view.queryByText('480')).toBeNull();
  });

  it('counts voices from 1, matching the toolbar', () => {
    // The same note used to read "Voice 1" on the bar and `0` in the panel.
    const view = renderWithApp(<NoteTab document={withSelectedNote()} />);
    expect(view.queryByText(/\bVoice 0\b/)).toBeNull();
  });

  /*
    The tab used to print a literal `1` for every note's voice, whatever voice
    it was actually in — a readout that is right by coincidence on the default
    track and wrong the moment anybody uses the second voice.
  */
  it("reads the note's real voice, not a hardcoded 1", () => {
    const document = withSelectedNote();
    act(() => {
      // A second voice on the same stave. The panel printed a literal `1`
      // whatever voice the note was in, which is right by coincidence on the
      // default track and wrong the moment anybody uses the second.
      document.store.getState().setActiveVoice(1);
      insertNoteAtCaret(document.store, defaultInsertPitch(document.store));
      const score = document.store.getState().score!;
      const second =
        score.tracks[0].measures[0].voices[1]?.events.find(isNoteEvent);
      if (second)
        document.store.getState().setSelection({
          eventIds: [second.id],
          measureIds: [],
          trackIds: [],
        });
    });
    const second =
      document.store.getState().score!.tracks[0].measures[0].voices[1];
    if (!second) return; // the store declined a second voice; nothing to pin
    const view = renderWithApp(<NoteTab document={document} />);
    /*
      By the field's value, not by loose text: voice is an input now — the
      panel could only *report* which voice a note was in, and moving a note
      between voices is how a second line on one stave is built.
    */
    const field = view.getByLabelText('Voice');
    expect(field).toBeTruthy();
    expect(view.getByDisplayValue('2')).toBeTruthy();
  });

  it('moves the note to another voice', () => {
    // The web panel has always been able to; this one could not.
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const before = document.store.getState().score;

    const field = view.getByLabelText('Voice');
    fireEvent.changeText(field, '2');
    // A draft: nothing moves until the field is left.
    expect(document.store.getState().score).toBe(before);
    fireEvent(field, 'blur');

    expect(document.store.getState().score).not.toBe(before);
  });

  it('offers velocity, which a dynamic does not overwrite', () => {
    /*
      A dynamic marks the *level*; the note's velocity is the deviation from
      it, so an accent inside a quiet passage stays an accent. The field was
      missing here entirely, which made that deviation uneditable on native.
    */
    const view = renderWithApp(<NoteTab document={withSelectedNote()} />);
    expect(view.getByLabelText(/velocity/i)).toBeTruthy();
  });

  it('offers the tie toggles', () => {
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    fireEvent(view.getByLabelText(/tie start/i), 'valueChange', true);
    expect(selectedNote(document).tieStart).toBe(true);
  });

  it('needs two notes for a slide, which is a span', () => {
    // A slide from a note to itself is nothing, so it disables rather than
    // doing nothing — the same rule the toolbar's slur and hairpins follow.
    const view = renderWithApp(<NoteTab document={withSelectedNote()} />);
    expect(
      view.getByLabelText(/slide/i).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('offers the grace-note conversion', () => {
    const view = renderWithApp(<NoteTab document={withSelectedNote()} />);
    expect(view.getByLabelText(/grace note/i)).toBeTruthy();
  });

  it('offers Replace Notes only where a project can be written back to', () => {
    // A local file has no row for a generation job to write into.
    const withoutProject = renderWithApp(
      <NoteTab document={withSelectedNote()} />,
    );
    expect(withoutProject.queryByLabelText(/replace notes/i)).toBeNull();

    const withProject = renderWithApp(
      <NoteTab document={withSelectedNote()} onReplace={() => {}} />,
    );
    expect(withProject.getByLabelText(/replace notes/i)).toBeTruthy();
  });

  it('writes a chord symbol as typed', () => {
    /*
      `C-7`, `Cmin7` and `Cm7` are one chord written three ways. The model keeps
      the string, so nothing a player writes is refused or silently rewritten.
    */
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const field = view.queryByLabelText(/chord/i);
    if (!field) return;
    fireEvent.changeText(field, 'Bb7#11');
    fireEvent(field, 'blur');
    expect(selectedNote(document).chordSymbol).toBe('Bb7#11');
  });

  it('commits velocity once, on blur, rather than per keystroke', () => {
    /*
      `NumberInput` committed on every change, so typing 100 wrote 1, then 10,
      then 100 — three undo entries and two velocities nobody asked for.
    */
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const field = view.getByLabelText('Velocity');
    fireEvent.changeText(field, '100');
    expect(selectedNote(document).velocity).not.toBe(100);
    fireEvent(field, 'blur');
    expect(selectedNote(document).velocity).toBe(100);
  });

  /*
    `setNotePitch` and `setFingering` answer whether they wrote anything, and a
    draft that wrote nothing goes back to what the note holds: a refused octave
    (outside a flute's compass here) must not stay on screen as though it had
    been applied.
  */
  it('puts a refused octave back to the stored one', () => {
    const document = withSelectedNote();
    act(() => {
      const score = document.store.getState().score!;
      document.store.getState().setScore({
        ...score,
        tracks: score.tracks.map(track => ({ ...track, midiProgram: 73 })),
      });
    });
    const before = selectedNote(document).pitch.octave;
    const view = renderWithApp(<NoteTab document={document} />);
    const field = view.getByLabelText('Octave');
    fireEvent.changeText(field, '1');
    act(() => {
      fireEvent(field, 'blur');
    });
    expect(selectedNote(document).pitch.octave).toBe(before);
    expect(view.getByLabelText('Octave').props.value).toBe(String(before));
  });

  it('puts a fingering that changed nothing back to the stored one', () => {
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const field = view.getByLabelText('Fingering');
    fireEvent.changeText(field, '   ');
    act(() => {
      fireEvent(field, 'blur');
    });
    expect(selectedNote(document).fingering).toBeUndefined();
    expect(view.getByLabelText('Fingering').props.value).toBe('');
  });

  /*
    The position is typed, as on the web: stating where a note sits exactly is
    the reason to have the field, and this tab could only report it. Both
    drafts commit together on blur through `tickForBarBeat`.
  */
  it('moves the note to a typed beat and bar', () => {
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const ppq = document.store.getState().score!.ppq;

    const beat = view.getByLabelText('Beat');
    fireEvent.changeText(beat, '3');
    expect(selectedNote(document)?.startTick).toBe(0);
    act(() => {
      fireEvent(beat, 'blur');
    });
    const moved = document.store
      .getState()
      .score!.tracks[0].measures[0].voices[0].events.find(isNoteEvent)!;
    expect(moved.startTick).toBe(2 * ppq);
    expect(view.getByLabelText('Beat').props.value).toBe('3');

    act(() => {
      document.store.getState().setSelection({
        eventIds: [moved.id],
        measureIds: [],
        trackIds: [],
      });
    });
    const bar = view.getByLabelText('Bar');
    fireEvent.changeText(bar, '2');
    act(() => {
      fireEvent(bar, 'blur');
    });
    const second = document.store.getState().score!.tracks[0].measures[1];
    expect(
      second.voices[0].events.find(e => isNoteEvent(e) && e.id === moved.id)
        ?.startTick,
    ).toBe(second.startTick + 2 * ppq);
  });

  it('puts a position that names no bar back to the stored one', () => {
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const bar = view.getByLabelText('Bar');
    fireEvent.changeText(bar, '999');
    act(() => {
      fireEvent(bar, 'blur');
    });
    expect(selectedNote(document).startTick).toBe(0);
    expect(view.getByLabelText('Bar').props.value).toBe('1');
  });

  /*
    Resetting the field is only half of it. A refused move leaves the tick
    where it was, so the field snaps back with nothing said — which reads as
    the panel having lost the keystroke rather than as the edit being refused.
    `moveNoteToTick` answers whether the move landed, and a refusal is a toast,
    the queue every other editing refusal here reaches.
  */
  it('says so when the move is refused, rather than snapping back silently', () => {
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const pushToast = jest.fn(() => 'toast');
    /*
      The refusal is stubbed rather than provoked, as in TrackTab's: the
      reachable refusal is the playback lock, which also disables the field,
      and what regressed is that the *result was discarded*.
    */
    act(() => {
      document.store.setState({ dispatchCommand: () => {}, pushToast });
    });

    const bar = view.getByLabelText('Bar');
    fireEvent.changeText(bar, '2');
    act(() => {
      fireEvent(bar, 'blur');
    });

    expect(pushToast).toHaveBeenCalledWith({
      message: expect.stringMatching(/could not be moved/),
      severity: 'warning',
    });
    expect(view.getByLabelText('Bar').props.value).toBe('1');
  });

  it('says nothing when there was nothing to commit', () => {
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const pushToast = jest.fn(() => 'toast');
    act(() => {
      document.store.setState({ pushToast });
    });

    const bar = view.getByLabelText('Bar');
    fireEvent.changeText(bar, '999');
    act(() => {
      fireEvent(bar, 'blur');
    });

    expect(pushToast).not.toHaveBeenCalled();
  });

  /*
    Return in a single-line field submits *and* blurs, and both land before
    React re-renders — so the commit ran twice against one stale tick. The
    second run recomputed the same target, `moveNoteToTick` found the note
    already there and answered false, and the panel announced that a move which
    had just succeeded could not be made. Both events are fired inside one
    `act` for that reason: separating them lets the re-seed run in between and
    hides it.
  */
  it('does not report a refusal when Return both submits and blurs', () => {
    const document = withSelectedNote();
    const view = renderWithApp(<NoteTab document={document} />);
    const pushToast = jest.fn(() => 'toast');
    act(() => {
      document.store.setState({ pushToast });
    });

    const bar = view.getByLabelText('Bar');
    fireEvent.changeText(bar, '2');
    act(() => {
      fireEvent(bar, 'submitEditing');
      fireEvent(bar, 'blur');
    });

    expect(pushToast).not.toHaveBeenCalled();
    const second = document.store.getState().score!.tracks[0].measures[1];
    const [id] = document.store.getState().selection.eventIds;
    expect(
      second.voices[0].events.find(e => isNoteEvent(e) && e.id === id)
        ?.startTick,
    ).toBe(second.startTick);
    expect(view.getByLabelText('Bar').props.value).toBe('2');
  });

  it('offers chord symbol and fingering for exactly one note', () => {
    /*
      Both are free text belonging to one notehead: a draft seeded from the
      first of two notes would overwrite the second with it on blur.
    */
    const document = withTwoSelectedNotes();
    const view = renderWithApp(<NoteTab document={document} />);
    expect(view.queryByLabelText('Chord symbol')).toBeNull();
    expect(view.queryByLabelText('Fingering')).toBeNull();
    // A position typed over two notes would stack them on one tick.
    expect(view.queryByLabelText('Bar')).toBeNull();
  });

  it('reads a disagreeing duration as Mixed', () => {
    const document = withTwoSelectedNotes();
    act(() => {
      const [a] = document.store.getState().selection.eventIds;
      document.store.getState().setSelection({
        eventIds: [a!],
        measureIds: [],
        trackIds: [],
      });
      changeDuration(document.store, 'eighth');
      const score = document.store.getState().score!;
      const ids = score.tracks[0].measures[0].voices[0].events
        .filter(isNoteEvent)
        .map(n => n.id);
      document.store
        .getState()
        .setSelection({ eventIds: ids, measureIds: [], trackIds: [] });
    });
    const view = renderWithApp(<NoteTab document={document} />);
    expect(view.getAllByText('Mixed').length).toBeGreaterThan(0);
  });

  it('locks every field while the transport plays', () => {
    // Decision 4 of the parity plan: the whole Note tab, as on the web.
    const document = withSelectedNote();
    act(() => {
      document.store.setState({ state: 'playing' });
    });
    const view = renderWithApp(<NoteTab document={document} />);
    expect(view.getByLabelText('Velocity').props.editable).toBe(false);
    expect(view.getByLabelText('Bar').props.editable).toBe(false);
    expect(view.getByLabelText('Beat').props.editable).toBe(false);
    expect(
      view.getByLabelText(/grace note/i).props.accessibilityState.disabled,
    ).toBe(true);
  });
});
