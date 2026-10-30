/**
 * The composition root's React half.
 *
 * Start-up order is the one thing here that matters: services first (the player
 * has to be registered before anything resolves it), then i18n, then the tree.
 * Both are idempotent, so a fast refresh does not rebuild the audio engine.
 *
 * There is no auth gate. A local document needs no server and no account — the
 * store is built without a `MusicClient` at all — so the app opens straight
 * into the editor. Signing in adds server projects later; it does not gate the
 * thing you already have on disk.
 */
import '../../global.css';
// Side-effect: activates the Swiss design theme before anything renders.
import '@/config/designTheme';

import { useEffect, useMemo } from 'react';
import { GestureRoot } from '@/platform/GestureRoot';
import { SafeAreaProvider } from '@/platform/SafeArea';
import { AppSafeEdges } from '@/platform/AppSafeEdges';
import { AppState, StatusBar, View } from 'react-native';
import { getSharedAppState, queryClient } from './appState';
import { DocumentsProvider } from '@/documents/DocumentsContext';
import { Toasts } from '@/features/toasts/Toasts';
import { MenuImportCommands } from '@/features/documents/MenuImportCommands';
import { MenuFileCommands } from '@/features/documents/MenuFileCommands';
import { ScreenshotLinks } from '@/features/screenshots/ScreenshotLinks';
import { DevAutoSignIn } from '@/auth/DevAutoSignIn';
import { WindowTitleSync } from '@/features/documents/WindowTitleSync';
import { QueryClientProvider } from '@tanstack/react-query';
import { PortalHost } from '@sudobility/components-rn';
import { ThemeVarsProvider } from '@/components/ThemeVarsProvider';
import { ThemeProvider } from '@/config/ThemeContext';
import { AuthProvider } from '@/auth/AuthContext';
import { EntityUserScope } from '@/features/account/EntityUserScope';
import { Navigation } from './Navigation';

/**
 * The clock and the battery, in ink that shows on the app's own background.
 *
 * Stated, because the default is the system's guess: Android drew them light
 * over this app's light background, where they could not be read. Inside
 * `ThemeProvider`, since which ink shows depends on the scheme the reader
 * chose, which is not always the device's.
 */
function ThemedStatusBar() {
  // Always light-content: every screen's top is now the design theme's red
  // (the nav bar, the status-bar clearance above it, and the app root behind
  // both), so white status text reads on it whatever the colour scheme. It
  // used to follow the scheme, which drew dark text over the red in light
  // mode. Shown on every device — the app is no longer landscape-only, and
  // hiding it on a phone left an empty band above the native header. Like
  // sudojo_app_rn, the status bar is app-based
  // (`UIViewControllerBasedStatusBarAppearance` is NO), so this JS component
  // drives it on iOS and Android alike.
  return <StatusBar barStyle="light-content" />;
}

export default function App() {
  // `getSharedAppState()` runs the real set-up exactly once, however many
  // windows call it — see `appState.ts`. This is the main window's own copy
  // of the `{ list, services }` it returns.
  const { list, services } = useMemo(() => getSharedAppState(), []);

  /*
    Flush on the way out of the foreground.

    A phone may kill a backgrounded app without another word, and the autosave
    debounce is exactly the window in which the last edit exists only in
    memory. `inactive` counts — on iOS that is the app switcher, which is where
    a swipe ends the process.
  */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void list.flushAll();
    });
    return () => subscription.remove();
  }, [list]);

  return (
    <GestureRoot>
      <SafeAreaProvider>
        <AppSafeEdges>
          {/*
          Outside the vars provider, because it decides what those vars are.
        */}
          <ThemeProvider>
            <ThemedStatusBar />
            <ThemeVarsProvider>
              {/*
                The app root is `bg-primary` (red, from the Swiss design theme).
                A pushed native-stack screen (the editor) is inset below the
                window's top safe area on some devices — the iPhone Duo's folded
                cover screen among them — and the strip above its bar shows this
                root. Painting it the primary red means the editor's red header
                reads to the top edge with no band. The design theme's colour,
                so it follows light/dark.
              */}
              <View className="bg-primary flex-1">
                <QueryClientProvider client={queryClient}>
                  {/*
                Auth wraps the navigator rather than gating it: the editor is
                usable signed out, and only the screens that read the server
                ask whether there is an account.
              */}
                  <AuthProvider>
                    {/*
                  Every entity_client query is cached under the signed-in
                  user, so one account's workspaces and keys never reach the
                  next. Above the portal host, so a sheet sees it too.
                */}
                    <EntityUserScope>
                      <DocumentsProvider list={list} services={services}>
                        {/*
                    Above everything that opens a picker: a portalled sheet
                    draws here, so it escapes the scrolling toolbar that would
                    otherwise clip it. Inside the data providers, not above
                    them: what is portalled is still part of the app, and a
                    dialog drawn here that reads the server — the presets in
                    New Project — failed with "No QueryClient set" when this
                    sat outside `QueryClientProvider`.
                  */}
                        <PortalHost>
                          {/*
                      A File-menu import makes a new document from whatever
                      screen is in front, so it can belong to none of them.
                    */}
                          <MenuImportCommands />
                          <MenuFileCommands />
                          {/*
                      Store-screenshot links, in a debug build only — the
                      build `app_store/scripts/capture.sh` installs.
                    */}
                          {__DEV__ ? <ScreenshotLinks /> : null}
                          {/*
                      The test account from `.env`, in a debug build only:
                      what lets the screenshot devices show what needs one.
                    */}
                          {__DEV__ ? <DevAutoSignIn /> : null}
                          <WindowTitleSync />
                          <Navigation />
                          <Toasts />
                        </PortalHost>
                      </DocumentsProvider>
                    </EntityUserScope>
                  </AuthProvider>
                </QueryClientProvider>
              </View>
            </ThemeVarsProvider>
          </ThemeProvider>
        </AppSafeEdges>
      </SafeAreaProvider>
    </GestureRoot>
  );
}
