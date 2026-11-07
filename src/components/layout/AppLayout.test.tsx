/**
 * The editor's row order, which is the one thing about this layout that has to
 * match the web app exactly.
 *
 * Somebody who knows where the transport is should not have to look for it, and
 * the order is not something either app can check for itself — each is
 * internally consistent whichever way round these two sit.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import { devicePrefs } from '@/config/useDevicePrefs';
import { renderWithApp, testDocument } from '@/test/render';
import * as menuCommands from '@/app/menu-commands';
import * as nativeHeader from '@/app/native-header';

/*
  The tab strip reads the open-document list from a provider this test has no
  reason to stand up — it is a sibling of the rows under test, not part of them.
*/
/*
  Which edges are cleared is the one rule's (`useSafeEdges`), stood in for
  here as a tablet: the top, never the sides or the bottom.
*/
jest.mock('@/platform/safe-edges', () => {
  const rule = jest.requireActual('@/platform/safe-edges-rule') as {
    safeEdgesFor: (f: string, n: null) => Record<string, boolean>;
    edgesAmong: (e: Record<string, boolean>, a: string[]) => string[];
  };
  const edges = rule.safeEdgesFor('tablet', null);
  return {
    useSafeEdges: () => edges,
    useSafeEdgeList: (among: string[]) => rule.edgesAmong(edges, among),
  };
});
jest.mock('@/features/documents/DocumentTabs', () => ({
  DocumentTabs: () => null,
}));

/*
  The score view is replaced by one that records the two touch callbacks it is
  handed, so the tests can press "a note" or "a stave" without a canvas. What a
  touch *means* is music_editing's and tested there; what is pinned here is that
  the editor hands the view's answer to it, and opens the menu on a long press.
*/
const mockScoreProps: {
  onPress?: (hit: unknown, pointTick: number | null) => void;
  onLongPress?: (hit: unknown) => void;
  /** Whether the canvas was asked to draw the track-info gutter. */
  trackInfo?: string;
} = {};
jest.mock('@sudobility/music_ui_rn', () => ({
  ...(jest.requireActual('@sudobility/music_ui_rn') as Record<string, unknown>),
  ScrollingScore: (props: typeof mockScoreProps) => {
    mockScoreProps.onPress = props.onPress;
    mockScoreProps.onLongPress = props.onLongPress;
    mockScoreProps.trackInfo = props.trackInfo;
    return null;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppLayout, trackInfoShown } =
  require('./AppLayout') as typeof import('./AppLayout');

describe('AppLayout desktop menu', () => {
  /*
    `hasMenuBar()` is the one test — see `menu-commands.ts`'s own reasoning —
    so this is exercised by spying on its answer rather than standing up a
    real native menu module. `AppLayout` reads the export off the shared
    module object on every call, so a spy is visible with no re-require:
    `jest.resetModules()` + a fresh `require` was tried first and corrupted
    every test after it, because it also evicts `react` from the cache and a
    component required afterwards holds a second, disconnected copy of it —
    `Cannot read properties of null (reading 'useRef')` on the very next
    render, this file's or another's.
  */
  afterEach(() => jest.restoreAllMocks());

  it('hides the title bar where a menu bar carries its buttons instead', () => {
    jest.spyOn(menuCommands, 'hasMenuBar').mockReturnValue(true);
    const view = renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );
    expect(view.queryByLabelText('Save now')).toBeNull();
    expect(view.queryByLabelText('Projects')).toBeNull();
  });

  it('hides the title bar where the native header carries its buttons instead', () => {
    // iOS and Android: `useEditorHeader` hands the same controls to the
    // navigator, and a second set in the body would duplicate them.
    jest.spyOn(menuCommands, 'hasMenuBar').mockReturnValue(false);
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const view = renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );
    expect(view.queryByLabelText('Save now')).toBeNull();
    expect(view.queryByLabelText('Projects')).toBeNull();
  });

  it('shows the title bar with neither a menu bar nor a native header', () => {
    jest.spyOn(menuCommands, 'hasMenuBar').mockReturnValue(false);
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(false);
    const view = renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );
    expect(view.queryByLabelText('Save now')).not.toBeNull();
    expect(view.queryByLabelText('Projects')).not.toBeNull();
  });
});

describe('AppLayout Spatial view', () => {
  it("shows the 3D stage in the score's place while the toggle is on", () => {
    /*
      The stage replaces the notation rather than joining it: the transport's
      toggle swaps the two, and the button then offers the way back. The view
      itself is stubbed (`jest.spatial.cjs`) — what is pinned is the swap.
    */
    const view = renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );
    expect(view.queryByTestId('spatial-view')).toBeNull();

    fireEvent.press(view.getByLabelText('Show Spatial view'));
    expect(view.getByTestId('spatial-view')).toBeTruthy();
    expect(view.getByLabelText('Hide Spatial view')).toBeTruthy();

    fireEvent.press(view.getByLabelText('Hide Spatial view'));
    expect(view.queryByTestId('spatial-view')).toBeNull();
  });
});

