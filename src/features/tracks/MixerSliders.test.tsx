/**
 * Volume and pan are drawn as the things they are.
 *
 * Both were the library `Slider` before this — one control for two different
 * questions — and the two ways that reads wrongly are what these pin. A level
 * needs its groove visible behind the fill, or a quiet track is a short bar
 * floating in space with nothing to say how much further it goes. And pan is a
 * *position*, so it fills from the middle and reads out which side: a bar
 * growing from the left said "40% of maximum pan", which is not a thing.
 */
/*
  `jest` is imported rather than taken from the globals: this repo's tsconfig
  declares vitest's globals (the other half of the suite runs under vitest), and
  loading both packages' global types makes `expect` two incompatible things.
  The runner still injects the globals; this only gives TypeScript a name it can
  resolve.
*/
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '@/test/render';
import { panReadout } from '@sudobility/music_types';
import { PanSlider, VolumeSlider } from '@sudobility/music_ui_rn';

describe('VolumeSlider', () => {
  it('states the level in words as well as in a bar', () => {
    const view = renderWithApp(
      <VolumeSlider
        label="Track volume"
        rowLabel="Vol"
        value={0.4}
        onChange={() => {}}
      />,
    );
    expect(view.getByText('40%')).toBeTruthy();
  });

  it('carries its own accessible name, which the row label is not', () => {
    // "Vol" is the visible column heading; the control is "Track volume", or a
    // screen reader announces a number with no word for what it measures.
    const view = renderWithApp(
      <VolumeSlider
        label="Track volume"
        rowLabel="Vol"
        value={0.4}
        onChange={() => {}}
      />,
    );
    expect(view.getByLabelText('Track volume')).toBeTruthy();
  });
});

describe('PanSlider', () => {
  it('reads out which side and how far, not a fraction', () => {
    const view = renderWithApp(
      <PanSlider
        label="Track pan"
        rowLabel="Pan"
        value={-0.4}
        onChange={() => {}}
        resetLabel="Center pan"
      />,
    );
    expect(view.getByText('L40')).toBeTruthy();
  });

  it('says "C" at the centre, where there is no side to name', () => {
    expect(panReadout(0)).toBe('C');
    expect(panReadout(0.25)).toBe('R25');
    expect(panReadout(-1)).toBe('L100');
  });

  it('offers nothing to reset when it is already centred', () => {
    // A button that looks live and is a no-op is worse than one that says so.
    const view = renderWithApp(
      <PanSlider
        label="Track pan"
        rowLabel="Pan"
        value={0}
        onChange={() => {}}
        onReset={() => {}}
        resetLabel="Center pan"
      />,
    );
    expect(
      view.getByLabelText('Center pan').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('centres through its own callback, not through a drag', () => {
    /*
      The web learned this the hard way: a wrapper that committed on any
      pointer-up inside the row read the button's `.value` — `''`, and
      `Number('')` is 0. On the pan row that is what centring wants, which is
      precisely why it went unnoticed; the same button on the volume row would
      mute the track.
    */
    const onReset = jest.fn();
    const onChange = jest.fn();
    const view = renderWithApp(
      <PanSlider
        label="Track pan"
        rowLabel="Pan"
        value={-0.4}
        onChange={onChange}
        onReset={onReset}
        resetLabel="Center pan"
      />,
    );
    fireEvent.press(view.getByLabelText('Center pan'));
    expect(onReset).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
