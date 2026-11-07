/**
 * What the score view tells the canvas.
 *
 * The canvas is music_drawing's and decides everything geometric; what can go
 * wrong here is the wiring — and three pieces of it were missing on this side
 * while the web had them. Hidden tracks were still drawn, notes an instrument
 * cannot play were never marked, and the caret was a hardcoded red that
 * ignored the theme. Each is pinned against a recording canvas.
 *
 * What a touch *means* is music_editing's (`routeScorePress`,
 * `selectForContextMenu`) and is tested there; what is pinned here is that the
 * view hands those the canvas's answer, and that it tells a tap from a long
 * press from a scroll with music_editing's `classifyPress` — a scroll that
 * happened to end over a note must not select it.
 *
 * And one thing about *when*: a new picture, cursor or scroll offset must not
 * re-render the score view. During playback those change on every note, and a
 * re-render per note was measured at 7% of the JavaScript thread.
 */
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { DARK_RENDER_THEME } from '@sudobility/music_drawing';
import { Platform, ScrollView } from 'react-native';
import {
  createEmptyScore,
  getMusicPositionSource,
} from '@sudobility/music_types';
import type { Pitch, Score } from '@sudobility/music_types';
import { twinkleScore } from '@sudobility/music_types/test';
import { renderWithApp } from '@/test/render';

type Call = { method: string; args: unknown[] };
const mockCalls: Call[] = [];
const mockCursorColors: string[] = [];
const mockRenders = { count: 0 };
/** What the canvas answers for a point: set per test. */
const mockCanvasAnswers: {
  hit: unknown;
  tick: number | null;
  points: unknown[];
  follow: { left: number; top: number } | null;
  followedTicks: number[];
} = { hit: null, tick: null, points: [], follow: null, followedTicks: [] };

jest.mock('./useScoreCanvas', () => {
  const actual = jest.requireActual(
    './useScoreCanvas',
  ) as typeof import('./useScoreCanvas');
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      mockCalls.push({ method, args });
    };
  const canvas = {
    setScore: record('setScore'),
    setStoredScore: record('setStoredScore'),
    setView: record('setView'),
    setActiveTrack: record('setActiveTrack'),
    setSelectedNotes: record('setSelectedNotes'),
    setSelectedMeasures: record('setSelectedMeasures'),
    setOutOfRangeNotes: record('setOutOfRangeNotes'),
    setScroll: record('setScroll'),
    setCursorTick: record('setCursorTick'),
    animateCursor: record('animateCursor'),
    setPlayingNotes: record('setPlayingNotes'),
    contentSize: () => ({ width: 800, height: 600 }),
    hitTest: (point: unknown) => {
      mockCanvasAnswers.points.push(point);
      return mockCanvasAnswers.hit;
    },
    tickAt: () => mockCanvasAnswers.tick,
    followTarget: (tick: number) => {
      mockCanvasAnswers.followedTicks.push(tick);
      return mockCanvasAnswers.follow;
    },
  };
  const signals = {
    picture: actual.createSignal<unknown>(null),
    cursor: actual.createSignal({
      path: null,
      motion: { tick: 0, atMs: 0, ticksPerSecond: 0 },
      id: 0,
    }),
    scroll: actual.createSignal({ left: 0, top: 0 }),
  };
  return {
    ...actual,
    mockSignals: signals,
    useScoreCanvas: () => ({ canvas, ...signals }),
  };
});

// Measured from the first render: the view only sizes the canvas once it
// knows its own size, and a test renderer measures nothing.
jest.mock('@sudobility/music_ui_rn', () => ({
  ...jest.requireActual('@sudobility/music_ui_rn'),
  // Called once per render of the score view, which is what makes it a counter.
  useContainerSize: () => ({
    ...(mockRenders.count++, {}),
    size: { width: 800, height: 600 },
    onLayout: () => undefined,
    measured: true,
  }),
}));

jest.mock('./ScoreView', () => ({ ScoreView: () => null }));

