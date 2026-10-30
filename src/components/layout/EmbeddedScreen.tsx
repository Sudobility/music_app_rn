/**
 * Marks what is inside it as a pane of another screen, not a screen of its own.
 *
 * Settings shows Credits, Shortcuts, About and sign-in in its detail pane, and
 * each of those is also a screen that can be pushed. Pushed, its body offers
 * the way back on macOS (`ScreenBackBar.macos`); as a pane that control would
 * sit in the middle of the screen and leave the one that holds it. The pane is
 * wrapped in this and the back bar stands down.
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * The widest a detail panel's content is drawn, in points — the web's
 * `detailMaxWidth`. Narrower than this the content is as wide as its panel;
 * wider, it stops here and is centred in what is left over.
 */
export const DETAIL_MAX_WIDTH = 1024;

/**
 * The detail's inset on every side, in points — the web's `detailPadding`,
 * which is `px-6 pt-6 pb-6`. Inside whatever scrolls, so that the content
 * scrolls the whole height of the panel and the inset goes with it.
 */
export const DETAIL_PADDING = 24;

/**
 * The widest a screen with no list beside it is drawn, in points — the web's
 * page column, `max-w-7xl`. Its padding is inside that, as the web's is. The
 * screen itself still runs the width of the window, so what scrolls it keeps
 * its scroll bar at the window's edge; it is the content that stops growing
 * and is centred past this.
 */
export const SCREEN_MAX_WIDTH = 1280;

/** What holds a screen's content to `SCREEN_MAX_WIDTH`, centred. */
export const SCREEN_WIDTH_STYLE = {
  width: '100%',
  maxWidth: SCREEN_MAX_WIDTH,
  alignSelf: 'center',
} as const;

/**
 * What being a pane means, split into its two parts.
 *
 * - `embedded`: this is a pane, not a screen of its own, so a body-drawn back
 *   control stands down (the panel's bar carries the way back).
 * - `sidesHandled`: the split view has already cleared the left/right safe
 *   area for this pane, so the content must *not* clear them again. This is
 *   true for a pane shown **beside** another (the container widens the list
 *   panel and pads the detail), and **false** when the split view is collapsed
 *   and the pane is drawn full-width — then the pane meets the screen's own
 *   edges and has to clear the notch itself, exactly as a standalone screen
 *   does. A standalone screen (no provider) is `{ embedded: false,
 *   sidesHandled: false }`: not a pane, and responsible for its own sides.
 */
type EmbeddedState = { embedded: boolean; sidesHandled: boolean };

const EmbeddedContext = createContext<EmbeddedState>({
  embedded: false,
  sidesHandled: false,
});

export function EmbeddedScreen({
  children,
  /** False when the pane is drawn full-width (a collapsed split view). */
  sidesHandled = true,
}: {
  children: ReactNode;
  sidesHandled?: boolean;
}) {
  return (
    <EmbeddedContext.Provider value={{ embedded: true, sidesHandled }}>
      {children}
    </EmbeddedContext.Provider>
  );
}

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext).embedded;
}

/**
 * Whether the split view has already cleared this content's side safe areas.
 * A screen clears its own sides when this is false — standalone, or a pane
 * drawn full-width in a collapsed split view.
 */
export function useSidesHandled(): boolean {
  return useContext(EmbeddedContext).sidesHandled;
}

/**
 * The inset a screen gives its content: the detail's own as a pane of a
 * split view, and what the screen would use as a screen otherwise.
 */
export function useContentPadding(asScreen: number): number {
  return useEmbedded() ? DETAIL_PADDING : asScreen;
}