describe('AppLayout', () => {
  it('puts the transport above the keyboard', () => {
    /*
      The keyboard is the only row down there whose height changes — it
      collapses, and it is optional. With it in between, opening or closing it
      moved the transport, which is the row a thumb goes to without looking.

      Asserted on the rendered tree's order rather than on a snapshot: what is
      being pinned is which comes first, not the markup around either.
    */
    const view = renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );

    // Expanded by default, as on the web, so there is an order to assert
    // without opening it first.
    const marks = view
      .UNSAFE_getAllByProps({})
      .map(node => node.props.accessibilityLabel ?? node.props.testID)
      .filter(
        (mark): mark is string =>
          mark === 'Playback transport' || mark === 'piano-keyboard-panel',
      );

    expect(marks[0]).toBe('Playback transport');
    expect(marks).toContain('piano-keyboard-panel');
  });

  it('starts with the keyboard expanded and remembers collapsing it as a device pref', () => {
    /*
      It was a `useState(true)` here: collapsed on every launch and forgotten on
      every tab. The web starts expanded, and a reader who collapses it has
      collapsed it for the device.
    */
    devicePrefs.getState().setKeyboardCollapsed(false);
    const view = renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );
    expect(view.queryByTestId('piano-keyboard-panel')).not.toBeNull();
    fireEvent.press(view.getByLabelText('Hide keyboard'));
    expect(devicePrefs.getState().keyboardCollapsed).toBe(true);
    expect(view.queryByTestId('piano-keyboard-panel')).toBeNull();
    act(() => devicePrefs.getState().setKeyboardCollapsed(false));
  });

  function edgesOf(view: ReturnType<typeof renderWithApp>) {
    return view
      .UNSAFE_getAllByProps({})
      .map(node => node.props.edges as string[] | undefined)
      .filter(value => Array.isArray(value));
  }

  function layout() {
    return renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );
  }

  it('clears the edges the rule names and no other: a tablet, its top and bottom', () => {
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(false);
    const edges = edgesOf(layout());
    expect(edges).toContainEqual(['top']);
    // The sides are asked for by every bar, and the rule says no to each.
    expect(edges.every(value => !value?.includes('left'))).toBe(true);
    // The bottom is asked for by the last row alone, and the rule says yes:
    // Android draws the app under its own navigation bar.
    expect(edges.some(value => value?.includes('bottom'))).toBe(true);
  });

  it('leaves the top to the navigator where it draws the header', () => {
    /*
      The header has cleared the status bar already. Clearing it again put an
      empty band the height of the status bar between the header and the
      toolbar.
    */
    jest.spyOn(nativeHeader, 'hasNativeHeader').mockReturnValue(true);
    const edges = edgesOf(layout());
    expect(edges.some(value => value?.includes('top'))).toBe(false);
  });

  describe('touches on the score', () => {
    function layout() {
      const document = testDocument({ measures: 4 });
      const view = renderWithApp(
        <AppLayout
          document={document}
          onSave={jest.fn()}
          onExport={jest.fn()}
          onSettings={jest.fn()}
          onDocuments={jest.fn()}
        />,
      );
      return { document, view };
    }

    it('routes a tap on a track name through the shared press rules', () => {
      const { document } = layout();
      const trackId = document.store.getState().score!.tracks[0]!.id;
      act(() =>
        mockScoreProps.onPress!({ kind: 'trackGutter', trackId }, null),
      );
      expect(document.store.getState().selection.trackIds).toEqual([trackId]);
    });

    it('hands the score no touch handlers while it is read-only', () => {
      // A job writing the score: a tap must neither move the caret nor open
      // the menu that edits. The lock in the store is what holds; this is
      // what keeps the touch from reaching it at all.
      mockScoreProps.onPress = undefined;
      mockScoreProps.onLongPress = undefined;
      renderWithApp(
        <AppLayout
          document={testDocument({ measures: 4 })}
          onSave={jest.fn()}
          onExport={jest.fn()}
          onSettings={jest.fn()}
          onDocuments={jest.fn()}
          scoreReadOnly
        />,
      );
      expect(mockScoreProps.onPress).toBeUndefined();
      expect(mockScoreProps.onLongPress).toBeUndefined();
    });

    it('keeps the selection when a long press lands on a bare stave, and opens the menu', () => {
      /*
        The long press used to aim the caret first, which clears the selection
        — so the menu opened over nothing, on the very selection it was meant
        to act on.
      */
      const { document, view } = layout();
      const score = document.store.getState().score!;
      const track = score.tracks[0]!;
      const measureIds = [track.measures[1]!.id];
      act(() =>
        document.store
          .getState()
          .setSelection({ eventIds: [], measureIds, trackIds: [] }),
      );
      act(() =>
        mockScoreProps.onLongPress!({
          kind: 'stave',
          trackId: track.id,
          tick: 0,
          pitch: null,
          measureIndex: 0,
        }),
      );
      expect(document.store.getState().selection.measureIds).toEqual(
        measureIds,
      );
      // The menu names what it acts on.
      expect(view.getByText('Bar')).toBeTruthy();
    });
  });
});

