/**
 * Generate Again.
 *
 * The point of the panel is that a lock reaches the request: a lock that did
 * not would look exactly like the ordinary variety the reader was trying to
 * escape. Mirrors the web panel's tests, so the two cannot drift apart.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import type { GenerationRecord } from '@sudobility/music_types';
import { regenerateWithLocks } from '@sudobility/music_lib';
import { renderWithApp } from '@/test/render';
import { GenerationChoices } from '@sudobility/music_ui_rn';

const record: GenerationRecord = {
  request: { prompt: 'a salsa', durationMeasures: 48, tracks: [] },
  choices: {
    formShape: 'standard',
    cycle: 'i - V, a two-bar montuno repeated',
    hook: 'it opens with a step down',
    groove: 'songo',
    arcEntry: 'the chords open alone',
    arcIntensity: 'a slow burn',
    moment: 'a half-time bridge',
    carrier: 1,
    carrierName: 'Trombone',
    lyric: null,
  },
};

describe('GenerationChoices', () => {
  it('shows the choices by name and skips the ones the piece did not have', () => {
    const view = renderWithApp(
      <GenerationChoices
        record={record}
        generating={false}
        onGenerateAgain={() => {}}
      />,
    );
    expect(view.getByText('songo')).toBeTruthy();
    // The carrier is shown by the track's name, not its index.
    expect(view.getByText('Trombone')).toBeTruthy();
    // No lyric was written, so there is no lyric row to lock.
    expect(view.queryByLabelText('Keep Lyrics')).toBeNull();
  });

  it('generates again keeping exactly the locked choices, after asking', async () => {
    const onGenerateAgain = jest.fn<(keys: string[]) => void>();
    const view = renderWithApp(
      <GenerationChoices
        record={record}
        generating={false}
        onGenerateAgain={onGenerateAgain}
      />,
    );
    fireEvent(view.getByLabelText('Keep Groove'), 'valueChange', true);
    fireEvent.press(view.getByText('Generate again, keeping 1 choice'));
    // Nothing is sent until the reader confirms the whole score is replaced.
    expect(onGenerateAgain).not.toHaveBeenCalled();
    const confirm = view.getAllByText('Generate again');
    await act(async () => {
      fireEvent.press(confirm[confirm.length - 1]!);
    });
    expect(onGenerateAgain).toHaveBeenCalledWith(['groove']);
    // And those keys, through the shared builder, pin exactly that choice.
    const keys = onGenerateAgain.mock.calls[0]![0] as never;
    expect(regenerateWithLocks(record, keys).choices).toEqual({
      groove: 'songo',
    });
  });

  it('keeps the question up, its confirm spinning, until the job is accepted', async () => {
    let release = () => {};
    const onGenerateAgain = jest.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    const view = renderWithApp(
      <GenerationChoices
        record={record}
        generating={false}
        onGenerateAgain={onGenerateAgain}
      />,
    );
    fireEvent.press(view.getByText('Generate again'));
    const confirm = () =>
      view.getAllByRole('button', { name: 'Generate again' }).at(-1)!;
    await act(async () => {
      fireEvent.press(confirm());
    });
    expect(confirm().props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await act(async () => {
      fireEvent.press(confirm());
    });
    expect(onGenerateAgain).toHaveBeenCalledTimes(1);
    expect(view.getByText(/replace/i)).toBeTruthy();
    await act(async () => {
      release();
    });
    expect(
      view.getAllByRole('button', { name: 'Generate again' }),
    ).toHaveLength(1);
  });

  it('quotes generating again at bars times tracks', () => {
    const withTracks: GenerationRecord = {
      ...record,
      request: {
        ...record.request,
        tracks: [
          {
            name: 'Piano',
            instrumentName: 'Piano',
            midiProgram: 0,
            clef: 'treble',
          },
          {
            name: 'Bass',
            instrumentName: 'Bass',
            midiProgram: 32,
            clef: 'bass',
          },
        ],
      },
    };
    const view = renderWithApp(
      <GenerationChoices
        record={withTracks}
        generating={false}
        onGenerateAgain={() => {}}
      />,
    );
    expect(view.getByText('This will use about 96 credits.')).toBeTruthy();
  });
});
