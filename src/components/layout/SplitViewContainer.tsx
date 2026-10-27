/**
 * The split view, for Projects, Docs and Settings: a list, and what was
 * chosen from it.
 *
 * A fixed-width primary panel on the left holding a list, a hairline divider,
 * and a secondary panel taking the rest.
 *
 * **Under the system's tab bar each panel keeps a navigation bar; in a
 * desktop window neither has one.** On iOS and Android the bar is what the
 * content scrolls beneath and stops under — and on an iPad it is the row the
 * tab bar floats across, so without it the content ran up under the tabs. A
 * desktop window draws its tab bar as a row of its own, above the screen,
 * and needs no second row under it.
 *
 * **The list's bar is untitled.** It used to say what it was a list of —
 * "Projects" over the Projects list, under a tab bar that already said
 * Projects. The tab bar is the main navigation and names the screen. What
 * was chosen is still named: in the detail's bar on a phone or a tablet, and
 * as a heading at the top of the detail in a desktop window, which is where
 * the web's master/detail layout names it.
 *
 * There is no width test: this app is landscape-only on every device and
 * must never size from `useWindowDimensions()` (on macOS it reports the
 * display, not the window).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  NavigationContainer,
  NavigationIndependentTree,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { hasTopTabBar } from '@/app/tab-bar';
import { useNavigationTheme } from '@/app/useNavigationTheme';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'react-native-heroicons/outline';
import {
  Heading,
  MIN_TOUCH_TARGET,
  Text,
  useFormFactor,
} from '@sudobility/components-rn';
import { useNotationInk } from '@/components/icons/notation-ink';
import { SafeAreaView, useSafeAreaInsets } from '@/platform/SafeArea';
import { SafeAreaView as TabSafeAreaView } from 'react-native-screens/experimental';
import { useSafeEdgeList, useSafeEdges } from '@/platform/safe-edges';

const TOP = ['top'] as const;
const NO_EDGES = [] as const;
const SIDES = ['left', 'right'] as const;
import {
  DETAIL_MAX_WIDTH,
  DETAIL_PADDING,
  EmbeddedScreen,
} from './EmbeddedScreen';

/**
 * Below this measured width the split view collapses to one column at a time,
 * the way a phone in portrait shows a list and drills into what is chosen.
 * Above it — a phone in landscape, every iPad, a desktop window — both panels
 * sit side by side. 600 falls between a large phone's portrait width (~430)
 * and both its landscape width (~670) and an iPad's narrowest (~744).
 */
const COLLAPSE_MAX_WIDTH = 600;

/**
 * Collapse is a phone-in-hand behaviour, so it is gated to the touch
 * platforms: a narrow desktop window keeps both panels (and `onLayout` there
 * does not track a window resize anyway).
 */
const IS_TOUCH = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Whether the split view is collapsed to one column, and which column shows.
 * `SplitViewContainer` provides it: the list calls `showDetail` when a row is
 * chosen, and the detail's bar calls `showList` to go back. When the view is
 * not collapsed every field is inert — both panels are on screen at once — so
 * a list may call `showDetail` unconditionally.
 */
type SplitCollapse = {
  collapsed: boolean;
  detailShown: boolean;
  showDetail: () => void;
  showList: () => void;
};

const SplitCollapseContext = createContext<SplitCollapse>({
  collapsed: false,
  detailShown: false,
  showDetail: () => {},
  showList: () => {},
});

/** Read the collapse state from within a panel or a list. */
export function useSplitCollapse(): SplitCollapse {
  return useContext(SplitCollapseContext);
}

/** The primary panel's width, in points — `sudojo_app_rn`'s. */
export const PRIMARY_PANEL_WIDTH = 320;

/**
 * The same, on a phone. A phone in landscape is some 750 points across once
 * its cutout is cleared, and a 320-point list took over two fifths of that
 * to show names a line long; this leaves the detail the rest.
 */
export const PHONE_PRIMARY_PANEL_WIDTH = 240;

/**
 * How wide the list is here. By the device, not the window: a phone is a
 * phone however it is held, and this app never sizes from the window.
 */
export function usePrimaryPanelWidth(): number {
  return useFormFactor() === 'phone'
    ? PHONE_PRIMARY_PANEL_WIDTH
    : PRIMARY_PANEL_WIDTH;
}

/**
 * Clears whatever sits over the top of the screen, once, for whatever is
 * inside — and only the status bar.
 *
 * The native view rather than the hook: the hook answers with the window's
 * inset, which on an iPad reaches below the floating tab bar, while the
 * view knows the tabs' own bar has that row.
 */
