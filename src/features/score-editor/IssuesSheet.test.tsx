/**
 * What is wrong with the score, and what Fix all honestly claims.
 *
 * Several validation rules — how many notes sound at once, most obviously —
 * have no repair that is not a guess about the music. So "fixed everything"
 * over a list that still has entries in it is a lie the reader can see, and the
 * sheet stays open when anything remains.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import type { MusicDocument } from '@/documents/document';
import { renderWithApp, testDocument } from '@/test/render';
import { IssuesSheet } from './IssuesSheet';

// `repairAllIssues` is music_editing's and keeps getting better at repairing —
// it now clears an overcrowded bar that it once left alone. The "stays open"
// branch is this sheet's own (close only when the list empties), so for that
// one case stand the repair in as a no-op that fixes nothing; every other test
// uses the real one (the spy delegates to it by default).
jest.mock('@sudobility/music_editing', () => {
  const actual = jest.requireActual<typeof import('@sudobility/music_editing')>(
    '@sudobility/music_editing',
  );
  return { ...actual, repairAllIssues: jest.fn(actual.repairAllIssues) };
});
import { repairAllIssues } from '@sudobility/music_editing';

function setup() {
  const document = testDocument();
  const onClose = jest.fn();
  const view = renderWithApp(
    <IssuesSheet open document={document} onClose={onClose} />,
  );
  return { view, document, onClose };
}

/** Takes bar 1's rest away, so the bar no longer adds up — a repairable issue. */
function shortenFirstBar(document: MusicDocument): void {
  act(() => {
    const score = document.store.getState().score!;
    const shortened = {
      ...score,
      tracks: score.tracks.map(track => ({
        ...track,
        measures: track.measures.map((m, i) =>
          i === 0 ? { ...m, voices: [{ ...m.voices[0], events: [] }] } : m,
        ),
      })),
    };
    document.store.getState().setScore(shortened, { resetHistory: true });
  });
}

/**
 * Eleven whole notes struck together in bar 1 — past the readability threshold
 * for notes sounding at once, which `repairScore` deliberately leaves alone:
 * there is no non-arbitrary choice of which note to delete.
 */
function overcrowdFirstBar(document: MusicDocument): void {
  act(() => {
    const score = document.store.getState().score!;
    const track = score.tracks[0];
    const measure = track.measures[0];
    const voice = measure.voices[0];
    // Distinct pitches, so nothing is an exact duplicate the repair would drop.
    const steps = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
    const events = Array.from({ length: 11 }, (_, i) => ({
      id: `crowd-${i}`,
      pitch: {
        step: steps[i % 7],
        octave: 3 + Math.floor(i / 7),
        accidental: 0 as const,
      },
      startTick: measure.startTick,
      durationTicks: measure.durationTicks,
      velocity: 80,
      voiceId: voice.id,
      trackId: track.id,
    }));
    const crowded = {
      ...score,
      tracks: score.tracks.map((t, ti) =>
        ti === 0
          ? {
              ...t,
              measures: t.measures.map((m, i) =>
                i === 0 ? { ...m, voices: [{ ...voice, events }] } : m,
              ),
            }
          : t,
      ),
    };
    document.store.getState().setScore(crowded, { resetHistory: true });
  });
}

describe('IssuesSheet', () => {
  it('says so plainly when the score is clean', () => {
    const { view } = setup();
    expect(view.getByText('No issues.')).toBeTruthy();
  });

  it('offers no repair when there is nothing to repair', () => {
    // A live Fix all over an empty list is a button that can only disappoint.
    const { view } = setup();
    const fix = view.getByRole('button', { name: 'Fix all' });
    expect(fix.props.accessibilityState.disabled).toBe(true);
  });

  it("lists what the store reports, in the store's words", () => {
    /*
      The messages come from `validateScore`, translated by the host through
      `EditingCopy`. Nothing here composes a sentence — a second wording is a
      second thing to keep in step.
    */
    const { view, document } = setup();
    act(() => {
      const score = document.store.getState().score!;
      // Take a bar's rest away so the measure no longer adds up.
      const shortened = {
        ...score,
        tracks: score.tracks.map(track => ({
          ...track,
          measures: track.measures.map((m, i) =>
            i === 0 ? { ...m, voices: [{ ...m.voices[0], events: [] }] } : m,
          ),
        })),
      };
      document.store.getState().setScore(shortened, { resetHistory: true });
    });
    const issues = document.store.getState().validationIssues;
    expect(issues.length).toBeGreaterThan(0);
    expect(view.getByText(issues[0].message)).toBeTruthy();
  });

  /*
    Fix all's outcome is music_editing's `repairIssuesOutcome`, shared with the
    web: what it says, and whether the list closes. It used to be decided here
    and said nothing at all — the sheet closed or it did not, and a press that
    repaired nothing looked exactly like a press that did not register.
  */
  it('closes and says how many were fixed when the list empties', () => {
    const { view, document, onClose } = setup();
    shortenFirstBar(document);
    act(() => {
      fireEvent.press(view.getByRole('button', { name: 'Fix all' }));
    });
    expect(document.store.getState().validationIssues).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
    const toasts = document.store.getState().toasts;
    expect(toasts.at(-1)?.message).toMatch(/^Fixed \d+ issues?\.$/);
    expect(toasts.at(-1)?.severity).toBe('success');
  });

  it('stays open and says so when nothing could be fixed', () => {
    const { view, document, onClose } = setup();
    overcrowdFirstBar(document);
    expect(document.store.getState().validationIssues.length).toBeGreaterThan(
      0,
    );
    // Nothing fixed, one left: the outcome the sheet must keep itself open for.
    jest
      .mocked(repairAllIssues)
      .mockReturnValueOnce({ fixed: 0, remaining: 1 });
    act(() => {
      fireEvent.press(view.getByRole('button', { name: 'Fix all' }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.store.getState().toasts.at(-1)?.message).toBe(
      'Nothing here can be fixed automatically.',
    );
  });
});
