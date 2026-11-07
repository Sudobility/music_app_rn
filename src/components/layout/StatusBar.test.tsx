/**
 * The bottom strip.
 *
 * It reports on the score rather than acting on it — with one exception, the
 * issue count, and that is the right place for it: an issue is something the
 * score *has*. It says nothing at all when the score is clean, because a
 * permanent "0 issues" is a permanent invitation to stop reading the strip.
 */
import { act, fireEvent } from '@testing-library/react-native';

import { renderWithApp, testDocument } from '@/test/render';
import { libraryCopy } from '@/config/initialize';
import type { MusicDocument } from '@/documents/document';
import { StatusBar } from '@sudobility/music_ui_rn';

/** Empties a bar's voice so the measure no longer adds up. */
function breakFirstMeasure(document: MusicDocument) {
  act(() => {
    const score = document.store.getState().score!;
    document.store.getState().setScore(
      {
        ...score,
        tracks: score.tracks.map(track => ({
          ...track,
          measures: track.measures.map((m, i) =>
            i === 0 ? { ...m, voices: [{ ...m.voices[0], events: [] }] } : m,
          ),
        })),
      },
      { resetHistory: true },
    );
  });
}

describe('StatusBar', () => {
  /*
    What you have selected, which is what a status strip is for — and what the
    web app has always shown here. This used to say the active track's name and
    a bar count, both of which the reader already had: the renderer paints the
    track's name into the gutter beside every system.
  */
  it('says what is selected, and says so when nothing is', () => {
    const document = testDocument();
    const view = renderWithApp(<StatusBar document={document} libraryCopy={libraryCopy} />);
    expect(view.getByText('No selection')).toBeTruthy();

    act(() => {
      const bars = document.store.getState().score!.tracks[0].measures;
      document.store.getState().selectMeasures(bars.slice(0, 2).map(m => m.id));
    });
    expect(view.getByText('2 bars selected')).toBeTruthy();
  });

  it('shows no issue count on a clean score', () => {
    // A permanent "0 issues" trains the reader to ignore the strip.
    const view = renderWithApp(<StatusBar document={testDocument()} libraryCopy={libraryCopy} />);
    expect(view.queryByLabelText(/validation/i)).toBeNull();
  });

  it('offers the issues once the score has some', () => {
    const document = testDocument();
    const view = renderWithApp(<StatusBar document={document} libraryCopy={libraryCopy} />);
    breakFirstMeasure(document);
    expect(view.getByLabelText(/validation/i)).toBeTruthy();
  });

  it('opens the issue list when tapped', () => {
    const document = testDocument();
    const view = renderWithApp(<StatusBar document={document} libraryCopy={libraryCopy} />);
    breakFirstMeasure(document);
    fireEvent.press(view.getByLabelText(/validation/i));
    expect(view.getByText('Fix all')).toBeTruthy();
  });
});