function TopClearance({ children }: { children: ReactNode }) {
  // The one rule (`useSafeEdges`): a tablet clears the status bar, a phone
  // has none to clear — its bar is hidden, and Android goes on reporting
  // the room it took as inset — and the bars start at the edge. Except
  // under a top tab bar, whose native bar has cleared the status bar
  // already: clearing it again put a band of nothing between the tabs and
  // the panels, which a screen with no panels (Community) never had.
  const wanted = useSafeEdgeList(TOP);
  const edges = hasTopTabBar() ? NO_EDGES : wanted;
  return (
    <SafeAreaView edges={edges} className="bg-background flex-1">
      {children}
    </SafeAreaView>
  );
}

/**
 * A panel's content held above a floating tab bar.
 *
 * A screen that is one scroll view gets that for free: iOS insets the first
 * scroll view under a tab so its end scrolls up past the bar. A panel's
 * scroller is behind a bar of its own and is not that view, so a list's last
 * row and a form's Create button sat under the bar with no way to scroll
 * them out. This is react-native-screens' own safe-area view, which knows
 * the bar is there — `react-native-safe-area-context` reads the window's
 * insets and does not. The panel's background and the divider beside it
 * still run to the screen's edge; only the content stops.
 *
 * iOS only: on Android the whole screen is kept above the opaque bar
 * (`MainTabs`), and on a desktop or under an iPad's top tab bar there is no
 * bar along the bottom to clear.
 */
function AboveTabBar({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios' || hasTopTabBar()) return <>{children}</>;
  return <TabSafeAreaView edges={BOTTOM_EDGE}>{children}</TabSafeAreaView>;
}

const BOTTOM_EDGE = { bottom: true } as const;

/**
 * A screen that is not a split view, under a bar that names it: Community,
 * Resources. The same bar a split view's panels have, so every screen under
 * the tab bar is titled the same way. A desktop draws no bars, and the
 * screen is what it holds.
 */
export function TitledScreen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  if (!hasPanelBar()) return <>{children}</>;
  return (
    <TopClearance>
      <PanelBar title={title}>{children}</PanelBar>
    </TopClearance>
  );
}

/**
 * A screen's content clear of the notch's side, whichever it is — the one
 * rule (`useSafeEdges`) says which, if either.
 */
export function SideClearance({ children }: { children: ReactNode }) {
  const edges = useSafeEdgeList(SIDES);
  return (
    <SafeAreaView edges={edges} className="flex-1">
      {children}
    </SafeAreaView>
  );
}

export function SplitViewContainer({
  primaryPanel,
  secondaryPanel,
  collapsible = false,
}: {
  /** The left panel: a `SplitPanel` holding the list. */
  primaryPanel: ReactNode;
  /** The right panel: a `SplitPanel` holding what was chosen. */
  secondaryPanel: ReactNode;
  /**
   * Whether this split view collapses to one column at a time where the window
   * is narrow — a phone in portrait. Off by default, so a split view that is
   * only ever shown wide (a desktop window, the editor's popup) is unaffected.
   * Even on, it collapses only on a touch platform below `COLLAPSE_MAX_WIDTH`.
   */
  collapsible?: boolean;
}) {
  // The list is what meets the screen's left edge, so its panel is what
  // widens to clear a notch there; the detail meets the right edge, and
  // pads for one there. Which is which, if either, is the one rule's.
  const insets = useSafeAreaInsets();
  const edges = useSafeEdges();
  const primaryWidth = usePrimaryPanelWidth();

  // Measured, not taken from `useWindowDimensions()`: the window's width is the
  // display's on macOS, and this is the view's own. It stays null until the
  // first layout, so the view renders as two panes until it knows it is narrow
  // — which also keeps it two-pane under a test renderer, where layout never
  // fires.
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const collapsed =
    collapsible && IS_TOUCH && width !== null && width < COLLAPSE_MAX_WIDTH;

  const [detailShown, setDetailShown] = useState(false);
  const showDetail = useCallback(() => setDetailShown(true), []);
  const showList = useCallback(() => setDetailShown(false), []);
  const collapse = useMemo<SplitCollapse>(
    () => ({ collapsed, detailShown, showDetail, showList }),
    [collapsed, detailShown, showDetail, showList],
  );

  return (
    <SplitCollapseContext.Provider value={collapse}>
      <TopClearance>
        <View testID="split-container" className="flex-1" onLayout={onLayout}>
          {collapsed ? (
            // One column at a time: the list, or — once a row is chosen — what
            // it chose, as a pane (its own back bar stands down; the panel's
            // bar carries the way back).
            detailShown ? (
              <EmbeddedScreen>{secondaryPanel}</EmbeddedScreen>
            ) : (
              primaryPanel
            )
          ) : (
            <View className="flex-1 flex-row">
              <View
                style={{ width: primaryWidth + (edges.left ? insets.left : 0) }}
              >
                {primaryPanel}
              </View>
              <View className="bg-border" style={styles.divider} />
              <View
                className="min-w-0 flex-1"
                style={{ paddingRight: edges.right ? insets.right : 0 }}
              >
                <EmbeddedScreen>{secondaryPanel}</EmbeddedScreen>
              </View>
            </View>
          )}
        </View>
      </TopClearance>
    </SplitCollapseContext.Provider>
  );
}

