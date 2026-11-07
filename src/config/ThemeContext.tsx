/**
 * Which colour scheme is in force, and how to change it.
 *
 * Split from `ThemeVarsProvider` because they answer different questions: this
 * one resolves the *preference* and that one applies whatever is decided.
 * Keeping them apart is what lets a settings screen change the theme without
 * knowing anything about design tokens.
 *
 * The preference itself is a device pref (`useDevicePrefs`), loaded and saved
 * with the others by music_lib's `bindDevicePrefs`. It used to be read and
 * written here under a key of its own, a second persistence path for one of
 * six settings that all have to survive a relaunch the same way.
 *
 * `system` resolves through React Native's `useColorScheme`, which reports OS
 * changes as they happen — so a device that goes dark at sunset takes the app
 * with it, without a relaunch.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { devicePrefs, useDevicePrefs } from './useDevicePrefs';
import { resolveThemeMode } from '@sudobility/music_lib';
import type { ThemeMode } from '@sudobility/music_types';
import { ThemeModeProvider } from '@sudobility/music_ui_rn';

export type ThemeState = {
  /** What the reader asked for, which may be "follow the OS". */
  mode: ThemeMode;
  /** What that resolves to right now. */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const mode = useDevicePrefs(s => s.themeMode);

  const setMode = useCallback((next: ThemeMode) => {
    // Applied straight away; the binding writes it in the background, since
    // waiting on a disk write to repaint would make the toggle feel broken.
    devicePrefs.getState().setThemeMode(next);
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      // An unknown OS scheme (null before the OS has reported) reads as light:
      // guessing dark would flash the wrong theme on every cold start.
      resolved: resolveThemeMode(mode, system === 'dark'),
      setMode,
    }),
    [mode, system, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/*
        Bridge the resolved mode into music_ui_rn's own theme-mode context, so
        the library's functional UI (useNotationInk, ThemeVarsProvider) can
        resolve design tokens to literal colours without importing this app
        context. This app still owns *how* the mode is decided.
      */}
      <ThemeModeProvider resolved={value.resolved}>
        {children}
      </ThemeModeProvider>
    </ThemeContext.Provider>
  );
}

/**
 * The theme, tolerantly.
 *
 * Answers "light, following the system, and changing it does nothing" with no
 * provider, so a component that only wants to know the scheme needs no theme
 * wiring in its tests.
 */
export function useTheme(): ThemeState {
  return (
    useContext(ThemeContext) ?? {
      mode: 'system',
      resolved: 'light',
      setMode: () => {},
    }
  );
}
