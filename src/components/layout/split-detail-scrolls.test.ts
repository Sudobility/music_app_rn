/**
 * Whatever a split view shows in its detail panel can be scrolled.
 *
 * The panel is as tall as the screen leaves it, and what it shows is as tall
 * as it is: a form, a list, a page of prose. `SplitPanel` cannot supply the
 * scrolling itself — half of what it holds are lists that virtualize, and a
 * list inside a scroll view measures nothing and draws nothing — so each pane
 * brings its own, and this is what notices when one does not.
 *
 * Source-scanned, like `screens-reachable`: a rendered test would prove one
 * pane scrolls, where this proves there is no pane that cannot. It reads each
 * split view for the components it puts in its detail panel, and each of
 * those for a scrolling container — its own, or `ScreenScaffold`'s.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Every screen that draws a `SplitViewContainer`. */
const SPLIT_VIEWS = [
  'src/app/projects-window/ProjectsSplitView.tsx',
  'src/screens/SettingsScreen.tsx',
  'src/screens/DocsScreen.tsx',
];

// `ProjectTiles` is a `FlatList` with a grid's columns, as `ScreenScaffold`
// is a `ScrollView` with a title, and building_blocks_rn's `LoginPage` a
// `ScrollView` with the sign-in form in it: a pane that draws one scrolls.
const SCROLLS =
  /<(ScrollView|FlatList|SectionList|ScreenScaffold|ProjectTiles|LoginPage)\b/;

/** What is drawn inside `<SplitPanel secondary …>`, as source. */
function detailOf(source: string): string {
  // However the formatter broke the tag across lines.
  const opening = /<SplitPanel\s+secondary\b/.exec(source);
  if (!opening) return '';
  const end = source.indexOf('</SplitPanel>', opening.index);
  return end === -1 ? '' : source.slice(opening.index, end);
}

/** The file a component named in `file` is imported from, if it is this app's. */
function sourceOf(
  file: string,
  source: string,
  component: string,
): string | null {
  const imported = new RegExp(
    `import\\s*\\{[^}]*\\b${component}\\b[^}]*\\}\\s*from\\s*'([^']+)'`,
  ).exec(source);
  if (!imported) return null;
  const from = imported[1]!;
  const base = from.startsWith('@/')
    ? join('src', from.slice(2))
    : from.startsWith('.')
      ? join(dirname(file), from)
      : null;
  if (!base) return null;
  return [`${base}.tsx`, `${base}.ts`].find(existsSync) ?? null;
}

describe('split view detail panels', () => {
  it.each(SPLIT_VIEWS)('%s shows only what can be scrolled', file => {
    const source = readFileSync(file, 'utf8');
    const detail = detailOf(source);
    expect(detail, 'no detail panel found').not.toBe('');

    // A scroller written straight into the panel covers everything in it.
    if (SCROLLS.test(detail)) return;

    const components = [
      ...new Set(
        [...detail.matchAll(/<([A-Z]\w+)\b/g)]
          .map(match => match[1]!)
          .filter(name => name !== 'SplitPanel' && name !== 'View'),
      ),
    ];
    expect(components.length).toBeGreaterThan(0);

    const cannotScroll = components.filter(component => {
      // Defined in the same file, or imported from one of this app's.
      const local = new RegExp(`function ${component}\\b`).test(source);
      const from = local ? file : sourceOf(file, source, component);
      if (!from) return true;
      return !SCROLLS.test(readFileSync(from, 'utf8'));
    });
    expect(cannotScroll).toEqual([]);
  });

  it('knows every split view there is', () => {
    // A new one has to be added above, or it is not checked at all.
    const drawn = [
      'src/app/projects-window/ProjectsSplitView.tsx',
      'src/screens/SettingsScreen.tsx',
      'src/screens/DocsScreen.tsx',
      'src/screens/DashboardScreen.tsx',
      'src/screens/CommunityScreen.tsx',
      'src/screens/ResourcesScreen.tsx',
      'src/screens/ProjectsScreen.tsx',
    ].filter(
      file =>
        existsSync(file) &&
        /<SplitViewContainer\b/.test(readFileSync(file, 'utf8')),
    );
    expect(drawn.sort()).toEqual([...SPLIT_VIEWS].sort());
  });
});
