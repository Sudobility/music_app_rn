/**
 * The toolbar menu's rows, reached the way assistive technology reaches them.
 *
 * On macOS a `Pressable` runs `onPress` from a mouse or touch responder, and an
 * accessibility activation arrives as `accessibilityTap` instead — a different
 * event, which a row wired only to `onPress` never sees. Every row of every
 * toolbar menu (note values, accidentals, the More actions list, the export
 * formats) announced itself correctly and then did nothing when activated;
 * `IconButton` and the document tabs already carried `onAccessibilityTap`, and
 * these rows were the gap. Both events are asserted here because a row that
 * answers only one of them is exactly the half-working control this caught.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderWithApp } from '@/test/render';
import { ToolbarSelect } from '@sudobility/music_ui_rn';

const OPTIONS = [
  { value: 'select-all', label: 'Select all notes' },
  { value: 'glissando', label: 'Glissando', disabled: true },
];

function open(onChange: (value: string) => void) {
  const view = renderWithApp(
    <ToolbarSelect label="More actions" options={OPTIONS} onChange={onChange}>
      <Text>…</Text>
    </ToolbarSelect>,
  );
  fireEvent.press(view.getByLabelText('More actions'));
  return view;
}

describe('ToolbarSelect', () => {
  it('commits a row activated by a screen reader, not only by a press', () => {
    const onChange = jest.fn();
    const view = open(onChange);
    fireEvent(view.getByLabelText('Select all notes'), 'accessibilityTap');
    expect(onChange).toHaveBeenCalledWith('select-all');
  });

  it('commits a row that is pressed', () => {
    const onChange = jest.fn();
    const view = open(onChange);
    fireEvent.press(view.getByLabelText('Select all notes'));
    expect(onChange).toHaveBeenCalledWith('select-all');
  });

  it('does not commit a disabled row by either route', () => {
    const onChange = jest.fn();
    const view = open(onChange);
    const row = view.getByLabelText('Glissando');
    fireEvent.press(row);
    fireEvent(row, 'accessibilityTap');
    expect(onChange).not.toHaveBeenCalled();
  });
});
