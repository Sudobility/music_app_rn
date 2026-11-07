/**
 * The interface is drawn from the design system, and says so in the source.
 *
 * `@sudobility/components-rn` on the Swiss theme is what makes this app and
 * the web app one product: a colour written as a literal does not follow
 * light and dark, and a control built from a bare `Pressable` inherits none
 * of what the library's carry — the tokens, the touch target, the pressed
 * answer, the assistive press a Mac reaches a control by. Both were found by
 * eye, after they shipped: a tab strip that stayed a light band across a dark
 * editor, title-bar glyphs in white beside a title in the theme's ink.
 *
 * Neither types nor a render test sees any of it, so the source is scanned —
 * the way `legibility.test.ts` scans for small text. Every exemption below is
 * a decision with its reason beside it; add to a list only with one.
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';

const sources = globSync('src/**/*.tsx')
  .map(f => f.replaceAll('\\', '/'))
  .filter(f => !f.includes('.test.'));

function offenders(
  pattern: RegExp,
  allowed: ReadonlyMap<string, string>,
): string[] {
  return sources
    .filter(file => !allowed.has(file))
    .flatMap(file =>
      [...readFileSync(file, 'utf8').matchAll(pattern)].map(
        match => `${file}: ${match[0]}`,
      ),
    );
}

/** An allow list naming a file that no longer needs it is a stale decision. */
function unused(pattern: RegExp, allowed: ReadonlyMap<string, string>) {
  return [...allowed.keys()].filter(file => {
    try {
      return !new RegExp(pattern.source).test(readFileSync(file, 'utf8'));
    } catch {
      return true;
    }
  });
}

describe('colours come from the theme', () => {
  const HEX = /['"]#[0-9a-fA-F]{3,8}['"]/g;
  const HEX_ALLOWED = new Map([
    [
      'src/features/editor/ProjectsPopup.tsx',
      'A shadow colour. A shadow is black in both themes and the theme has no token for one.',
    ],
  ]);

  it('no hex literal outside the listed drawings', () => {
    expect(offenders(HEX, HEX_ALLOWED)).toEqual([]);
  });

  it('every listed exemption is still needed', () => {
    expect(unused(HEX, HEX_ALLOWED)).toEqual([]);
  });

  /*
    Tailwind's palette (`text-amber-700`, `bg-zinc-100`) and its two absolutes
    are literals with a class for a name: they resolve to one colour in both
    themes. The semantic classes (`text-warning`, `bg-card`) are the theme's.
  */
  const PALETTE =
    /\b(?:text|bg|border|fill|stroke)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black|white)(?:\/\d+)?\b/g;
  const PALETTE_ALLOWED = new Map([
    [
      'src/features/editor/ProjectsPopup.tsx',
      "The scrim over the editor. The theme has no scrim token, and the library's own `Backdrop` is `bg-black` at an opacity for the same reason.",
    ],
    [
      'src/screens/ResourcesScreen.tsx',
      "The chip a site's mark sits in, white in both themes as on the web page. A mark is drawn for a white page, and a dark chip swallows the dark ones.",
    ],
  ]);

  it('no palette class outside the listed ones', () => {
    expect(offenders(PALETTE, PALETTE_ALLOWED)).toEqual([]);
  });

  it('every listed palette exemption is still needed', () => {
    expect(unused(PALETTE, PALETTE_ALLOWED)).toEqual([]);
  });

  /*
    `color="white"` on an icon is the same literal without the hash. The
    title bar's glyphs were drawn that way beside a title in
    `text-primary-foreground`, which in dark mode is black.
  */
  it('no CSS colour name handed to a colour prop', () => {
    const NAMED =
      /\b(?:color|backgroundColor|borderColor|tintColor|fill|stroke)\s*[=:]\s*\{?\s*['"](?:white|black|red|gray|grey|blue|green)['"]/g;
    expect(offenders(NAMED, new Map())).toEqual([]);
  });

  /*
    An icon is an SVG, and an SVG takes its ink as a `color` prop. A colour
    class on one is dropped without a word: NativeWind turns `className` into
    style only for elements created through its JSX runtime or a
    `createElement` it can see is React's, and `react-native-heroicons` calls
    `createElement` through a bundler alias it does not recognise — so the
    `cssInterop(Svg, …)` in `designTheme.ts` never runs for a heroicon, and
    `fill="currentColor"` resolves to black. In dark mode that is a glyph
    drawn black on a black bar: Play and Stop on the playback bar, every
    toolbar glyph beside the drawn ones that took `useNotationInk()`. The
    colour comes from `useNotationInk()`, the theme's tokens resolved.
  */
  /*
    The library's `Spinner` is a fixed blue in both themes, off the Swiss
    palette; `components/controls/Spinner` is the same control in the
    theme's accent.
  */
  it("no spinner from the library's fixed palette", () => {
    const LIBRARY_SPINNER =
      /import\s*\{[^}]*\bSpinner\b[^}]*\}\s*from\s*'@sudobility\/components-rn'/g;
    expect(offenders(LIBRARY_SPINNER, new Map())).toEqual([]);
  });

  it('no icon tinted through a class', () => {
    const CLASSED_ICON =
      /<(?:[A-Z]\w*)?Icon\b(?:(?!\/?>)[\s\S])*?\bclassName=/g;
    expect(offenders(CLASSED_ICON, new Map())).toEqual([]);
  });
});