/**
 * The inspector is a right-hand column, and on touch it trades places with the
 * canvas track gutter.
 *
 * Both halves matter and neither is visible in the other. It used to be a
 * column above 760×600 and a strip beneath the score below that — a rule that
 * made sense while a portrait tablet was possible and does not now that every
 * device is landscape-only, where a column costs width (plentiful) and a strip
 * costs height (the only thing the score has none of). And a column beside a
 * 220pt gutter left 216pt of music on a landscape phone, which is one bar per
 * system: the gutter has to go while the panel is up.
 */
describe('AppLayout inspector', () => {
  function render() {
    return renderWithApp(
      <AppLayout
        document={testDocument()}
        onSave={jest.fn()}
        onExport={jest.fn()}
        onSettings={jest.fn()}
        onDocuments={jest.fn()}
      />,
    );
  }

  /** The wrapper `View` the inspector sits in, by walking up from its label. */
  function inspectorWrapper(view: ReturnType<typeof render>) {
    // `getAllBy…`: the name reaches the tree more than once on the way through
    // the component and its host view, and either is the same place in it.
    let node = view.getAllByLabelText('Inspector')[0]?.parent ?? null;
    while (node) {
      const className = node.props?.className as string | undefined;
      if (className?.includes('border-l') || className?.includes('border-t')) {
        return className;
      }
      node = node.parent;
    }
    return undefined;
  }

  it('is a column on the right, never a strip underneath', () => {
    const view = render();
    fireEvent.press(view.getByLabelText('Toggle inspector panel'));
    const wrapper = inspectorWrapper(view);
    expect(wrapper).toBeDefined();
    // A left border and a stated width: a column. `border-t`/`flex-1` was the
    // strip, and there is no arrangement that produces one any more.
    expect(wrapper).toContain('border-l');
    expect(wrapper).toContain('w-80');
    expect(wrapper).not.toContain('border-t');
  });

  it('hides the full track gutter while it is shown, and brings it back', () => {
    act(() => devicePrefs.getState().setTrackInfo('full'));
    const view = render();
    // Unmeasured, so it opens closed: the gutter is what is on screen.
    expect(mockScoreProps.trackInfo).toBe('full');
    fireEvent.press(view.getByLabelText('Toggle inspector panel'));
    expect(mockScoreProps.trackInfo).toBe('hidden');
    fireEvent.press(view.getByLabelText('Toggle inspector panel'));
    expect(mockScoreProps.trackInfo).toBe('full');
  });

  it('keeps a gutter narrowed to the icon beside the inspector', () => {
    // 40 points, where the full column is 220: there is room for both.
    act(() => devicePrefs.getState().setTrackInfo('icon'));
    const view = render();
    expect(mockScoreProps.trackInfo).toBe('icon');
    fireEvent.press(view.getByLabelText('Toggle inspector panel'));
    expect(mockScoreProps.trackInfo).toBe('icon');
    act(() => devicePrefs.getState().setTrackInfo('full'));
  });

  it('draws no gutter for a reader who hid it, inspector or not', () => {
    act(() => devicePrefs.getState().setTrackInfo('hidden'));
    const view = render();
    expect(mockScoreProps.trackInfo).toBe('hidden');
    fireEvent.press(view.getByLabelText('Toggle inspector panel'));
    expect(mockScoreProps.trackInfo).toBe('hidden');
    act(() => devicePrefs.getState().setTrackInfo('full'));
  });

  it('trades only where the two cannot share the screen', () => {
    expect(trackInfoShown('full', true, true)).toBe('hidden');
    // macOS: a window wide enough for both.
    expect(trackInfoShown('full', true, false)).toBe('full');
    expect(trackInfoShown('icon', true, true)).toBe('icon');
    expect(trackInfoShown('hidden', false, true)).toBe('hidden');
  });
});
