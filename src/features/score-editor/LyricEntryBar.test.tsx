/**
 * Typing words under a melody.
 *
 * The rules here are the reason this is a bar and not a property field, and
 * every one of them is invisible to types. **Space** ends a word; **hyphen**
 * ends a syllable *within* one, which is what draws the trailing hyphen and
 * fills MusicXML's `<syllabic>`; the join is *derived* from those keystrokes
 * rather than asked for, because a writer knows they are mid-word.
 *
 * The rules are music_editing's (`lyricEntryStep`, tested there). The native
 * bar watches the *text* rather than key events, because a typed space on a
 * phone is a character in the field and not a key anything can cancel — so what
 * these cover is that watching the text reaches the same rules the web's key
 * handler does, including a separator typed anywhere in the syllable.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import {
  insertNoteAtCaret,
  defaultInsertPitch,
} from '@sudobility/music_editing';
import { isNoteEvent, trackNotesInOrder } from '@sudobility/music_types';
import type { NoteEvent } from '@sudobility/music_types';
import { renderWithApp, testDocument } from '@/test/render';
import { LyricEntryBar } from '@sudobility/music_ui_rn';
import type { MusicDocument } from '@/documents/document';

/** Writes `count` notes so there is a line to sing under. */
function withNotes(count: number) {
  const document = testDocument();
  act(() => {
    for (let i = 0; i < count; i += 1) {
      insertNoteAtCaret(document.store, defaultInsertPitch(document.store), {
        advanceCaret: true,
      });
    }
  });
  const score = document.store.getState().score!;
  const notes = trackNotesInOrder(score, score.tracks[0].id).filter(
    isNoteEvent,
  );
  return { document, notes };
}

function lyricsOf(document: MusicDocument): (string | undefined)[] {
  const score = document.store.getState().score!;
  return trackNotesInOrder(score, score.tracks[0].id)
    .filter(isNoteEvent)
    .map((n: NoteEvent) => n.lyric?.text);
}

function syllabicOf(document: MusicDocument): (string | undefined)[] {
  const score = document.store.getState().score!;
  return trackNotesInOrder(score, score.tracks[0].id)
    .filter(isNoteEvent)
    .map((n: NoteEvent) => n.lyric?.syllabic);
}

function setup(count = 4) {
  const { document, notes } = withNotes(count);
  const onClose = jest.fn();
  const view = renderWithApp(
    <LyricEntryBar
      store={document.store}
      notes={notes}
      startIndex={0}
      onClose={onClose}
    />,
  );
  return { view, document, onClose };
}

describe('LyricEntryBar', () => {
  it('a trailing space ends a word and moves on', () => {
    const { view, document } = setup();
    const field = view.getByLabelText('Syllable');
    fireEvent.changeText(field, 'twinkle ');
    fireEvent.changeText(field, 'twinkle ');
    expect(lyricsOf(document).slice(0, 2)).toEqual(['twinkle', 'twinkle']);
  });

  it('a trailing hyphen ends a syllable inside a word, and the join is derived', () => {
    /*
      "beau-ti-ful" over three notes: begin, middle, end. Nobody is asked for
      the join — it follows from which key ended each syllable, which is the
      whole point of typing through the line.
    */
    const { view, document } = setup();
    const field = view.getByLabelText('Syllable');
    fireEvent.changeText(field, 'beau-');
    fireEvent.changeText(field, 'ti-');
    fireEvent.changeText(field, 'ful ');
    expect(lyricsOf(document).slice(0, 3)).toEqual(['beau', 'ti', 'ful']);
    expect(syllabicOf(document).slice(0, 3)).toEqual([
      'begin',
      'middle',
      'end',
    ]);
  });

  it('a separator anywhere in the syllable ends it, as the key does on the web', () => {
    /*
      This bar used to honour a separator only at the end, so a space typed with
      the cursor inside a word was a character here and a word break on the web.
      One keystroke, one meaning: `splitLyricSeparator` finds it anywhere, and
      the syllable is the text without it.
    */
    const { view, document } = setup();
    const field = view.getByLabelText('Syllable');
    fireEvent.changeText(field, 'be au');
    expect(lyricsOf(document)[0]).toBe('beau');
    expect(view.getByText(/2.*4/)).toBeTruthy();
  });

  it('Return writes the syllable and stops', () => {
    const { view, document, onClose } = setup();
    const field = view.getByLabelText('Syllable');
    fireEvent.changeText(field, 'last');
    fireEvent(field, 'submitEditing');
    expect(lyricsOf(document)[0]).toBe('last');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the last note has been sung', () => {
    // There is nowhere left to advance to, so staying open would leave a bar
    // that swallows every keystroke.
    const { view, onClose } = setup(1);
    fireEvent.changeText(view.getByLabelText('Syllable'), 'end ');
    expect(onClose).toHaveBeenCalled();
  });

  it('steps back to a syllable already written and shows it', () => {
    /*
      Read from the *store*, not the notes array — that array is a snapshot
      from when entry began, so stepping back over a word just typed showed an
      empty field until this looked at the live score.
    */
    const { view } = setup();
    const field = view.getByLabelText('Syllable');
    fireEvent.changeText(field, 'first ');
    fireEvent.press(view.getByLabelText('Previous syllable'));
    expect(view.getByLabelText('Syllable').props.value).toBe('first');
  });

  it('says which note of how many is being sung', () => {
    const { view } = setup(4);
    expect(view.getByText(/1.*4/)).toBeTruthy();
  });
});