describe('controls come from the library', () => {
  /*
    React Native's own `Text`, `TextInput`, `Switch`, `Button` and
    `TouchableOpacity` are unstyled: each use restates the theme by hand or
    goes without it. The library's carry it.
  */
  const RAW =
    /import\s*\{[^}]*\b(?<![\w$]type\s)(?:Text|TextInput|Switch|Button|TouchableOpacity|TouchableHighlight)\b[^}]*\}\s*from\s*'react-native'/g;
  const RAW_ALLOWED = new Map([
  ]);

  it('no unstyled React Native control outside the listed wrappers', () => {
    const found = sources
      .filter(file => !RAW_ALLOWED.has(file))
      .filter(file =>
        [...readFileSync(file, 'utf8').matchAll(RAW)].some(
          match => !/^import\s+type\b/.test(match[0]),
        ),
      );
    expect(found).toEqual([]);
  });

  /*
    A `Pressable` is what a control is built *from*. The files below are the
    app's own wrappers, which exist so nothing else has to build one, and the
    surfaces no library button can express. Anything else uses `Button`,
    `IconButton`, `PressableCard`, `FieldRow` or `ToolbarSelect`.
  */
  const PRESSABLE = /<Pressable\b/g;
  const PRESSABLE_ALLOWED = new Map([
    // The wrappers that live in the app (the UI-library wrappers — IconButton,
    // PressableCard, ToolbarSelect, SegmentedTabs — now live in music_ui_rn and
    // are guarded there).
    [
      'src/components/layout/ScreenBackBar.macos.tsx',
      'The back control the macOS navigator does not draw.',
    ],
    // Surfaces that are not buttons.
    [
      'src/features/documents/DocumentTabs.tsx',
      'A document tab: role `tab`, with a close button inside it.',
    ],
    [
      'src/features/editor/ProjectsPopup.tsx',
      'The scrim: everything the panel does not cover, pressed to dismiss.',
    ],
    [
      'src/screens/ResourcesScreen.tsx',
      'A link out of the app: role `link` with a hint, which `PressableCard` (role `button`) would misreport.',
    ],
    [
      'src/features/snapshots/SnapshotSheets.tsx',
      'Rows of the snapshot tree: selectable, indented by depth, which no library list row expresses.',
    ],
    [
      'src/features/toasts/Toasts.tsx',
      "The action and dismiss of a toast, in the ink of the toast's own surface; every `Button` variant brings a surface and ink of its own.",
    ],
  ]);

  it('no hand-built button outside the listed wrappers and surfaces', () => {
    expect(
      sources.filter(
        file =>
          !PRESSABLE_ALLOWED.has(file) &&
          /<(?:Pressable|TouchableOpacity|TouchableHighlight)\b/.test(
            readFileSync(file, 'utf8'),
          ),
      ),
    ).toEqual([]);
  });

  it('every listed surface still draws a Pressable', () => {
    expect(unused(PRESSABLE, PRESSABLE_ALLOWED)).toEqual([]);
  });
});
