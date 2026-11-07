/**
 * The Measure tab writes what its labels say.
 *
 * Every field here is a flag or an enum with a near neighbour it can be crossed
 * with — `coda` and `toCoda` are different bars, `repeatStart` and `repeatEnd`
 * are independent rather than a span, a clef change on bar 1 goes to the *track*
 * rather than the measure. All of those typecheck either way round, and all of
 * them are invisible on inspection: the score simply plays differently.
 */
import { act, fireEvent } from '@testing-library/react-native';
import { addBlankTrack } from '@sudobility/music_editing';
import { renderWithApp, testDocument } from '@/test/render';
import { MeasureTab } from '@sudobility/music_ui_rn';
import type { MusicDocument } from '@/documents/document';

/** Selects a bar by index, which is what the gutter does on a tap. */
function selectBar(document: MusicDocument, index: number) {
  act(() => {
    const score = document.store.getState().score!;
    const measure = score.tracks[0].measures[index];
    document.store.getState().selectMeasures([measure.id]);
  });
}

function setup(barIndex = 1) {
  const document = testDocument();
  selectBar(document, barIndex);
  const view = renderWithApp(<MeasureTab document={document} />);
  return { view, document };
}

function measureAt(document: MusicDocument, index: number) {
  return document.store.getState().score!.tracks[0].measures[index];
}

describe('MeasureTab', () => {
  /*
    A pickup is a *length*, and this field used to be a switch that always wrote
    one beat — so a three-beat anacrusis could be written on the web and not
    here, and a score that already had one showed a toggle whose next touch
    would have shortened it.
  */
  it('offers a pickup in beats, and writes the one picked', () => {
    const { view, document } = setup(0);
    fireEvent.press(view.getByLabelText(/pickup/i));
    // Every length shorter than the bar: a full-length pickup is a bar.
    expect(
      view.queryAllByText(/beat/).map(node => node.props.children),
    ).toEqual(['1 beat', '2 beats', '3 beats']);

    fireEvent.press(view.getByText('3 beats'));
    const bar = measureAt(document, 0);
    expect(bar.pickup).toBe(true);
    // Three beats of a 4/4 bar, in ticks.
    expect(bar.durationTicks).toBe(document.store.getState().score!.ppq * 3);
  });

  it('sets the segno without touching the coda', () => {
    // They are separate places on purpose: the bar you leave from is not the
    // bar the coda begins at, and a bar can carry both.
    const { view, document } = setup();
    fireEvent(view.getByLabelText(/segno/i), 'valueChange', true);
    expect(measureAt(document, 1).segno).toBe(true);
    expect(measureAt(document, 1).coda).toBeUndefined();
  });

  it('sets the two repeat flags independently', () => {
    // Not a span: a `:|` with no matching `|:` repeats from the start of the
    // piece, which is a real marking rather than an error to prevent.
    const { view, document } = setup();
    fireEvent(view.getByLabelText(/repeat ends/i), 'valueChange', true);
    expect(measureAt(document, 1).repeatEnd).toBe(true);
    expect(measureAt(document, 1).repeatStart).toBeUndefined();
  });

  it('offers Inherit on a bar that is not the first', () => {
    const { view } = setup(1);
    expect(view.getByLabelText(/clef/i)).toBeTruthy();
  });

  it('parses an ending list, and clears on nonsense', () => {
    const { view, document } = setup();
    const field = view.getByLabelText(/ending/i);
    fireEvent.changeText(field, '1, 2');
    fireEvent(field, 'blur');
    expect(measureAt(document, 1).endingNumbers).toEqual([1, 2]);

    fireEvent.changeText(field, 'first time');
    fireEvent(field, 'blur');
    // Absent rather than empty: no volta is a bar with no bracket, and storing
    // `[]` would be a bracket over nothing.
    expect(measureAt(document, 1).endingNumbers ?? []).toEqual([]);
  });

  it('shows the tempo in force rather than a blank', () => {
    // Bar 2 sets no tempo of its own; the field still has to say 120.
    const { view } = setup(1);
    expect(view.getByLabelText(/tempo/i).props.value).toBe('120');
  });

  it('names the bar by its number in the heading', () => {
    // `barNumberAt`, never `index + 1`: a pickup has an index and no number.
    const { view } = setup(1);
    expect(view.getByText('Bar 2')).toBeTruthy();
  });

  /*
    The clef picker used to resolve the clef in force from the *active* track
    and write the change onto it — so selecting bar 2 of the second part while
    the first was active changed the first part's clef. `setClefAtMeasure`
    works the track out from the bar itself.
  */
  it("writes a clef change onto the bar's own track, not the active one", () => {
    const document = testDocument();
    act(() => {
      addBlankTrack(document.store);
      const score = document.store.getState().score!;
      document.store.getState().setActiveTrack(score.tracks[0].id);
      document.store
        .getState()
        .selectMeasures([score.tracks[1].measures[1].id]);
    });
    const view = renderWithApp(<MeasureTab document={document} />);
    fireEvent.press(view.getByLabelText('Clef from here'));
    fireEvent.press(view.getByText('Bass'));
    const score = document.store.getState().score!;
    expect(score.tracks[1].measures[1].clef).toBe('bass');
    expect(score.tracks[0].measures[1].clef).toBeUndefined();
  });

  it('writes nothing when the tempo field is left untouched', () => {
    /*
      The field shows the tempo in force; blurring it used to write that value
      as an event of this bar's own, turning an inherited tempo into a change
      nobody made (and an undo entry with it).
    */
    const { view, document } = setup(1);
    const before = document.store.getState().score!.tempoMap.length;
    fireEvent(view.getByLabelText(/tempo here/i), 'blur');
    expect(document.store.getState().score!.tempoMap).toHaveLength(before);
  });

  it('clamps a typed tempo to what a score can hold', () => {
    const { view, document } = setup(1);
    const field = view.getByLabelText(/tempo here/i);
    fireEvent.changeText(field, '9000');
    fireEvent(field, 'blur');
    const bar = measureAt(document, 1);
    const event = document.store
      .getState()
      .score!.tempoMap.find(e => e.tick === bar.startTick);
    expect(event?.bpm).toBe(400);
  });

  it('offers the denominators a time signature can have, as a picker', () => {
    // A typed 3 has no nearest note value to snap to; the command refuses it.
    const { view, document } = setup(1);
    fireEvent.press(view.getByLabelText('Time sig. denominator'));
    fireEvent.press(view.getByText('8'));
    expect(measureAt(document, 1).timeSignature.denominator).toBe(8);
  });
});
