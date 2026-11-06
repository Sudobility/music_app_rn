/**
 * App-side helpers around the family's split view.
 *
 * The split view itself — `SplitViewContainer`, `SplitMenuList`,
 * `EmptySecondaryPanel`, and the `MasterDetailLayout` beneath them — now lives
 * in the shared library (`@sudobility/components-rn`), and every screen that
 * draws one imports it from there (Projects, Docs, Settings). What stays here
 * is the glue that cannot move into the library because it depends on this
 * app's own navigation and layout rules:
 *
 * - `usePrimaryPanelWidth` — the list's width, decided by device rather than by
 *   the window (this app must never size from `useWindowDimensions()`; on macOS
 *   it reports the display), narrower on a phone than on a tablet or desktop.
 * - `TitledScreen` — a screen that is not a split view but wears the same titled
 *   navigation bar a split view's panels do (Community, Resources), so every
 *   screen under the tab bar is headed the same way.
 */
import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFormFactor } from '@sudobility/components-rn';
import { hasTopTabBar } from '@/app/tab-bar';
import { useNavigationTheme } from '@/app/useNavigationTheme';

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
 * Whether a screen draws a navigation bar of its own: where the system's tab
 * bar is along the bottom. Where it is along the top it would be a second row
 * on top of the tabs' own bar — but that never happens here (`hasTopTabBar` is
 * always false; the iPad tab bar is pinned to the bottom). A desktop draws
 * none.
 */
function hasPanelBar(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') && !hasTopTabBar()
  );
}

type PanelParamList = { Panel: undefined };
/*
  The platform's own navigation stack, so the bar is the system's — its height,
  the status-bar space above it and the centred title are the OS's, not computed
  here. One screen that never pushes; the bar is drawn for its title alone.
*/
const PanelStack = createNativeStackNavigator<PanelParamList>();

/**
 * A bar with `title` in it, over `children`: the platform's own header, on a
 * one-screen navigator of its own.
 */
function PanelBar({ title, children }: { title: string; children: ReactNode }) {
  const theme = useNavigationTheme();
  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={theme}>
        <PanelStack.Navigator
          screenOptions={{
            headerShown: true,
            // The platform's own bar: its height and the status-bar space above
            // it are the system's, and the title sits centred as iOS's own
            // navigation bar has it.
            headerTitleAlign: 'center',
          }}
        >
          <PanelStack.Screen name="Panel" options={{ title }}>
            {() => children}
          </PanelStack.Screen>
        </PanelStack.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

/**
 * A screen that is not a split view, under a bar that names it: Community,
 * Resources. The same bar a split view's panels have, so every screen under
 * the tab bar is titled the same way. A desktop draws no bars, and the screen
 * is what it holds.
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
    // The bar's own red behind it, full-bleed: the native bar reserves the
    // status-bar space itself, and the strip it leaves above its opaque
    // background shows this red rather than the app background as a band. So
    // nothing clears the top here — the platform does.
    <View className="bg-primary flex-1">
      <PanelBar title={title}>{children}</PanelBar>
    </View>
  );
}
