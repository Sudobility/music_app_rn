/**
 * The one rule for a detail pane's own safe area, so no pane re-derives an
 * inset. Kept apart from `EmbeddedScreen` — which is a pure context module many
 * screens import — because these read `@/platform/safe-edges`, and that pulls
 * in the notch heuristic (and, through it, navigation) that some narrow test
 * environments do not mock.
 */
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import { SafeAreaView as TabSafeAreaView } from 'react-native-screens/experimental';
import { useSafeAreaInsets } from '@/platform/SafeArea';
import { useSafeEdges } from '@/platform/safe-edges';
import { useContentPadding, useSidesHandled } from './EmbeddedScreen';

/** A screen's own padding when it is not a pane, in points — `ScreenScaffold`'s. */
const SCREEN_PADDING = 16;

/**
 * The rule for a **vertically-scrollable** detail surface — a `ScrollView`, a
 * `FlatList`, a tile grid. Spread the result onto the scroller.
 *
 * - **Vertical** (the axis that scrolls): its ends are cleared by a *scroll
 *   inset* (`contentInsetAdjustmentBehavior='automatic'`), so the content
 *   scrolls full-bleed past the top bar and the bottom tab bar / home indicator
 *   and stops clear of them — never a fixed pad that cuts the scroll short.
 * - **Horizontal** (does not scroll): the sides are *padded* by the safe area,
 *   but only where the split view has not already cleared them (`sidesHandled`)
 *   — beside the master its sides are the split's; drilled in full-width or
 *   standalone they are the screen's.
 *
 * `padding` is the content's own inset (a pane's 24, a screen's 16 — the
 * `useContentPadding` rule); `gap` the space between its children.
 */
export function useDetailScroll(opts?: { gap?: number; padding?: number }): {
  contentInsetAdjustmentBehavior: 'automatic';
  contentContainerStyle: ViewStyle;
} {
  const insets = useSafeAreaInsets();
  const edges = useSafeEdges();
  const sidesHandled = useSidesHandled();
  const pad = useContentPadding(opts?.padding ?? SCREEN_PADDING);
  return {
    contentInsetAdjustmentBehavior: 'automatic',
    contentContainerStyle: {
      gap: opts?.gap ?? pad,
      paddingTop: pad,
      paddingBottom: pad,
      paddingLeft: pad + (!sidesHandled && edges.left ? insets.left : 0),
      paddingRight: pad + (!sidesHandled && edges.right ? insets.right : 0),
    },
  };
}

const BOTTOM_EDGE = { bottom: true } as const;

/**
 * Renders a **non-scrolling** subview inside the safe area of the tab's content
 * view: the bottom of that safe area is the top of the tab bar, so a pinned
 * footer stops above the bar rather than running behind it. A scroll view does
 * this for itself with its scroll inset; a view that does not scroll cannot, so
 * it is laid out inside this instead.
 *
 * This is `react-native-screens`' own `SafeAreaView`, which knows the bar is
 * there — `react-native-safe-area-context` reads only the window's insets and
 * does not — so there is no bar height to measure or special-case. Only iOS
 * runs the screen under the floating bar; Android keeps the whole screen above
 * it (`MainTabs`' `SCREEN_LAYOUT`) and a desktop has no bar over its content, so
 * on those the children are already within the content view and pass through.
 */
export function AboveTabBar({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') return <>{children}</>;
  return <TabSafeAreaView edges={BOTTOM_EDGE}>{children}</TabSafeAreaView>;
}
