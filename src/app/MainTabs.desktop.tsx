/**
 * The tab bar in a desktop window: Projects, Community, Docs, Resources and
 * Settings, across the top.
 *
 * macOS and Windows. The same five tabs, the same screens and the same route
 * names as `MainTabs.tsx`, so a desktop window is arranged as a tablet is —
 * one window, the tabs along its top, and under them each tab's own split
 * view. The editor is pushed above this navigator (`Navigation.tsx`), so an
 * open project covers the bar and has the whole window.
 *
 * **The bar is drawn here, where the tablet's is the system's.** The native
 * navigator hands its tabs to a `UITabBarController` or a Material bar;
 * `react-native-screens` has no macOS or Windows half to hand them to, which
 * is the reason the desktop stack is the JS one too
 * (`createAppStackNavigator`). So this is the JS tab navigator with a bar of
 * its own, along the top because that is where a window keeps its
 * navigation — and where an iPad has kept its tab bar since iPadOS 18.
 *
 * There is no Back guard here, as there is under the mobile tabs: nothing on
 * a desktop is a Back button that finishes the app.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { ProjectsScreen } from '@/screens/ProjectsScreen';
import { CommunityScreen } from '@/screens/CommunityScreen';
import { DocsScreen } from '@/screens/DocsScreen';
import { ResourcesScreen } from '@/screens/ResourcesScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { DesktopTabBar } from './DesktopTabBar';
import type { MainTabParamList } from './Navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

const renderTabBar = (props: BottomTabBarProps) => <DesktopTabBar {...props} />;

export function MainTabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      // A tab is a place, not a step: there is no order of tabs to go back
      // through.
      backBehavior="none"
      tabBar={renderTabBar}
      // The bar names the screen; a header over each tab would name it again.
      // A sidebar down the left, the desktop convention: the tabs beside the
      // content, not across the top of it.
      screenOptions={{ headerShown: false, tabBarPosition: 'left' }}
    >
      <Tab.Screen
        name="Dashboard"
        component={ProjectsScreen}
        options={{ title: t('nav.projects') }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{ title: t('nav.community') }}
      />
      <Tab.Screen
        name="Docs"
        component={DocsScreen}
        options={{ title: t('docs.title') }}
      />
      <Tab.Screen
        name="Resources"
        component={ResourcesScreen}
        options={{ title: t('nav.resources') }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('nav.settings') }}
      />
    </Tab.Navigator>
  );
}
