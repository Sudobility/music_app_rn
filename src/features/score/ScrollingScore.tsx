/**
 * The score in a scroll view, drawing only what is on screen.
 *
 * That windowing *is* the virtualization — the renderer draws the visible
 * systems per frame, so a 200-bar score costs what a 64-bar one does. The
 * spacer below the canvas gives the scroll view the full content size so the
 * bar behaves honestly, while the canvas itself stays viewport-sized.
 *
 * **Every geometric question goes to `ScoreCanvas`** (music_drawing, see its
 * `docs/score-canvas.md`), the same object the web editor asks: the content
 * size, what a touch landed on, the tick under it, the cursor and where
 * following playback scrolls. This component used to answer those itself and
 * disagreed with the web — its viewport and hit tests mixed logical and zoomed
 * units, so they were right only at 100%, and a touch on the spacer (already
 * in content coordinates) had the scroll offset added a second time. What is
 * left here is wiring: touches and scroll views. Which store action a hit means
 * is music_editing's, and the editor asks it.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTheme } from '@/config/ThemeContext';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import {
  DARK_RENDER_THEME,
  LIGHT_RENDER_THEME,
  bindPlaybackToCanvas,
} from '@sudobility/music_drawing';
import type { RenderTheme } from '@sudobility/music_drawing';
import {
  getMusicPosition,
  getMusicPositionSource,
} from '@sudobility/music_types';
import type { PitchDisplay, Score } from '@sudobility/music_types';
import { getAppServices } from '@/config/initialize';
import { ScoreView } from './ScoreView';
import { PlaybackCursor } from './PlaybackCursor';
import { useScoreCanvas } from './useScoreCanvas';
import type { ScrollOffset } from './useScoreCanvas';
import type { ScoreSelection } from './useScoreSelection';
import { useContainerSize } from '@/features/layout/useContainerSize';
import { classifyPress } from '@sudobility/music_editing';
import type {
  LayoutMode,
  ScoreCanvasHit,
  TrackInfoMode,
} from '@sudobility/music_types';

export type ScrollingScoreProps = {
  score: Score;
  zoom?: number;
  /** How systems are packed: wrapped to the width, or one long system. */
  layoutMode?: LayoutMode;
  theme?: RenderTheme;
  activeTrackId?: string | null;
  /**
   * Which tracks to draw, top to bottom; absent draws every one. The editor
   * passes `selectVisibleTrackIds`, so hiding a part in the track picker hides
   * its staves — the published view has no picker and draws them all.
   */
  trackIds?: string[];
  /** What is selected; absent on the read-only published view. */
  selection?: ScoreSelection;
  /**
   * Which pitch to draw. Only the editor has this setting; a published score
   * is read in concert pitch, which is the default.
   */
  pitchDisplay?: PitchDisplay;
  /**
   * How much of the track-info gutter the canvas reserves and paints: the
   * whole column, the instrument icon alone, or nothing. Default `full`.
   *
   * The editor decides — from the reader's pref, and from whether the
   * inspector column is open (see `trackInfoShown`). It is a *layout* option
   * in `ScoreCanvas`, so the width a narrower mode gives up goes back to the
   * music rather than merely going unpainted, and the hit test, the content
   * size, the caret's clip and the follow-scroll all move with it. The
   * published view leaves it alone.
   */
  trackInfo?: TrackInfoMode;
  /**
   * A tap: what the canvas says is under it, and the tick at that point.
   *
   * One callback for every kind of hit — the track gutter, the bar-number band,
   * a note, a stave, or nothing — because what a tap *means* is not this view's
   * to decide. It used to be: five per-kind callbacks, each wired to a
   * different store action by the editor, and the native routing had quietly
   * parted from the web's (a long press on a stave aimed the caret, which
   * cleared the selection the menu was about to act on). The editor hands both
   * to music_editing's `routeScorePress`, which is the web's click handler.
   *
   * The tick is `ScoreCanvas.tickAt` for the point, not the hit's own: a hit
   * exists only inside a measure, and a Mod press between systems still means
   * "select to here". A press on nothing is still reported, for that reason.
   *
   * Absent on the read-only published view, which has nothing to select.
   */
  onPress?: (hit: ScoreCanvasHit | null, pointTick: number | null) => void;
  /**
   * A press held in place — where the web reads a right-click. The editor
   * selects what it landed on (`selectForContextMenu`, which keeps a selection
   * the press falls inside) and opens the menu on it.
   *
   * Distinguished from a tap and from a scroll by music_drawing's
   * `classifyPress`, on time and travel rather than through a gesture library:
   * the touch surface is a plain spacer inside a `ScrollView`, and anything
   * that claims the responder here would take the scroll with it.
   */
  onLongPress?: (hit: ScoreCanvasHit | null) => void;
  /**
   * Where to open, for a view that is one tab of several.
   *
   * An offset reopens where the reader left the tab; `null` — a document never
   * scrolled — brings the caret into view with `ScoreCanvas.followTarget`, the
   * answer following playback uses. Absent opens at the top, which is what the
   * published view wants. Applied once per axis, when that scroll view's
   * content is first laid out: scrolling a spacer that has no height yet
   * clamps to the top.
   *
   * The editor is a fresh component per document, so without this a tab
   * brought back to the front opened at the top, pages away from the caret the
   * document list had just restored for it.
   */
  initialScroll?: ScrollOffset | null;
  /** Where the view was scrolled when it goes away, so the tab can reopen there. */
  onLeaveScroll?: (offset: ScrollOffset) => void;
  /**
   * The right safe-area inset to honour, in points — the notch/cutout on the
   * side the score runs up against (0 when something else, like the inspector
   * column, clears it instead).
   *
   * Page mode is not scrolled sideways, so the drawable area is narrowed by
   * this much and the music never falls under the cutout. Continuous mode *is*
   * scrolled sideways: the one wide system runs to the physical edge, and the
   * inset becomes a `contentInset`/`scrollIndicatorInsets` on the right so the
   * last bar can still be scrolled clear of the cutout and the scrollbar sits
   * inboard of it.
   */
  rightInset?: number;
};