type PanelParamList = { Panel: undefined };
/*
  The plain stack on every platform, not `createAppStackNavigator`'s native
  one. A native bar is laid out against the *window*: under an iPad's tab
  bar, which floats across the top, each panel's bar stretched up beneath it
  to twice its height. A panel is one screen that never pushes, so there is
  no transition for a native stack to have done better.
*/
const PanelStack = createStackNavigator<PanelParamList>();

/**
 * A panel's bar, as tall as the platform's own: Material's top app bar, an
 * iPad's navigation bar, an iPhone's.
 *
 * **Stated, because the navigator's own answer is a guess from the panel's
 * shape.** It draws a short bar for a view wider than it is tall and a
 * taller one otherwise — a rule about a phone turned on its side, asked of
 * a panel. The list on a phone is about as wide as it is tall, so the
 * answer changed with every layout, each answer changing the layout that
 * was measured for the next: the list's bar jumped between the two heights
 * without stopping, and the list under it jumped with it.
 */
function panelBarHeight(formFactor: ReturnType<typeof useFormFactor>): number {
  // Material's top app bar is 64 on a tablet and 48 on a phone held on its
  // side, which is the only way this app holds one. 64 over a phone's row
  // of content was a fifth of the screen.
  if (Platform.OS === 'android') return formFactor === 'phone' ? 48 : 64;
  return (Platform as { isPad?: boolean }).isPad ? 50 : 44;
}

/**
 * Whether a panel draws a navigation bar: where the system's tab bar is
 * along the bottom. Where it is along the top it is overlaid on the tabs'
 * own native bar, which is the one bar that row holds — a bar of ours under
 * it would be a second row. A desktop draws none.
 */
function hasPanelBar(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') && !hasTopTabBar()
  );
}

/**
 * One column.
 *
 * The detail is held to the web's width (`DetailWidth`) and named by
 * `title`: what was chosen from the list. Where a panel has a bar the title
 * is in it — except under an iPad's tab bar, which floats across the middle
 * of that same row and would be drawn over it — and where it has none the
 * title heads the content. **Both bars are titled, on a phone and a
 * tablet**: the list's with what it lists, the detail's with what was
 * chosen — a bar with nothing in it is a strip of blank. Where the tab bar
 * is along the top there is no bar of ours at all (`hasPanelBar`): the tabs'
 * own bar holds that row, with the tab bar overlaid on it, and the detail
 * is headed in its content instead, as on a desktop. A desktop draws no bars, and its list
 * is headed by nothing — the window's own title names it.
 *
 * **Behind a bar, a panel's content cannot reach the app's navigator with
 * `useNavigation()`**: the bar is a navigator of the panel's own, with one
 * screen. What leaves the split view is handed down from the screen that
 * holds it, as a prop or a callback.
 */
/**
 * A bar with `title` in it, over `children`: the plain stack's header, on a
 * navigator of its own with one screen.
 */
