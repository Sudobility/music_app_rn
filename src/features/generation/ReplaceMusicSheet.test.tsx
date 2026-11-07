/**
 * Replace's settings, and the one thing it must not get wrong: the scope.
 *
 * All three scopes share this sheet and differ only in the region they
 * overwrite — which `prepareReplacement` derives. If the wrong scope reaches it
 * the wrong music is replaced, and there is nothing on screen to say so until
 * the result lands minutes later.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '@/test/render';
import { ReplaceMusicSheet } from '@sudobility/music_ui_rn';

function setup(
  overrides: Partial<Parameters<typeof ReplaceMusicSheet>[0]> = {},
) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  const view = renderWithApp(
    <ReplaceMusicSheet
      open
      scope="notes"
      canSubmit
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { view, onSubmit, onClose };
}

describe('ReplaceMusicSheet', () => {
  it('is titled for its scope', () => {
    expect(setup().view.getByText('Replace notes')).toBeTruthy();
    expect(
      setup({ scope: 'measures' }).view.getByText('Replace bars'),
    ).toBeTruthy();
    expect(
      setup({ scope: 'track' }).view.getByText('Replace track'),
    ).toBeTruthy();
  });

  it('will not submit without an instruction', () => {
    // The instruction is the whole request; an empty one asks the model for
    // nothing in particular and bills for it.
    const { view, onSubmit } = setup();
    fireEvent.press(view.getByRole('button', { name: 'Replace' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('will not submit with nothing selected to replace', () => {
    const { view, onSubmit } = setup({ canSubmit: false });
    fireEvent.changeText(view.getByLabelText('Prompt'), 'more dramatic');
    fireEvent.press(view.getByRole('button', { name: 'Replace' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("opens on the web's defaults: nothing preserved, moderate, the default backend", () => {
    /*
      This sheet used to preserve boundary notes and keep the complexity as it
      was, where the web preserved nothing and asked for moderate — so one
      instruction over one bar range sent two different requests depending on
      the device. The defaults are music_lib's `defaultReplaceSubmission` now.
    */
    const { view, onSubmit } = setup();
    fireEvent.changeText(view.getByLabelText('Prompt'), 'more dramatic');
    fireEvent.press(view.getByRole('button', { name: 'Replace' }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      complexity: 'moderate',
      variant: 'deepseek',
      constraints: {
        preserveBoundaryNotes: false,
        preserveHarmony: false,
        preserveRhythm: false,
        preserveMelody: false,
      },
    });
  });

  it('omits style and mood rather than sending "none"', () => {
    // The picker needs a value for absence; the request expresses it by leaving
    // the field out, which is what "no particular style" means on the wire.
    const { view, onSubmit } = setup();
    fireEvent.changeText(view.getByLabelText('Prompt'), 'more dramatic');
    fireEvent.press(view.getByRole('button', { name: 'Replace' }));
    const submission = onSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect('style' in submission).toBe(false);
    expect('mood' in submission).toBe(false);
  });

  it('labels the complexity rather than printing its value', () => {
    const { view } = setup();
    expect(view.getByText('Moderate')).toBeTruthy();
    expect(view.queryByText('moderate')).toBeNull();
  });

  it('trims the instruction, so trailing spaces are not part of the prompt', () => {
    const { view, onSubmit } = setup();
    fireEvent.changeText(view.getByLabelText('Prompt'), '  more dramatic  ');
    fireEvent.press(view.getByRole('button', { name: 'Replace' }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      instruction: 'more dramatic',
    });
  });
});
