const { createTailwindPreset } = require('@sudobility/design');
const { swissTheme } = require('@sudobility/design/themes');

// The design preset maps rounded-md/sm to `calc(var(--radius) - Npx)`, which
// NativeWind cannot evaluate on native (corners render square). Compute concrete
// px values from the active theme's radius — same result the web gets from calc.
const radiusPx = parseFloat(swissTheme.light.radius) * 16; // "0.5rem" -> 8

/**
 * Semantic colors map to CSS variables (hsl(var(--primary)), ...). The variable
 * values come from global.css (scripts/generate-theme-css.js, light :root) and
 * are applied/flipped at runtime by ThemeVarsProvider via vars(). Semantic
 * classes (bg-primary, text-foreground, border-border, ...) therefore reflect
 * the active @sudobility/design theme AND light/dark — matching the web.
 *
 * The theme must be consistent across THREE files (see generate-theme-css.js):
 * this preset, global.css, and src/config/designTheme.ts.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // dark: variants follow NativeWind colorScheme (set by AppNavigator)
  // The design system + components-rn emit their variant classes as literal
  // strings; scan them so NativeWind generates the utilities. The app reads
  // components-rn from src, so its src/ glob covers what's actually bundled.
  content: [
    './index.js',
    './src/**/*.{js,jsx,ts,tsx}',
    './node_modules/@sudobility/components-rn/{src,dist}/**/*.{js,jsx,ts,tsx}',
    './node_modules/@sudobility/music_ui_rn/{src,dist}/**/*.{js,jsx,ts,tsx}',
    './node_modules/@sudobility/design/dist/**/*.{js,jsx}',
  ],
  presets: [require('nativewind/preset'), createTailwindPreset()],
  theme: {
    extend: {
      borderRadius: {
        sm: `${Math.max(radiusPx - 4, 0)}px`,
        md: `${Math.max(radiusPx - 2, 0)}px`,
        lg: `${radiusPx}px`,
        xl: `${radiusPx + 4}px`,
      },
    },
  },
  plugins: [],
};
