/**
 * A text field that commits on blur.
 *
 * Every text property in the inspector wants this: dispatching per keystroke
 * makes each letter its own undo entry, so a typed chord symbol would take
 * eight presses of undo to remove. And an *unchanged* commit still pushes an
 * entry, so tabbing through a field without editing it must dispatch nothing.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '@/test/render';
import { DraftInput, NumberDraftInput } from '@sudobility/music_ui_rn';

function setup(value = 'C7') {
  const onCommit = jest.fn<(text: string) => void>();
  const view = renderWithApp(
    <DraftInput value={value} onCommit={onCommit} accessibilityLabel="Chord" />,
  );
  return { view, onCommit };
}

describe('DraftInput', () => {
  it('does not commit while typing', () => {
    // Per-keystroke dispatch is what makes undo useless.
    const { view, onCommit } = setup();
    fireEvent.changeText(view.getByLabelText('Chord'), 'Cmaj');
    fireEvent.changeText(view.getByLabelText('Chord'), 'Cmaj7');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits once, on blur', () => {
    const { view, onCommit } = setup();
    const field = view.getByLabelText('Chord');
    fireEvent.changeText(field, 'Cmaj7');
    fireEvent(field, 'blur');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Cmaj7');
  });

  it('commits nothing when the text did not change', () => {
    // Tabbing through would otherwise push an undo entry that changes nothing.
    const { view, onCommit } = setup();
    fireEvent(view.getByLabelText('Chord'), 'blur');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('re-seeds when the selection moves', () => {
    /*
      The draft follows `value`, so switching to another note does not carry a
      half-typed entry across — which would then commit onto the wrong note.
    */
    const onCommit = jest.fn<(text: string) => void>();
    const view = renderWithApp(
      <DraftInput value="C7" onCommit={onCommit} accessibilityLabel="Chord" />,
    );
    fireEvent.changeText(view.getByLabelText('Chord'), 'half-typed');
    view.rerender(
      <DraftInput value="Fm" onCommit={onCommit} accessibilityLabel="Chord" />,
    );
    expect(view.getByLabelText('Chord').props.value).toBe('Fm');
  });

  it('puts the stored text back when the commit is refused', () => {
    /*
      A commit answers false when the store wrote nothing — blank space trimmed
      to what is already there, a refusal. Left alone the field would go on
      showing text the note does not carry.
    */
    const view = renderWithApp(
      <DraftInput
        value="2"
        onCommit={() => false}
        accessibilityLabel="Chord"
      />,
    );
    const field = view.getByLabelText('Chord');
    fireEvent.changeText(field, '2 ');
    fireEvent(field, 'blur');
    expect(view.getByLabelText('Chord').props.value).toBe('2');
  });
});

describe('NumberDraftInput', () => {
  function numberSetup(value: number | null = 80) {
    const onCommit = jest.fn<(value: number) => void>();
    const view = renderWithApp(
      <NumberDraftInput
        value={value}
        min={0}
        max={127}
        integer
        mixedPlaceholder="Mixed"
        onCommit={onCommit}
        accessibilityLabel="Velocity"
      />,
    );
    return { view, onCommit, field: view.getByLabelText('Velocity') };
  }

  it('commits the parsed number once, on blur', () => {
    // Typing 100 must not write 1 and then 10 on the way there.
    const { field, onCommit } = numberSetup();
    fireEvent.changeText(field, '100');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent(field, 'blur');
    expect(onCommit).toHaveBeenCalledWith(100);
  });

  it('treats a cleared field as no change, never as zero', () => {
    const { field, onCommit } = numberSetup();
    fireEvent.changeText(field, '');
    fireEvent(field, 'blur');
    expect(onCommit).not.toHaveBeenCalled();
    expect(field.props.value).toBe('80');
  });

  it('clamps to its bounds', () => {
    const { field, onCommit } = numberSetup();
    fireEvent.changeText(field, '400');
    fireEvent(field, 'blur');
    expect(onCommit).toHaveBeenCalledWith(127);
  });

  it('puts the stored number back when the commit is refused', () => {
    // An octave outside the instrument's compass is refused by the store; the
    // field must not keep showing the octave that was not written.
    const view = renderWithApp(
      <NumberDraftInput
        value={4}
        onCommit={() => false}
        accessibilityLabel="Octave"
      />,
    );
    const field = view.getByLabelText('Octave');
    fireEvent.changeText(field, '1');
    fireEvent(field, 'blur');
    expect(view.getByLabelText('Octave').props.value).toBe('4');
  });

  it('shows a disagreeing selection as Mixed, not as a number', () => {
    const { field } = numberSetup(null);
    expect(field.props.value).toBe('');
    expect(field.props.placeholder).toBe('Mixed');
  });
});
