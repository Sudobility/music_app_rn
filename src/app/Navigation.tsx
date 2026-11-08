/**
 * The app's screens, mirroring the web app's routes.
 *
 * The web is a router over `/:lang/...`; this is a navigator over the same
 * destinations — projects, editor, community, published, docs, resources,
 * settings, credits and sign-in. Matching the set is what makes the two the
 * same product; matching the *mechanism* would not, since a URL is not a thing
 * a phone has.
 *
 * **One arrangement, on every platform.** The five destinations that are
 * not a document are tabs (`MainTabs`), the app opens on them, and
 * everything else — the editor first among them — is pushed above the tab
 * bar, which is how an open project comes to have the whole screen. A
 * desktop window is arranged as a tablet is: one window, the tabs across
 * its top, a split view beneath. The arrangement without a tab bar is kept
 * for a platform that has none (`hasTabBar()`), which today is no platform
 * the app is built for.
 *
 * Native stack on iOS and Android, plain JS on macOS and Windows — see
 * `createAppStackNavigator` for why the split exists.
 *
 * **There is no auth gate.** The web app puts one above everything except
 * community and published pages; here the editor works on a local document with
 * no account at all, so the gate would refuse what the app is for. Screens that
 * genuinely need a server say so themselves.
 */
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createAppStackNavigator } from './createAppStackNavigator';
import { MainTabs } from './MainTabs';
import { linking } from './linking';
import { hasTabBar } from './tab-bar';
import { NavigatorProvider, makeMusicNavigator } from './navigator';
import type { PaneKey } from './projects-window/paneKey';
import type { SettingsSection } from '@/screens/SettingsScreen';
import { useNavigationTheme } from './useNavigationTheme';
import { useTranslation } from 'react-i18next';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { DocsScreen } from '@/screens/DocsScreen';
import { CommunityScreen } from '@/screens/CommunityScreen';
import { PublishedScreen } from '@/screens/PublishedScreen';
import { CreditsScreen } from '@/screens/CreditsScreen';
import { ResourcesScreen } from '@/screens/ResourcesScreen';

/**
 * The five destinations that are not a document: tabs under a tab bar, stack
 * screens without one.
 *
 * `at` beside a requested pane or section tells one request from the next —
 * asking for the same one twice is two requests.
 */
export type MainTabParamList = {
  Dashboard: { pane?: PaneKey; at?: number } | undefined;
  Community: undefined;
  Docs: { topicId?: string } | undefined;
  Resources: undefined;
  Settings: { section?: SettingsSection; at?: number } | undefined;
};

export type RootStackParamList = MainTabParamList & {
  /** The tab navigator. Registered only where there is a tab bar. */
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Editor: { projectId?: string } | undefined;
  Published: { publicId: string };
  Credits: undefined;
};

const Stack = createAppStackNavigator<RootStackParamList>();

/**
 * For what sits above the navigator and still has to open a screen: the macOS
 * File menu's New Project makes a server project when a model writes it, and
 * opens it in the editor from outside any screen.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * The shared `Navigator` (over react-navigation) that lets UI navigate by route
 * name — the mirror of the web app's. Built once over the container ref and
 * provided below so `useNavigator()` works anywhere in the tree.
 */
const musicNavigator = makeMusicNavigator(navigationRef);

/**
 * Brings the editor forward, for what opens a document from outside any
 * screen — a menu command, a file opened from Finder. Under a tab bar the
 * document is open behind the tabs until the editor is pushed over them.
 * Asking twice is asking once: the editor already in front stays where it is.
 */
export function showEditor(): void {
  if (hasTabBar() && navigationRef.isReady()) navigationRef.navigate('Editor');
}

export function Navigation() {
  const { t } = useTranslation();
  const theme = useNavigationTheme();

  return (
    <NavigationContainer ref={navigationRef} theme={theme} linking={linking}>
      <NavigatorProvider value={musicNavigator}>
      {hasTabBar() ? (
        <Stack.Navigator
          initialRouteName="Main"
          screenOptions={{ headerShown: true }}
        >
          <Stack.Screen
            name="Main"
            component={MainTabs}
            // Each tab draws its own header. The title is what the editor's
            // back control reads.
            options={{ headerShown: false, title: t('nav.projects') }}
          />
          {/*
            Above the tabs, not among them: a pushed screen covers the tab
            bar, so an open project has the whole screen. The header is
            always there because it is the way back; `useEditorHeader` fills
            it in while a document is showing.
          */}
          <Stack.Screen
            name="Editor"
            component={EditorScreen}
            options={{ title: '' }}
          />
          <Stack.Screen
            name="Published"
            component={PublishedScreen}
            options={{ title: t('nav.published') }}
          />
          <Stack.Screen
            name="Credits"
            component={CreditsScreen}
            options={{ title: t('nav.credits') }}
          />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator
          initialRouteName="Editor"
          screenOptions={{ headerShown: false }}
        >
          {/*
            The editor first, not the dashboard. The web opens on a project
            list because a project lives on a server; here a document lives
            on the device, and opening into an empty editor is the shorter
            path to writing something.
          */}
          <Stack.Screen name="Editor" component={EditorScreen} />
          {/*
            Unreached on a desktop build, not removed: File ▸ Projects opens
            a separate native window (`ProjectsWindow.tsx`) — see
            `MenuFileCommands.tsx`'s `nav.projects` handling.
          */}
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ headerShown: true, title: t('nav.projects') }}
          />
          <Stack.Screen
            name="Community"
            component={CommunityScreen}
            options={{ headerShown: true, title: t('nav.community') }}
          />
          <Stack.Screen
            name="Published"
            component={PublishedScreen}
            options={{ headerShown: true, title: t('nav.published') }}
          />
          <Stack.Screen
            name="Docs"
            component={DocsScreen}
            options={{ headerShown: true, title: t('docs.title') }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: true, title: t('nav.settings') }}
          />
          <Stack.Screen
            name="Credits"
            component={CreditsScreen}
            options={{ headerShown: true, title: t('nav.credits') }}
          />
          {/*
            Where to find music to open. More useful on a phone than on the
            web, not less: a new install has no folder of scores already on
            the device.
          */}
          <Stack.Screen
            name="Resources"
            component={ResourcesScreen}
            options={{ headerShown: true, title: t('nav.resources') }}
          />
        </Stack.Navigator>
      )}
      </NavigatorProvider>
    </NavigationContainer>
  );
}