/** How often a scroll reports back. 16ms is one frame; more is wasted repaint. */
const SCROLL_EVENT_THROTTLE = 16;

const NO_IDS: readonly string[] = [];

export function ScrollingScore({
  score,
  zoom = 1,
  layoutMode = 'page',
  theme,
  activeTrackId = null,
  trackIds,
  selection,
  pitchDisplay = 'concert',
  trackInfo = 'full',
  onPress,
  onLongPress,
  initialScroll,
  onLeaveScroll,
  rightInset = 0,
}: ScrollingScoreProps) {
  /*
    The canvas draws in literal colours, so it has to be told the scheme.

    VexFlow paints straight to the context and never resolves a CSS variable or
    a NativeWind class, which is why these are two hand-written palettes rather
    than tokens — the same reason the notation glyphs take a literal ink.
  */
  const { resolved } = useTheme();
  const resolvedTheme =
    theme ?? (resolved === 'dark' ? DARK_RENDER_THEME : LIGHT_RENDER_THEME);

  const { size, onLayout, measured } = useContainerSize();
  const { width, height } = size;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const verticalRef = useRef<ScrollView | null>(null);
  const horizontalRef = useRef<ScrollView | null>(null);
  const { canvas, picture, cursor, scroll } = useScoreCanvas({
    vertical: verticalRef,
    horizontal: horizontalRef,
    size: sizeRef,
  });

  /*
    Scroll offsets, in content px. The signal is shared by touch handling and
    the cursor overlay, so a playback scroll is visible to both immediately.
    Reading it does not re-render this component.
  */
  const continuous = layoutMode === 'continuous';
  // Page mode narrows the drawable area; continuous mode keeps full width and
  // insets the horizontal scroller instead. See `rightInset`.
  const pageRightInset = continuous ? 0 : rightInset;
  const scrollRightInset = continuous ? rightInset : 0;

  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    /*
      The score as stored, and the reading mode. The canvas applies the display
      lenses and scans the stored pitches for notes the instrument cannot play
      — once per score, where computing the drawn score here did it on every
      render of this component.
    */
    canvas.setStoredScore(score, pitchDisplay);
    if (measured && width > 0 && height > 0) {
      canvas.setView({
        width,
        height,
        zoom,
        layoutMode,
        theme: resolvedTheme,
        trackInfo,
        ...(trackIds ? { trackIds } : {}),
      });
    }
    const next = canvas.contentSize();
    setContentSize(previous =>
      previous.width === next.width && previous.height === next.height
        ? previous
        : next,
    );
  }, [
    canvas,
    score,
    pitchDisplay,
    measured,
    width,
    height,
    zoom,
    layoutMode,
    resolvedTheme,
    trackInfo,
    trackIds,
  ]);

  useLayoutEffect(() => {
    canvas.setActiveTrack(activeTrackId);
  }, [canvas, activeTrackId]);

  useLayoutEffect(() => {
    canvas.setSelectedNotes(selection?.noteIds ?? NO_IDS, {
      regenerated: selection?.regenerated ?? false,
    });
    canvas.setSelectedMeasures(selection?.measureIds ?? NO_IDS);
  }, [canvas, selection]);

  /*
    Playback — the cursor, the lit notes and following the music — is the
    shared binding's, the same rules the web runs. Bound after the effects
    above so the canvas already holds the score it will place the cursor in.
  */
  useLayoutEffect(
    () =>
      bindPlaybackToCanvas(canvas, {
        position: getMusicPosition(),
        // One decision per burst: a stop homes to 0 and then reports stopped
        // in the same call, and that is not a jump to bar 1.
        defer: work => queueMicrotask(work),
        onSounding: listener => getAppServices().player.onSounding(listener),
        // The lit notes are published as far ahead as this canvas measures
        // drawing them takes — a Skia recording and a React commit here, much
        // longer than a web repaint — so they land with the sound.
        setSoundingRenderDelay: seconds =>
          getAppServices().player.setSoundingRenderDelay(seconds),
        now: () => performance.now(),
      }),
    [canvas],
  );

  const updateScroll = useCallback(
    (left: number, top: number) => {
      canvas.setScroll(left, top);
      const previous = scroll.get();
      if (previous.left !== left || previous.top !== top) {
        scroll.set({ left, top });
      }
    },
    [canvas, scroll],
  );

  /*
    Reopening: which axes still wait to be placed, and where. Read once at
    mount — a later prop is not a request to jump. Page mode has no horizontal
    scroller, so only the vertical axis waits there.
  */
  const restore = useRef<{
    vertical: boolean;
    horizontal: boolean;
    target: ScrollOffset | null | undefined;
  } | null>(
    initialScroll === undefined
      ? null
      : { vertical: true, horizontal: continuous, target: undefined },
  );
  const initialScrollRef = useRef(initialScroll);

  /** The offset to reopen at, worked out the first time an axis needs it. */
  const restoreTarget = useCallback((): ScrollOffset | null => {
    const pending = restore.current;
    if (!pending) return null;
    if (pending.target === undefined) {
      pending.target =
        initialScrollRef.current ??
        canvas.followTarget(getMusicPosition().tick);
    }
    return pending.target;
  }, [canvas]);

  const onContentSizeChange = useCallback(
    (_width: number, contentHeight: number) => {
      const pending = restore.current;
      if (!pending?.vertical || contentHeight <= 0) return;
      pending.vertical = false;
      const target = restoreTarget();
      if (!target) return;
      const top = Math.min(
        target.top,
        Math.max(0, contentHeight - sizeRef.current.height),
      );
      if (top <= 0) return;
      verticalRef.current?.scrollTo({ y: top, animated: false });
      updateScroll(scroll.get().left, top);
    },
    [restoreTarget, updateScroll, scroll],
  );

  const onContentSizeChangeHorizontal = useCallback(
    (contentWidth: number) => {
      const pending = restore.current;
      if (!pending?.horizontal || contentWidth <= 0) return;
      pending.horizontal = false;
      const target = restoreTarget();
      if (!target) return;
      const left = Math.min(
        target.left,
        Math.max(0, contentWidth - sizeRef.current.width),
      );
      if (left <= 0) return;
      horizontalRef.current?.scrollTo({ x: left, animated: false });
      updateScroll(left, scroll.get().top);
    },
    [restoreTarget, updateScroll, scroll],
  );

  // Banked on the way out from the latest signal value, including a playback
  // scroll that did not produce a native onScroll event.
  const onLeaveScrollRef = useRef(onLeaveScroll);
  onLeaveScrollRef.current = onLeaveScroll;
  useEffect(
    () => () => onLeaveScrollRef.current?.({ ...scroll.get() }),
    [scroll],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateScroll(scroll.get().left, e.nativeEvent.contentOffset.y);
    },
    [updateScroll, scroll],
  );

  const onScrollHorizontal = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateScroll(e.nativeEvent.contentOffset.x, scroll.get().top);
    },
    [updateScroll, scroll],
  );

  /**
   * Where and when the current press began.
   *
   * A ref, not state: it changes on every touch and nothing renders from it.
   * Travel is measured in **page** coordinates, never the surface's own: the
   * surface scrolls with the finger, so during a scroll its `location` barely
   * moves and a flick that came to rest over a note would read as a tap on it.
   */
  const pressStart = useRef<{ x: number; y: number; at: number } | null>(null);

  const pressAt = useCallback(
    (event: GestureResponderEvent, longPress: boolean) => {
      const { locationX, locationY } = event.nativeEvent;
      const offset = scroll.get();
      const point = {
        x: locationX - offset.left,
        y: locationY - offset.top,
      };
      const hit = canvas.hitTest(point);
      if (longPress) {
        onLongPress?.(hit);
      } else {
        const tick = canvas.tickAt(point);
        if (onPress) onPress(hit, tick);
        else if (Platform.OS === 'windows' && tick !== null)
          getMusicPositionSource().moveTo(tick);
      }
    },
    [canvas, scroll, onPress, onLongPress],
  );

  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    pressStart.current = { x: pageX, y: pageY, at: Date.now() };
  }, []);

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      const start = pressStart.current;
      pressStart.current = null;
      if (!start || (!onPress && !onLongPress && Platform.OS !== 'windows'))
        return;

      /*
        Decided before anything is hit-tested, so holding a track's name or a
        bar number opens the menu on it just as holding a note does. A drag is
        a scroll, and does nothing here.
      */
      const kind = classifyPress({
        dx: pageX - start.x,
        dy: pageY - start.y,
        heldMs: Date.now() - start.at,
        pointer: 'touch',
      });
      if (kind === 'drag') return;

      /*
        The spacer scrolls with the sheet, so its touch is in content px; the
        canvas takes view px. Its own hit order is the spec's: the gutter, the
        bar-number band, a note, a stave.
      */
      pressAt(e, kind === 'longPress');
    },
    [pressAt, onPress, onLongPress],
  );

  const TouchSurface = Platform.OS === 'windows' ? Pressable : View;
  const surfaceHandlers =
    Platform.OS === 'windows'
      ? {
          onPress: (event: GestureResponderEvent) => pressAt(event, false),
          ...(onLongPress
            ? {
                onLongPress: (event: GestureResponderEvent) =>
                  pressAt(event, true),
              }
            : {}),
        }
      : { onTouchStart, onTouchEnd };

  return (
    // Page mode is boxed in by the right cutout; the inner view is what gets
    // measured, so the canvas is laid out at the narrowed width.
    <View
      style={
        pageRightInset > 0
          ? [styles.fill, { paddingRight: pageRightInset }]
          : styles.fill
      }
    >
      <View style={styles.fill} onLayout={onLayout}>
        {/* Pinned under the scroll view: the canvas is viewport-sized and never
          moves, because what changes on a scroll is which systems it draws. */}
        {measured ? (
          /*
          Clipped: the cursor is a system tall and placed in content
          coordinates, so without it the line ran past the bottom of the score
          and across whatever sits below it — the piano keyboard, once that
          started expanded. A view does not clip its children by default here.
        */
          <View style={styles.pinned} pointerEvents="none">
            <ScoreView picture={picture} height={height} />
            <PlaybackCursor
              cursor={cursor}
              scroll={scroll}
              color={resolvedTheme.caret}
            />
          </View>
        ) : null}
        <ScrollView
          ref={verticalRef}
          style={styles.fill}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
          scrollEventThrottle={SCROLL_EVENT_THROTTLE}
        >
          {/*
          The spacer carries the touch as well as the content size: the canvas
          above is `pointerEvents="none"` so scrolling still works.

          In continuous mode it is nested in a horizontal scroll view, because
          the score is then one system as wide as the whole piece. In page mode
          there is deliberately no horizontal scroller at all — adding one would
          let a reader drag the sheet sideways to nothing.
        */}
          {continuous ? (
            <ScrollView
              ref={horizontalRef}
              horizontal
              onScroll={onScrollHorizontal}
              onContentSizeChange={onContentSizeChangeHorizontal}
              scrollEventThrottle={SCROLL_EVENT_THROTTLE}
              // Render to the physical edge, but let the last bar scroll clear of
              // the cutout and keep the scrollbar inboard of it (iOS).
              contentInset={{ right: scrollRightInset }}
              scrollIndicatorInsets={{ right: scrollRightInset }}
            >
              <TouchSurface
                style={{ height: contentSize.height, width: contentSize.width }}
                {...surfaceHandlers}
              />
            </ScrollView>
          ) : (
            <TouchSurface
              style={{ height: contentSize.height }}
              {...surfaceHandlers}
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pinned: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
});
