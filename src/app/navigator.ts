/**
 * The native app's navigation layer, built on the shared `@sudobility/routing`
 * kit — the mirror of the web app's `app/navigation.tsx`.
 *
 * music_lib owns the registry of routes both apps share (`musicRoutes`). Here
 * we implement the `Navigator` contract over react-navigation so shared UI can
 * navigate by route name (`useNavigator().go('projects')`) identically to the
 * web, without knowing the stack/tab structure: tab routes go through
 * `goToTab`, pushed screens through `navigate`. The registry keeps the route
 * names, paths and params from drifting between the two apps.
 *
 * (Named `navigator`, not `navigation`, because `Navigation.tsx` already exists
 * and the filesystem is case-insensitive.)
 */
import {
  StackActions,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNavigatorContext } from '@sudobility/routing/react';
import type { MusicNavigator, MusicRoutes } from '@sudobility/music_lib';
import type { RootStackParamList } from './Navigation';
import { goToTab } from './tab-bar';

const ctx = createNavigatorContext<MusicRoutes>();

/** Navigate by route name. Must be used under {@link NavigatorProvider}. */
export const { NavigatorProvider, useNavigator } = ctx;

type Ref = NavigationContainerRefWithCurrent<RootStackParamList>;

/** react-navigation screen name for each shared route. */
const SCREEN_FOR_ROUTE: Record<keyof MusicRoutes, string> = {
  projects: 'Dashboard',
  editor: 'Editor',
  published: 'Published',
  community: 'Community',
  docs: 'Docs',
  resources: 'Resources',
  settings: 'Settings',
  credits: 'Credits',
};
const ROUTE_FOR_SCREEN = Object.fromEntries(
  Object.entries(SCREEN_FOR_ROUTE).map(([route, screen]) => [screen, route]),
) as Record<string, keyof MusicRoutes>;

/** Which shared routes are tabs (reached via `goToTab`) rather than pushed screens. */
const TAB_ROUTES = new Set<keyof MusicRoutes>([
  'projects',
  'community',
  'docs',
  'resources',
  'settings',
]);

/**
 * Build the shared `Navigator` over a react-navigation container ref. Taken as
 * an argument (rather than imported) to avoid a cycle with `Navigation.tsx`,
 * which owns `navigationRef` and mounts {@link NavigatorProvider}.
 */
export function makeMusicNavigator(ref: Ref): MusicNavigator {
  const navigate = ref.navigate as (name: string, params?: unknown) => void;

  const toRoute = (
    name: keyof MusicRoutes,
    params?: Record<string, string | undefined>,
  ): void => {
    if (!ref.isReady()) return;
    if (TAB_ROUTES.has(name)) {
      goToTab(ref, SCREEN_FOR_ROUTE[name] as 'Dashboard', params as never);
      return;
    }
    navigate(SCREEN_FOR_ROUTE[name], params);
  };

  const nav = {
    go: (name: keyof MusicRoutes, params?: Record<string, string | undefined>) =>
      toRoute(name, params),
    replace: (name: keyof MusicRoutes, params?: Record<string, string | undefined>) => {
      // A pushed screen can be replaced in place; a tab is reached the same way
      // whether or not it is already there, so replace folds into go.
      if (ref.isReady() && !TAB_ROUTES.has(name)) {
        ref.dispatch(StackActions.replace(SCREEN_FOR_ROUTE[name], params));
        return;
      }
      toRoute(name, params);
    },
    back: () => {
      if (ref.isReady() && ref.canGoBack()) ref.goBack();
    },
    current: () => {
      const route = ref.isReady() ? ref.getCurrentRoute() : undefined;
      const name = route ? ROUTE_FOR_SCREEN[route.name] : undefined;
      if (!name) return null;
      return {
        name,
        params: (route?.params ?? {}) as Record<string, string | undefined>,
      };
    },
  };
  return nav as MusicNavigator;
}
