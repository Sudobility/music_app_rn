/**
 * This repo holds UI and arrangement, and nothing else.
 *
 * `music_app` has the same guard, for the reason it exists there: the rule is
 * remembered right up until somebody writes score maths in a component because
 * it was quicker than opening another repo. A guard turns that into a failing
 * test rather than a slow drift, and the `ALLOWED_NON_UI` list makes every
 * exemption a decision somebody wrote down.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(SRC).map(f =>
  relative(join(SRC, '..'), f).replaceAll('\\', '/'),
);
const sources = files.filter(
  f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
);

/**
 * Plain `.ts` modules that are legitimately not components.
 *
 * Each is here because it is *arrangement* — wiring, platform glue or the
 * app's own document, none of which is a rule about music.
 */
const ALLOWED_NON_UI = new Set([
  // Microphone capture is a platform bridge; the transcription helper wires
  // the authenticated client to the existing asynchronous project workflow.
  'src/features/score-editor/voice-recorder.ts',
  'src/features/score-editor/transcribe-recording.ts',
  // WAV-to-MP3 conversion and temporary file handling at the native boundary.
  'src/features/score-editor/voice-mp3.ts',
  // The Resources screen's icons: a table of `require`s, which is how Metro
  // is told an asset exists. Files on disk are the one part of that page a
  // library cannot hold — the web app keeps its own table for the same reason.
  'src/screens/resource-icons.ts',
  // The composition root: it constructs platform services rather than
  // implementing them, which is exactly this repo's job.
  'src/config/initialize.ts',
  // Reading the bundled instrument packs off disk. Platform glue, and
  // deliberately not the player's business: `music_player` exposes a
  // `fetchPack` seam exactly so it never has to know where an app keeps its
  // bundle, which differs per platform (APK assets on Android, the bundle
  // directory on iOS and macOS) and per app. It holds no rule about music —
  // only a file name and two ways to read it.
  'src/config/soundfont-packs.ts',
  'src/config/soundfont-packs.windows.ts',
  // The macOS menu bar, as events. Platform glue in the same sense as the
  // line above: it holds no rule about music, only a subscription to a
  // native module. It cannot move to a library either — the module it
  // listens to is declared in this app's own `AppDelegate.mm`, so there is
  // no other package that could own it.
  'src/app/menu-commands.ts',
  // Whether the navigator draws a native header here — a fact about the
  // platform, asked by the layout and by the editor's header alike. Platform
  // glue like the menu bar above, and the same question from the other side:
  // one says a menu bar carries the title bar's buttons, this says the
  // navigation bar does.
  'src/app/native-header.ts',
  // Whether the app sits under a tab bar here, and how to reach a tab from
  // beside the tabs. The same kind of fact as the two above — iOS and
  // Android have a tab bar where macOS and Windows have a menu bar and a
  // Projects window — and `goToTab` is arrangement over the navigator: it
  // names a route, and holds no rule about anything.
  'src/app/tab-bar.ts',
  // Which documentation topics have a figure, and the files themselves. This
  // app's own pictures of this app's own screens: the web's docs show the
  // web's, so there is nothing here for a library to hold.
  'src/features/docs/figures.ts',
  'src/features/docs/figure-assets.ts',
  // What a `moosiac://open` link or a Finder open asks for: a path, checked
  // against the extensions the app reads. Arrangement over the document and
  // import tables, and the same kind of platform glue as the menu bar.
  'src/app/open-links.ts',
  // The store-screenshot links `app_store/scripts/capture.sh` sends, the
  // scene they hand to the screens, and the score they open. Arrangement of
  // this app's own screens for this app's own store listing: which sheet is
  // open and which track is selected, never a rule about music. The demo
  // score is data — notes typed in a compact form and written out as
  // MusicXML for the importer, which is what turns notes into a `Score`.
  'src/features/screenshots/screenshot-links.ts',
  'src/features/screenshots/screenshot-scene.ts',
  'src/features/screenshots/demo-score.ts',
  // Whether the inspector column starts open. **App layout geometry**, which
  // is the line music_drawing draws at the canvas edge: anything about the
  // *drawn score* is the library's, anything about the app around it stays
  // here. This is a fact about this app's own chrome — its column width and
  // its safe-area insets — and says nothing about music, the same way
  // `autoscroll` is a fact about a scroll box. A plain module rather than part
  // of `AppLayout.tsx` on purpose: importing that file pulls React Native in
  // and vitest cannot parse it, so the arithmetic would be untestable exactly
  // where it shipped wrong.
  'src/features/layout/inspector-default.ts',
  // Whether the editing and playback bars collapse to their compact arrangement
  // — a size-class rule over the bar's own measured width. A plain module, not
  // part of `EditorToolbar.tsx`, so vitest can pin the three cases (phone, wide
  // window, narrow window) that a single width cannot separate.
  'src/features/layout/compact-bars.ts',
  // Printing. `print-pages.ts` draws music_drawing's `printPlan` with Skia;
  // `print-service.ts` hands the images to the platform. Both are arrangement
  // over `music_drawing`, which owns every rule about what a printed page is —
  // the pagination included, which this app used to hold in `print-plan.ts`.
  'src/features/print/print-pages.ts',
  'src/features/print/print-service.ts',
  // The file panels. A picker is a platform control, and which one exists is
  // a property of the OS rather than of the music — so this is exactly the
  // kind of thing a library must not contain, and the `.macos` variant beside
  // it is why it cannot be one function.
  'src/documents/file-picker.ts',
  'src/documents/file-picker.macos.ts',
  // The Windows picker boundary. It is an app-owned Win32 bridge rather than
  // an import of a mobile-only picker package.
  'src/documents/file-picker.windows.ts',
  // The Windows print boundary. Rendering and the WebView2 PDF bridge are
  // separate platform capabilities, so this stays platform-specific.
  'src/features/print/print-service.windows.ts',
  'src/features/print/print-pages.windows.ts',
  // The Windows score adapter records the shared renderer into
  // windows_canvas_rn pictures (and, for printing, into SVG for WebView2) and
  // keeps its signal/scheduling glue outside the UI component.
  'src/features/score/svg-context.ts',
  'src/features/score/picture-layered-paint.ts',
  'src/features/score/useScoreCanvas.windows.ts',
  // Frame scheduling is UI glue for Windows.
  'src/platform/windows-animation-frames.ts',
  // Build-time configuration and the server gateway: what this build points
  // at, constructed rather than implemented.
  'src/config/constants.ts',
  'src/config/server.ts',
  // Firebase, in the shape every RN app in the family has it: the env module,
  // service start-up (a call into di_rn per mobile platform; on the desktops,
  // di's Measurement Protocol analytics, built in `desktopAnalytics`), the
  // analytics wrapper, and the site-admin hook beside the shared auth context.
  // Wiring, not logic; the services are libraries'.
  'src/config/env.ts',
  'src/di/initializeServices.ts',
  'src/di/desktopAnalytics.ts',
  'src/di/initializeServices.ios.ts',
  'src/di/initializeServices.android.ts',
  'src/analytics.ts',
  'src/auth/useSiteAdmin.ts',
  // Where the Sign in with Apple module comes from, per platform: a lazy
  // `require` everywhere but Windows, which has no build of it and whose
  // bundle cannot even resolve its files.
  'src/auth/apple-auth-module.ts',
  'src/auth/apple-auth-module.windows.ts',
  // The design theme: which @sudobility/design theme is active, and the CSS
  // variables NativeWind resolves semantic classes against. Presentation
  // configuration, and it must match the web app's.
  'src/config/designTheme.ts',
  'src/config/themeVars.ts',
  // Bundled translations, and which language is in force. The copy the
  // libraries need is built by music_lib's `createLibraryCopy` from this app's
  // `t` at the composition root; nothing here restates its keys.
  'src/i18n/index.ts',
  // The app's own documents — a tab id over music_lib's document store, the
  // services every store is built with, and the list of what is open with each
  // tab's caret. Saving, the file format and the unsaved-work guard are the
  // libraries'; none of this is about music.
  'src/documents/document.ts',
  'src/documents/document-list.ts',
  // The one platform-bound file in the document layer.
  'src/documents/rn-storage.ts',
  'src/documents/rn-storage.windows.ts',
  'src/documents/rn-key-value.ts',
  // Which format a document goes out as, and what the file is called. Every
  // export is one call on music_io; none of the encoding is here.
  'src/documents/export.ts',
  // Which format a document comes from, and that an import makes a new
  // document rather than editing the open one. The decoding is music_io's.
  'src/documents/import.ts',
  // Geometry that turns a touch into a place in the score. It reads a
  // LayoutPlan, which is music_drawing's, but every question it answers is
  // about a pointer — the same split music_app makes for its hit tests.
  'src/features/score/hit-test.ts',
  // Which keys count as one chord — a rule about overlapping touches, and the
  // one part of the keyboard panel worth testing without a renderer.
  'src/features/piano-keyboard/key-group.ts',
  // The recent-documents list: ordering, a cap, and a handle that is a
  // security-scoped bookmark on sandboxed macOS. App state, not music.
  'src/documents/recent-documents.ts',
  // What colour a notation glyph is drawn in. `currentColor` is an SVG idea
  // react-native-svg does not resolve, so every glyph is handed a literal
  // colour; this resolves the theme's token to one. Entirely a property of the
  // renderer, and meaningless anywhere the glyphs are not drawn by hand.
  'src/components/icons/notation-ink.ts',
  // Composition facade and app-owned integrations for the native harness.
  'src/app-library.ts',
  'src/store/context.ts',
  'src/store/document-store.ts',
  'src/services/errors.ts',
  'src/services/library-copy.ts',
  'src/services/export/export-plan.ts',
  'src/services/persistence/document-saver.ts',
  'src/services/persistence/project-ui.ts',
  'src/services/persistence/project-write.ts',
  'src/services/playback/bind-player.ts',
  // Cross-window state sharing. The desktop Projects window is a second,
  // fully separate `RCTRootView` — a different React tree from the main
  // window's — so the two can only agree on the same open documents and the
  // same cached project list through a module-level singleton, not through
  // context. Wiring, not a rule about music.
  'src/app/appState.ts',
  // Which navigator implementation a stack uses: `@react-navigation/stack`
  // on desktop (native-stack has no macOS platform), native-stack on mobile.
  // A platform choice about navigation, not about music.
  'src/app/createAppStackNavigator.ts',
  // The closed vocabulary of the desktop Projects window's sidebar panes,
  // shared between the sidebar and the split view so the two cannot
  // disagree about the set. A type declaration, nothing to test.
  'src/app/projects-window/paneKey.ts',
  // The desktop Projects window boundary: opening it, focusing the main
  // window, and closing it, all native module calls (`MoosiacProjectsWindow`
  // — `AppDelegate.mm` on macOS, `WindowManagerModule.cpp` on Windows).
  // Platform glue in the same sense as `menu-commands.ts`, and for the same
  // reason: the native module is declared in this app, so no library could
  // own it either.
  'src/platform/projectsWindow.ts',
  // The window title bar and the app's own menu-bar name, both native module
  // calls (`MoosiacWindowTitle`). Same shape as `projectsWindow.ts` above —
  // `menu-commands.ts`'s own comment explains why this cannot be a library.
  'src/platform/windowTitle.ts',
  // Which edges of the screen a layout clears, as one rule every screen
  // reads (`useSafeEdges`): about this app's devices — a phone on its side
  // with its status bar hidden — not about music. Its Windows twin answers
  // "none" without the hooks that platform cannot load.
  'src/platform/safe-edges-rule.ts',
  'src/platform/safe-edges.ts',
  'src/platform/safe-edges.windows.ts',
]);

describe('music_app_rn holds UI only', () => {
  it('has no plain logic module outside the allowed list', () => {
    const stray = sources
      .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
      .filter(f => !ALLOWED_NON_UI.has(f))
      // A hook is UI: it exists to bind a component to something.
      .filter(f => !/\/use[A-Z]/.test(f));
    expect(
      stray,
      'A plain .ts module here is either UI, or it belongs in a library. ' +
        'Add it to ALLOWED_NON_UI with the reason if it is genuinely neither.',
    ).toEqual([]);
  });

  it('never reaches past the libraries to a rendering engine', () => {
    // VexFlow is music_drawing's business. Importing it here would put layout
    // in two places, and they would disagree the first time either was tuned.
    const offenders = sources.filter(f =>
      /from 'vexflow'/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('lets the libraries decide their own platform', () => {
    // The `react-native` export condition picks the RN build of music_io and
    // music_player. Importing `/web` or `/rn` explicitly bypasses that and is
    // how a web build ends up in a phone bundle.
    const offenders = sources.filter(f =>
      /@sudobility\/music_(io|player)\/(web|rn)'/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
