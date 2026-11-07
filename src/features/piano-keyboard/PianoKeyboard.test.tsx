/**
 * Keys outside the instrument are drawn but do not play.
 *
 * An import can hold notes a real instrument cannot reach, and the keyboard
 * widens to show them (`trackKeyboardSpan`). Those keys are pale and inert: a
 * person can import such a note, not play one in.
 */
import { jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import {
  KEYBOARD_OUT_OF_RANGE_BLACK,
  KEYBOARD_OUT_OF_RANGE_WHITE,
  computeKeys,
  keyboardWidth,
} from '@sudobility/music_drawing';
import { PianoKeyboard } from '@sudobility/music_ui_rn';

describe('PianoKeyboard', () => {
  const range = { min: 16, max: 43 }; // E0 up to G2
  const playable = { min: 28, max: 67 }; // a bass: E1 upward
  const whiteWidth = 20;
  const keys = computeKeys(whiteWidth, 100, range, 'pitch', playable);
  const board = {
    keys,
    width: keyboardWidth(whiteWidth, range),
    height: 120,
  };

  it('marks keys below the playable range as disabled and pale', () => {
    const view = render(<PianoKeyboard {...board} />);
    const buttons = view.getAllByRole('button');
    const byMidi = (midi: number) =>
      buttons.find(
        k =>
          k.props.accessibilityLabel === keys.find(p => p.midi === midi)!.name,
      );
    const e0 = byMidi(16);
    const e1 = byMidi(28);
    expect(e0).toBeDefined();
    expect(e0!.props.accessibilityState).toMatchObject({ disabled: true });
    expect(StyleSheet.flatten(e0!.props.style).backgroundColor).toBe(
      KEYBOARD_OUT_OF_RANGE_WHITE,
    );
    expect(e1!.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('dims a black key outside the range as well as a white one', () => {
    // `keyboardKeyFill`: the black keys used to draw the same near-black
    // whether or not the instrument could play them.
    const view = render(<PianoKeyboard {...board} />);
    const fSharp0 = keys.find(k => k.midi === 18)!;
    const button = view
      .getAllByRole('button')
      .find(k => k.props.accessibilityLabel === fSharp0.name)!;
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(
      KEYBOARD_OUT_OF_RANGE_BLACK,
    );
  });

  it('reports an assistive activation, which the press pair never sees', () => {
    // VoiceOver on macOS sends `onAccessibilityTap` and nothing else, so a key
    // wired only to press-in/press-out can be focused and read out and will
    // never sound or write a note.
    const onKeyTap = jest.fn();
    const view = render(<PianoKeyboard {...board} onKeyTap={onKeyTap} />);
    const playableKey = view
      .getAllByRole('button')
      .find(k => k.props.accessibilityState?.disabled === false)!;

    fireEvent(playableKey, 'accessibilityTap');

    expect(onKeyTap).toHaveBeenCalledTimes(1);
  });

  it('offers no activation at all on a key outside the range', () => {
    // `disabled` stops the press pair but not this, so withholding the handler
    // is what keeps it the one way past the compass.
    const onKeyTap = jest.fn();
    const view = render(<PianoKeyboard {...board} onKeyTap={onKeyTap} />);
    const low = view
      .getAllByRole('button')
      .find(k => k.props.accessibilityState?.disabled === true)!;

    expect(low.props.onAccessibilityTap).toBeUndefined();
    fireEvent(low, 'accessibilityTap');
    expect(onKeyTap).not.toHaveBeenCalled();
  });

  it('does not report a press on a key outside the range', () => {
    const onKeyDown = jest.fn();
    const onKeyUp = jest.fn();
    const view = render(
      <PianoKeyboard {...board} onKeyDown={onKeyDown} onKeyUp={onKeyUp} />,
    );
    const buttons = view.getAllByRole('button');
    const low = buttons.find(
      k => k.props.accessibilityState?.disabled === true,
    )!;
    fireEvent(low, 'pressIn');
    fireEvent(low, 'pressOut');
    expect(onKeyDown).not.toHaveBeenCalled();
    const playableKey = buttons.find(
      k => k.props.accessibilityState?.disabled === false,
    )!;
    fireEvent(playableKey, 'pressIn');
    expect(onKeyDown).toHaveBeenCalled();
  });
});
