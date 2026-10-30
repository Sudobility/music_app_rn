/**
 * The navigator's own chrome — the headers it draws and the tab bar — in the
 * app's colours and the scheme in force.
 *
 * It was left on React Navigation's defaults, which are light whatever the
 * theme says. Built from the app's theme rather than read back from a
 * `NavigationContainer`, so that a navigation tree with no container above
 * it — each panel of a split view is one — arrives at the same answer.
 *
 * **Every navigation bar is the design theme's red (`primary`), under
 * inverse ink.** The editor's header already is; this makes the rest match,
 * so every screen has the one red nav bar rather than a grey one with the
 * red app root (`App.tsx`'s `bg-primary`) showing as a thin strip above it in
 * landscape. `card` is what React Navigation paints its headers (and the
 * iPad's floating tab bar's row) with, so it is the red; `text` is the white
 * that reads on it; `background` stays the screen's own, since it is the
 * content area below the bar, not the bar.
 */
import { useMemo } from 'react';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import type { Theme } from '@react-navigation/native';
import { swissTheme } from '@sudobility/design/themes';
import {
  hslTripleToHex,
  useNotationInk,
} from '@/components/icons/notation-ink';
import { useTheme } from '@/config/ThemeContext';

export function useNavigationTheme(): Theme {
  const { resolved } = useTheme();
  const ink = useNotationInk();
  return useMemo(() => {
    const base = resolved === 'dark' ? DarkTheme : DefaultTheme;
    const tokens = resolved === 'dark' ? swissTheme.dark : swissTheme.light;
    const background = hslTripleToHex(tokens.background);
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: ink.primary,
        background,
        // The bars are red; the content below them keeps `background`.
        card: ink.primary,
        text: ink.onPrimary,
        border: ink.primary,
      },
    };
  }, [resolved, ink]);
}
