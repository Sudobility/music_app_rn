/**
 * A row that answers the pointer. What is pinned here is that it changes at
 * all — under the pointer and under the press — and that it lets go again.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { Text } from '@sudobility/components-rn';
import { renderWithApp } from '@/test/render';
import { PressableCard } from '@sudobility/music_ui_rn';

function setup(onPress = jest.fn()) {
  const view = renderWithApp(
    <PressableCard label="Rock me" onPress={onPress}>
      <Text>Rock me</Text>
    </PressableCard>,
  );
  const row = () => view.getByRole('button', { name: 'Rock me' });
  const look = () => String(row().props.className);
  return { view, row, look, onPress };
}

describe('PressableCard', () => {
  it('chooses what it names when pressed', () => {
    const { row, onPress } = setup();
    fireEvent.press(row());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('chooses it for an assistive activation too, which a press does not cover', () => {
    const { row, onPress } = setup();
    fireEvent(row(), 'accessibilityTap');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('changes under the pointer, and changes back when it leaves', () => {
    const { row, look } = setup();
    const resting = look();

    fireEvent(row(), 'hoverIn');
    expect(look()).not.toBe(resting);

    fireEvent(row(), 'hoverOut');
    expect(look()).toBe(resting);
  });

  it('changes again on the way down, so a click is seen to land', () => {
    const { row, look } = setup();
    fireEvent(row(), 'hoverIn');
    const hovering = look();

    fireEvent(row(), 'pressIn');
    expect(look()).not.toBe(hovering);

    fireEvent(row(), 'pressOut');
    expect(look()).toBe(hovering);
  });

  it('lets go when the pointer leaves mid-press', () => {
    const { row, look } = setup();
    const resting = look();
    fireEvent(row(), 'hoverIn');
    fireEvent(row(), 'pressIn');

    fireEvent(row(), 'hoverOut');

    expect(look()).toBe(resting);
  });
});
