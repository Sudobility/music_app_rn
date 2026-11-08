/**
 * A position readout renders when its text changes, not on every report —
 * and never inside the report itself.
 */
import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { PositionSource } from '@sudobility/music_ui_rn';
import {
  useOnPositionFrame,
  usePositionReadout,
} from '@sudobility/music_ui_rn';

function fakeTransport() {
  const listeners = new Set<(tick: number) => void>();
  const transport: PositionSource = {
    onPosition: (fn: (tick: number) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const report = (tick: number) => listeners.forEach(fn => fn(tick));
  return { transport, report };
}

/** The React Native jest preset backs `requestAnimationFrame` with a timer. */
const nextFrame = () => act(() => jest.runOnlyPendingTimers());

describe('usePositionReadout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders once per change of text, however many reports arrive', () => {
    const { transport, report } = fakeTransport();
    const beat = (tick: number) => String(Math.floor(tick / 480) + 1);
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return usePositionReadout(transport, beat);
    });
    const settled = renders;

    for (let tick = 0; tick < 480; tick += 16) {
      act(() => report(tick));
      nextFrame();
    }
    expect(renders).toBe(settled);
    expect(result.current).toBe('1');

    act(() => report(480));
    nextFrame();
    expect(renders).toBe(settled + 1);
    expect(result.current).toBe('2');
  });
});

describe('useOnPositionFrame', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('delivers the latest report once per frame, never inside the report', () => {
    /*
      A report can arrive synchronously from a store write made during a
      render; a listener that set state there tripped React's render-phase
      guard ("Cannot update PositionScrubber while rendering App", iOS). The
      handler therefore runs in a frame callback, with the last tick of that
      frame.
    */
    const { transport, report } = fakeTransport();
    const seen: number[] = [];
    renderHook(() => useOnPositionFrame(transport, tick => seen.push(tick)));

    act(() => {
      report(10);
      report(20);
      report(30);
    });
    expect(seen).toEqual([]);
    nextFrame();
    expect(seen).toEqual([30]);

    act(() => report(40));
    nextFrame();
    expect(seen).toEqual([30, 40]);
  });

  it('drops a frame still pending when the subscriber unmounts', () => {
    const { transport, report } = fakeTransport();
    const seen: number[] = [];
    const { unmount } = renderHook(() =>
      useOnPositionFrame(transport, tick => seen.push(tick)),
    );
    act(() => report(5));
    unmount();
    nextFrame();
    expect(seen).toEqual([]);
  });
});
