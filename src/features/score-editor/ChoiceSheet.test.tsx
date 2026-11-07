/**
 * A question with two answers and a way out.
 *
 * Cut and paste each have one, and neither is a yes/no — so a confirm dialog
 * cannot ask it. What matters here is that every answer carries a *detail* line
 * saying what it does to the score: "Insert" and "Replace" describe the button,
 * not the consequence, and the consequence is what the reader is choosing.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '@/test/render';
import { ChoiceSheet } from '@sudobility/music_ui_rn';

const CHOICES = [
  {
    value: 'silence' as const,
    label: 'Leave silence',
    detail: 'The rest of the track stays where it is',
    primary: true,
  },
  {
    value: 'close' as const,
    label: 'Close the gap',
    detail: 'Later notes on this track move earlier to fill it',
  },
];

function setup() {
  const onChoose = jest.fn();
  const onCancel = jest.fn();
  const view = renderWithApp(
    <ChoiceSheet
      open
      title="Cut"
      message="What should happen to the time it occupied?"
      choices={CHOICES}
      onChoose={onChoose}
      onCancel={onCancel}
    />,
  );
  return { view, onChoose, onCancel };
}

describe('ChoiceSheet', () => {
  it('shows what each answer does, not just its name', () => {
    const { view } = setup();
    expect(
      view.getByText('The rest of the track stays where it is'),
    ).toBeTruthy();
    expect(
      view.getByText('Later notes on this track move earlier to fill it'),
    ).toBeTruthy();
  });

  it('reports the value, not the label', () => {
    // The caller acts on `silence`/`close`; a label is for reading.
    const { view, onChoose } = setup();
    fireEvent.press(view.getByRole('button', { name: 'Close the gap' }));
    expect(onChoose).toHaveBeenCalledWith('close');
  });

  it('offers a way out that is neither answer', () => {
    const { view, onCancel, onChoose } = setup();
    fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('names the close control apart from Cancel', () => {
    /*
      The top-bar × is named "Cancel" by default, and this footer already has
      one — two controls with a single accessible name are ambiguous read aloud
      and a strict-mode failure in tests.
    */
    const { view } = setup();
    expect(view.getByLabelText('Close dialog')).toBeTruthy();
  });
});
