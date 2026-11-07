/**
 * Adding one generated track to the open score.
 *
 * A prompt and an instrument, and nothing else — everything the new part has to
 * agree with is taken from the score by `buildGenerateTrackRequest`. Offering
 * length, key, time signature or tempo as fields would let somebody ask for a
 * track that cannot line up with the music it accompanies, and the result is
 * unusable rather than merely different.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { createEmptyScore } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import { GenerateTrackSheet } from '@sudobility/music_ui_rn';

function setup(measures = 12) {
  const score = createEmptyScore({ title: 'Waltz', measures });
  const onSubmit = jest.fn();
  const view = renderWithApp(
    <GenerateTrackSheet
      open
      score={score}
      onClose={jest.fn()}
      onSubmit={onSubmit}
    />,
  );
  return { view, onSubmit, score };
}

describe('GenerateTrackSheet', () => {
  it('will not submit an empty prompt', () => {
    const { view, onSubmit } = setup();
    fireEvent.press(view.getByRole('button', { name: 'Generate' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('matches the open score rather than asking for a length', () => {
    // The whole reason the request is built from a Score.
    const { view, onSubmit, score } = setup(12);
    fireEvent.changeText(
      view.getByLabelText('What should it play?'),
      'a bass line',
    );
    fireEvent.press(view.getByRole('button', { name: 'Generate' }));
    const request = onSubmit.mock.calls[0]![0] as {
      durationMeasures: number;
      tempo?: number;
      tracks: unknown[];
    };
    expect(request.durationMeasures).toBe(12);
    expect(request.tempo).toBe(score.tempoMap[0].bpm);
  });

  it('asks for exactly one track', () => {
    // The server appends what it produces; asking for two would append two.
    const { view, onSubmit } = setup();
    fireEvent.changeText(
      view.getByLabelText('What should it play?'),
      'a bass line',
    );
    fireEvent.press(view.getByRole('button', { name: 'Generate' }));
    expect(
      (onSubmit.mock.calls[0]![0] as { tracks: unknown[] }).tracks,
    ).toHaveLength(1);
  });

  it('trims the prompt', () => {
    const { view, onSubmit } = setup();
    fireEvent.changeText(
      view.getByLabelText('What should it play?'),
      '  a bass line  ',
    );
    fireEvent.press(view.getByRole('button', { name: 'Generate' }));
    expect((onSubmit.mock.calls[0]![0] as { prompt: string }).prompt).toBe(
      'a bass line',
    );
  });
});