function PanelBar({
  title,
  children,
  onBack,
}: {
  title: string;
  children: ReactNode;
  /** When set, the bar carries a back control — the collapsed detail's way out. */
  onBack?: () => void;
}) {
  const theme = useNavigationTheme();
  const formFactor = useFormFactor();
  const { t } = useTranslation();
  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={theme}>
        <PanelStack.Navigator
          screenOptions={{
            headerShown: true,
            // The top of the screen has already been cleared.
            headerStatusBarHeight: 0,
            headerStyle: { height: panelBarHeight(formFactor) },
          }}
        >
          <PanelStack.Screen
            name="Panel"
            options={{
              title,
              // Where the split view is collapsed, the detail's bar is the one
              // place the way back can live: there is no list beside it to
              // return to. A list panel never gets one.
              headerLeft: onBack
                ? () => (
                    <Pressable
                      testID="split-back"
                      accessibilityRole="button"
                      accessibilityLabel={t('nav.back')}
                      onPress={onBack}
                      onAccessibilityTap={onBack}
                      hitSlop={8}
                      style={styles.back}
                    >
                      <ChevronLeftIcon size={24} color={theme.colors.primary} />
                    </Pressable>
                  )
                : undefined,
            }}
          >
            {() => children}
          </PanelStack.Screen>
        </PanelStack.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

export function SplitPanel({
  title,
  secondary = false,
  children,
}: {
  /** The list's name, or what was chosen from it, naming the detail. */
  title?: string;
  /** The detail, on the right. */
  secondary?: boolean;
  children: ReactNode;
}) {
  const { collapsed, detailShown, showList } = useSplitCollapse();
  if (hasPanelBar()) {
    // Only the detail's bar, and only while it is the one column on screen.
    const onBack = secondary && collapsed && detailShown ? showList : undefined;
    return (
      <PanelBar title={title ?? ''} onBack={onBack}>
        <AboveTabBar>
          {secondary ? <DetailWidth>{children}</DetailWidth> : children}
        </AboveTabBar>
      </PanelBar>
    );
  }
  if (!secondary) {
    return <View className="bg-background flex-1">{children}</View>;
  }
  return (
    <DetailWidth>
      {title ? (
        <View style={styles.title}>
          <Heading className="text-foreground">{title}</Heading>
        </View>
      ) : null}
      {children}
    </DetailWidth>
  );
}

/**
 * The detail's content, no wider than `DETAIL_MAX_WIDTH` and centred past it
 * — the web's master/detail layout, which caps the detail the same way, so
 * that a line of it never runs the width of a desktop window.
 */
function DetailWidth({ children }: { children: ReactNode }) {
  return (
    <View testID="split-detail" className="bg-background flex-1 items-center">
      <View
        testID="split-detail-content"
        className="w-full flex-1"
        style={styles.detail}
      >
        {children}
      </View>
    </View>
  );
}

export type SplitMenuEntry = {
  id: string;
  label: string;
  /** A heading, not a choice: it names the entries under it. */
  heading?: boolean;
};

/** The primary panel's list, with the chosen entry marked as it is there. */
export function SplitMenuList({
  label,
  entries,
  selected,
  onSelect,
}: {
  /** What the list is a list of, for a screen reader. */
  label: string;
  entries: readonly SplitMenuEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const edges = useSafeEdges();
  const ink = useNotationInk();
  const { showDetail } = useSplitCollapse();
  return (
    <FlatList
      className="bg-background flex-1"
      accessibilityLabel={label}
      contentContainerStyle={{ paddingLeft: edges.left ? insets.left : 0 }}
      data={entries}
      // Every entry, from the first frame: the list is a menu of a couple of
      // dozen rows at most, and one drawn a screenful at a time has rows a
      // screen reader cannot reach until somebody scrolls to them.
      initialNumToRender={entries.length}
      keyExtractor={(entry: SplitMenuEntry) => entry.id}
      renderItem={({ item }: { item: SplitMenuEntry }) => {
        if (item.heading) {
          return (
            <Text className="text-muted-foreground px-4 pt-4 pb-1 text-sm font-semibold uppercase">
              {item.label}
            </Text>
          );
        }
        const isSelected = item.id === selected;
        const choose = () => {
          onSelect(item.id);
          // In a collapsed split view, choosing a row drills into the detail;
          // where both panels show it is inert.
          showDetail();
        };
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isSelected }}
            onPress={choose}
            // macOS has no synthesized-touch fallback for an assistive press,
            // so a VoiceOver activation reaches a Pressable only through
            // `onAccessibilityTap` — `onPress` is a touch/mouse responder.
            onAccessibilityTap={choose}
            className={
              isSelected
                ? 'border-border border-l-primary bg-primary/10 flex-row items-center justify-between px-4'
                : 'border-border flex-row items-center justify-between border-l-transparent px-4'
            }
            style={styles.entry}
          >
            <Text className="text-foreground flex-1 text-base">
              {item.label}
            </Text>
            <ChevronRightIcon size={16} color={ink.muted} />
          </Pressable>
        );
      }}
    />
  );
}

/** The secondary panel with nothing chosen. */
export function EmptySecondaryPanel({ message }: { message: string }) {
  return (
    <View className="bg-background flex-1 items-center justify-center p-8">
      <Text className="text-muted-foreground text-center text-base">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { width: StyleSheet.hairlineWidth },
  detail: { maxWidth: DETAIL_MAX_WIDTH },
  // The collapsed detail's back control, sized to the leading inset a bar's
  // title would have.
  back: { paddingHorizontal: 16, justifyContent: 'center' },
  /*
    The web's `px-6 pt-6`, over `mb-4`. What follows brings the detail's own
    inset above it, which is 24 where the web leaves 16 under its title, so
    the difference is taken back here.
  */
  title: {
    paddingHorizontal: DETAIL_PADDING,
    paddingTop: DETAIL_PADDING,
    marginBottom: 16 - DETAIL_PADDING,
  },
  // The selection's bar on the left, present and clear when not selected so
  // that choosing an entry does not move its words.
  entry: {
    minHeight: MIN_TOUCH_TARGET,
    borderLeftWidth: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