jest.mock('./PlaybackCursor', () => ({
  PlaybackCursor: ({ color }: { color: string; children?: ReactNode }) => {
    mockCursorColors.push(color);
    return null;
  },
}));

jest.mock('@sudobility/music_drawing', () => {
  const actual = jest.requireActual(
    '@sudobility/music_drawing',
  ) as typeof import('@sudobility/music_drawing');
  // Playback is the shared binding's and has its own tests; here it would
  // reach for a player the test does not have.
  return {
    ...actual,
    bindPlaybackToCanvas: () => () => undefined,
  };
});

const { ScrollingScore } =
  require('./ScrollingScore') as typeof import('./ScrollingScore');
const { mockSignals } = require('./useScoreCanvas') as {
  mockSignals: {
    picture: { set: (next: unknown) => void };
    cursor: { set: (next: unknown) => void };
    scroll: { set: (next: { left: number; top: number }) => void };
  };
};

function lastCall(method: string): unknown[] | undefined {
  return [...mockCalls].reverse().find(call => call.method === method)?.args;
}

/**
 * A B-flat clarinet playing Twinkle, with its first note pushed far above the
 * top of the instrument.
 */
function clarinetScore(): Score {
  const base = twinkleScore();
  const track = base.tracks[0]!;
  const [first, ...rest] = track.measures;
  const voice = first!.voices[0]!;
  const [note, ...others] = voice.events;
  const tooHigh = {
    ...note!,
    pitch: { ...(note as { pitch: Pitch }).pitch, octave: 8 },
  } as typeof note;
  return {
    ...base,
    tracks: [
      {
        ...track,
        midiProgram: 71,
        instrumentName: 'Clarinet',
        measures: [
          { ...first!, voices: [{ ...voice, events: [tooHigh!, ...others] }] },
          ...rest,
        ],
      },
    ],
  };
}

beforeEach(() => {
  mockCalls.length = 0;
  mockCursorColors.length = 0;
  mockRenders.count = 0;
  mockCanvasAnswers.hit = null;
  mockCanvasAnswers.tick = null;
  mockCanvasAnswers.points = [];
  mockCanvasAnswers.follow = null;
  mockCanvasAnswers.followedTicks = [];
});

/**
 * Press the touch surface: down at `from`, up at `to` after `heldMs`.
 *
 * `page` is where the finger is on screen and `location` where it is on the
 * surface; they differ during a scroll, when the surface moves with the finger.
 */
function press(
  view: ReturnType<typeof renderWithApp>,
  {
    location = { x: 40, y: 50 },
    from = { x: 100, y: 100 },
    to = from,
    heldMs = 80,
  }: {
    location?: { x: number; y: number };
    from?: { x: number; y: number };
    to?: { x: number; y: number };
    heldMs?: number;
  } = {},
) {
  const surface = view.UNSAFE_root.findAll(
    (node: { props: Record<string, unknown> }) =>
      typeof node.props.onTouchEnd === 'function',
  )[0]!;
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  fireEvent(surface, 'touchStart', {
    nativeEvent: {
      locationX: location.x,
      locationY: location.y,
      pageX: from.x,
      pageY: from.y,
    },
  });
  now.mockReturnValue(1_000 + heldMs);
  fireEvent(surface, 'touchEnd', {
    nativeEvent: {
      locationX: location.x,
      locationY: location.y,
      pageX: to.x,
      pageY: to.y,
    },
  });
  now.mockRestore();
}

describe('touches', () => {
  const noteHit = {
    kind: 'note',
    eventIds: ['n1', 'n2'],
    trackId: 't1',
    tick: 480,
    measureIndex: 0,
  };

  it('hands a tap the canvas hit and the tick under the point', () => {
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    mockCanvasAnswers.hit = noteHit;
    mockCanvasAnswers.tick = 512;
    const onPress = jest.fn();
    const view = renderWithApp(
      <ScrollingScore score={score} onPress={onPress} />,
    );
    press(view);
    expect(onPress).toHaveBeenCalledWith(noteHit, 512);
    // The surface's touch is in content px and the canvas takes view px; at no
    // scroll the two agree.
    expect(mockCanvasAnswers.points.at(-1)).toEqual({ x: 40, y: 50 });
  });

  it('hands over a press that landed on nothing, so a Mod press can still select to the tick', () => {
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    mockCanvasAnswers.tick = 960;
    const onPress = jest.fn();
    const view = renderWithApp(
      <ScrollingScore score={score} onPress={onPress} />,
    );
    press(view);
    expect(onPress).toHaveBeenCalledWith(null, 960);
  });

  it('leaves read-only score taps alone on mobile and macOS', () => {
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    mockCanvasAnswers.tick = 480;
    const view = renderWithApp(<ScrollingScore score={score} />);
    press(view);
    expect(getMusicPositionSource().reportedTick).toBe(0);
    view.unmount();
  });

  it('routes a Windows mouse click through the score hit test to the playhead', () => {
    const originalOS = Platform.OS;
    Platform.OS = 'windows';
    try {
      mockCanvasAnswers.tick = 960;
      const score = createEmptyScore({ title: 'Test', measures: 2 });
      const view = renderWithApp(<ScrollingScore score={score} />);
      const surface = view.UNSAFE_root.findAll(
        (node: { props: Record<string, unknown> }) =>
          typeof node.props.onPress === 'function',
      )[0]!;
      fireEvent(surface, 'press', {
        nativeEvent: { locationX: 40, locationY: 50 },
      });
      expect(getMusicPositionSource().reportedTick).toBe(960);
      expect(mockCanvasAnswers.points.at(-1)).toEqual({ x: 40, y: 50 });
      view.unmount();
      act(() => getMusicPositionSource().moveTo(0));
    } finally {
      Platform.OS = originalOS;
    }
  });

  it('reads a hold as a long press, not a tap', () => {
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    mockCanvasAnswers.hit = noteHit;
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const view = renderWithApp(
      <ScrollingScore
        score={score}
        onPress={onPress}
        onLongPress={onLongPress}
      />,
    );
    press(view, { heldMs: 700 });
    expect(onLongPress).toHaveBeenCalledWith(noteHit);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ignores a scroll that ended over a note', () => {
    /*
      The surface scrolls with the finger, so its own coordinates barely move
      during a scroll: travel is measured on screen. A tap that selected
      whatever a scroll came to rest on would change the selection on every
      flick through the score.
    */
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    mockCanvasAnswers.hit = noteHit;
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const view = renderWithApp(
      <ScrollingScore
        score={score}
        onPress={onPress}
        onLongPress={onLongPress}
      />,
    );
    press(view, { from: { x: 100, y: 300 }, to: { x: 100, y: 120 } });
    press(view, {
      from: { x: 100, y: 300 },
      to: { x: 100, y: 120 },
      heldMs: 900,
    });
    expect(onPress).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe('ScrollingScore', () => {
  it('draws only the tracks it is given', () => {
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    const ids = [score.tracks[0]!.id];
    renderWithApp(<ScrollingScore score={score} trackIds={ids} />);
    expect(lastCall('setView')?.[0]).toMatchObject({ trackIds: ids });
  });

  it('draws every track when no list is given', () => {
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    renderWithApp(<ScrollingScore score={score} />);
    expect(lastCall('setView')?.[0]).not.toHaveProperty('trackIds');
  });

  it('hands the canvas the stored score and the reading mode, not a drawn score', () => {
    /*
      In written pitch the lens moves a clarinet up a tone, so marking notes
      from the drawn score would judge the part a tone away from where it
      sounds. The canvas applies the lens and scans the stored pitches itself
      (\`ScoreCanvas.setStoredScore\`, tested in music_drawing); what can go wrong
      here is handing it the wrong one.
    */
    const score = clarinetScore();
    renderWithApp(<ScrollingScore score={score} pitchDisplay="written" />);
    expect(lastCall('setStoredScore')).toEqual([score, 'written']);
    expect(lastCall('setScore')).toBeUndefined();
  });

  it('does not re-render for a new picture, cursor or scroll offset', () => {
    const score = createEmptyScore({ title: 'Test', measures: 2 });
    renderWithApp(<ScrollingScore score={score} />);
    const settled = mockRenders.count;
    act(() => {
      mockSignals.picture.set({});
      mockSignals.cursor.set({
        path: null,
        motion: { tick: 480, atMs: 0, ticksPerSecond: 960 },
        id: 1,
      });
      mockSignals.scroll.set({ left: 0, top: 120 });
    });
    expect(mockRenders.count).toBe(settled);
  });

  it('colours the caret from the render theme', () => {
    const score = createEmptyScore({ title: 'Test', measures: 1 });
    renderWithApp(<ScrollingScore score={score} theme={DARK_RENDER_THEME} />);
    expect(mockCursorColors.at(-1)).toBe(DARK_RENDER_THEME.caret);
  });
});

/*
  A tab's editor is a fresh component per document, so the score view used to
  open at the top whatever the restored caret said. It now opens where the tab
  was left, or — for a document never scrolled — where the caret is, and
  reports its offset when it goes away.
*/
describe('reopening a tab', () => {
  /** The outer, vertical scroll view and its mocked `scrollTo`. */
  function verticalScroller(view: ReturnType<typeof renderWithApp>) {
    const scroller = view.UNSAFE_getAllByType(ScrollView)[0]!;
    const scrollTo = (scroller.instance as { scrollTo: jest.Mock }).scrollTo;
    scrollTo.mockClear();
    return { scroller, scrollTo };
  }

  it('opens at the offset the tab was left at, once its content is laid out', () => {
    const score = createEmptyScore({ title: 'Test', measures: 40 });
    const view = renderWithApp(
      <ScrollingScore score={score} initialScroll={{ left: 0, top: 840 }} />,
    );
    const { scroller, scrollTo } = verticalScroller(view);
    // Before the content has a height, a scroll would clamp to the top.
    fireEvent(scroller, 'contentSizeChange', 800, 0);
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent(scroller, 'contentSizeChange', 800, 4000);
    expect(scrollTo).toHaveBeenCalledWith({ y: 840, animated: false });
    expect(lastCall('setScroll')).toEqual([0, 840]);

    // Once: a later change of content (an edit, a zoom) must not jump back.
    fireEvent(scroller, 'contentSizeChange', 800, 5000);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('brings the caret into view for a tab never scrolled', () => {
    act(() => getMusicPositionSource().moveTo(7680));
    mockCanvasAnswers.follow = { left: 0, top: 1320 };
    const score = createEmptyScore({ title: 'Test', measures: 40 });
    const view = renderWithApp(
      <ScrollingScore score={score} initialScroll={null} />,
    );
    const { scroller, scrollTo } = verticalScroller(view);
    fireEvent(scroller, 'contentSizeChange', 800, 4000);
    expect(mockCanvasAnswers.followedTicks).toEqual([7680]);
    expect(scrollTo).toHaveBeenCalledWith({ y: 1320, animated: false });
    act(() => getMusicPositionSource().moveTo(0));
  });

  it('opens at the top when told nothing, as the published view is', () => {
    const score = createEmptyScore({ title: 'Test', measures: 40 });
    const view = renderWithApp(<ScrollingScore score={score} />);
    const { scroller, scrollTo } = verticalScroller(view);
    fireEvent(scroller, 'contentSizeChange', 800, 4000);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(mockCanvasAnswers.followedTicks).toEqual([]);
  });

  it('reports where it was scrolled when it goes away', () => {
    const score = createEmptyScore({ title: 'Test', measures: 40 });
    const onLeaveScroll = jest.fn();
    const view = renderWithApp(
      <ScrollingScore score={score} onLeaveScroll={onLeaveScroll} />,
    );
    const { scroller } = verticalScroller(view);
    fireEvent.scroll(scroller, {
      nativeEvent: { contentOffset: { x: 0, y: 610 } },
    });
    expect(onLeaveScroll).not.toHaveBeenCalled();
    view.unmount();
    expect(onLeaveScroll).toHaveBeenCalledWith({ left: 0, top: 610 });
  });
});
