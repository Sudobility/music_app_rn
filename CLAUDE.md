# music_app_rn (Moosiac, native)

> **Git policy — never auto-commit or auto-push.** Leave your work in the
> working tree. Run `git commit`, `git push` or `gh pr create` **only when the
> user explicitly asks in that turn.**

The native Moosiac app: iOS, iPad, Android phone and tablet, macOS, and the
initial React Native Windows target. Windows currently has explicit fallbacks
for score rendering, file dialogs, and printing; those capabilities are not
silently routed through Apple/mobile native modules. See
`music_app/docs/rn-windows-findings.md` for the remaining Windows research and
native implementation work.

**The Windows project is a Composition (new-architecture) Win32 app, like every
other app in the family — not UWP.** `windows/MoosiacRN/` is the exe
(`MoosiacRN.cpp` is `WinMain`) and `windows/MoosiacRN.Package/` packages it as
a full-trust MSIX under the identity the UWP build shipped with. It was UWP/XAML
until the Windows Google sign-in moved to a loopback redirect
(`http://127.0.0.1:<port>/callback`, a Google "Desktop app" client): an app
container may not listen on loopback, and a reversed client id is longer than
the 39 characters a UWP protocol name allows, so the shared `WebAuthModule`
from building_blocks_rn builds only in a Composition app. What the XAML pages
did is now Win32 in `MoosiacRN.cpp`: the File/Edit menu bar is an `HMENU`, and
its shortcuts are an accelerator table applied by a `WH_GETMESSAGE` hook,
because WinAppSDK's `RunEventLoop` has no place to call `TranslateAccelerator`.
The Projects window (`WindowManagerModule`) is a second `ReactNativeWindow` on
the same `ReactNativeHost`, on the one UI thread; closing it hides it, as on
macOS. Bundled files are found from the **exe's folder**
(`MoosiacApp::AppDirectory()`), not `Package::InstalledLocation`, which in a
packaged Win32 app is the package root, one level up. **None of the Windows
native code has been compiled or run** — there has been no Windows toolchain
where it was written.

Like `music_app`, this repo is **UI and arrangement only**. Every rule about
music lives in the libraries: `music_types` (the model, every type definition
and vocabulary, and the pure helpers both frontend and backend use),
`music_editing` (editing and its state — nothing else), `music_lib`
(application state, commands, adapters, the player binding, documentation
content, device prefs),
`music_drawing` (layout and the renderer), `music_player` (sound),
`music_io` (files), `music_client` (network). If you are about to write score
maths here, it belongs somewhere else.

## Commands

- `bun install` — dependencies (runs `patch-package` afterwards; see Patches)
- `bun run verify` — format, typecheck, lint, both test suites. Before any push.
- `bun run test` / `bun run test:watch` — vitest, the plain-TypeScript half
- `bun run test:components` — jest, the half that renders
- `bun run start` — Metro on port 8091
- `bun run ios` / `bun run android` / `bun run macos`

## What is different from the web app

- **The store is per document, not per app — and it is music_lib's.** A
  desktop edits several scores at once, and one app-wide store cannot hold two.
  Each document is `createDocumentStore` from music_lib: the web project's
  editing slices, saver and project write, composed per document, for either
  origin — a `.moo` file (written through `DocumentFileStorage`, which
  `rn-storage.ts` supplies) or a server project. `title`, `origin`, `dirty`,
  `saveState`, `serverUpdatedAt` and `lastGeneration` are **store state**.
  `src/documents/document.ts` adds only a tab id (`MusicDocument = { id, store }`)
  and the `DocumentServices` every store is built with. This app used to wrap a
  bare editing store with its own autosaver (`autosave.ts`), its own project
  calls (`project-sync.ts`), its own file format (`document-file.ts`) and its
  own close guard (`unsaved-guard.ts`); all four are deleted. The copy had
  drifted in the ways that lose work quietly: a write that raced an edit marked
  the document clean, and every project save PUT the whole score.
- **There is no auth gate.** A local file needs no account. `StoreContext`'s
  `client` and `getToken` are optional, and anything server-backed reports
  itself unavailable through `serverAvailable` rather than failing. Signing in
  adds server projects later; it does not gate what is already on disk.
- **Drawing is Skia, through the same renderer.** `createSkiaContext2D` turns an
  `SkCanvas` into the `DrawingContext2D` `music_drawing` wants — that one
  adapter is the whole of React Native support, and `CanvasScoreRenderer` runs
  unchanged. Drawing happens inside `createPicture`, so a scroll replays a
  recorded picture rather than re-running VexFlow.
- **The reader is shown a _bar_; the code keeps `Measure`.** The shared
  libraries already split it — `Measure` is the model type, `bar` is the number
  a reader is shown, which is why `barNumberAt` exists at all (a measure index
  is not a bar number, because a pickup has an index and no number). The copy
  used both words interchangeably inside single sentences in both apps. Keys
  keep the model's word: `inspector.replaceMeasures` reads "Replace Bars".
  Chinese needed no change — 小节 covers both.
- **The two apps' copy is pinned against each other from this side.**
  `cross-app-parity.test.ts` reads `music_app`'s locales off disk and holds 798
  shared keys to account. Only this direction: the web app's suite must not need
  a checkout of this one, and these tests skip rather than fail when the sibling
  is absent. Three checks. **Where the English agrees, the Chinese must agree
  too** — a key with identical English and different Chinese is a translation
  fork nobody decided, and six had accumulated. English differences live in
  `WORDED_DIFFERENTLY` with a reason each; a pointer tooltip and a touch hint
  may legitimately differ, and "measure" versus "bar" sits there marked
  **undecided**, because one product should have one word for a bar of music.
  And every `labelKey` music_types publishes must resolve in both apps and both
  languages: those lists carry a key rather than a word, so a host with no
  string for one prints the key — which is exactly what the web's ornament
  picker did, and what neither app's own parity test could see.
- **Translations are bundled, not fetched.** A locale that arrives over the
  network is a blank screen on a train. `locale-parity.test.ts` pins both
  halves: the same keys in both files, and every zh string actually containing
  CJK — key parity alone passes happily when English was copied across.

## Package boundaries

**Each library has one responsibility, and the rules for placing code are the
user's:**

- **Type definitions and vocabulary live in `music_types`.** A type or a closed
  list (`ThemeMode`/`THEME_MODES`, `ExportScope`, `LayoutMode`,
  `ScoreCanvasHit`, `InspectorTab`/`INSPECTOR_TABS`, `EDIT_MODE_OPTIONS`,
  `QUANTIZE_GRIDS`, `SHORTCUT_GROUPS`, `DOCS_GROUPS`, `COMMAND_LABEL_KEYS`,
  `Toast`, `ClipboardData`, `DevSettings`, `PlayerFailure`, …) is imported
  from music*types even when the package that \_uses* it is another one.
- **Pure helpers used by both frontend and backend live in `music_types`** —
  the format tables (`IMPORT_FORMATS`/`EXPORT_FORMATS`/`WRITABLE_EXPORT_FORMATS`,
  `AUDIO_IMPORT_EXTENSIONS`), `outOfRangeNoteIds`, the print paper and
  orientation options (`PAPER_OPTIONS`/`ORIENTATION_OPTIONS`).
- **`music_editing` is for editing only, and depends on neither
  `music_codecs` nor `music_player`.** So it does not own playback
  (`bindPlayer`/`PlayerBinding` are music*lib's), documents (`decideClose`,
  `planExport` are music_lib's), docs content (`DOCS_TOPICS`,
  `docsGroupLabelKey`, `RESOURCE_GROUPS`, `hostOf`, `monogramFor` are
  music_lib's), the theme (`resolveThemeMode` is music_lib's) or keyboard
  drawing (`litKeys`/`samePitchSet`/`playingPitchesForTrack` are
  music_drawing's). It does own touch classification (`classifyPress`), since
  deciding what a press \_means* is editing.
- **No re-exports from old homes.** When something moves, every import here
  moves with it; an import from the old package is a compile error, not a
  deprecation.

**Canvas geometry belongs to `music_drawing`; app layout geometry stays here.**
The line is the canvas edge. Anything that reasons about the _drawn score_ —
where a note went, which measure or track a point lands in, what pitch a stave
position means, where the playing measure sits, the colours VexFlow draws with
— is `music_drawing`'s, because the canvas is what that package owns and
because two apps draw the same score. Anything that reasons about the app
_around_ the canvas is this app's: a scroll container, a panel, a sheet.

That boundary is why tapping a note works here at all. It used to resolve only
to a _measure_, because the hit-testing lived in music_app and nothing on this
side could ask which note was under a finger — and because `ScoreView` built a
new renderer for every frame, throwing away the bounding boxes with it. One
renderer per view, and `hit-test` in the library, is what fixed it.

## Gotchas

- **Two test runners, split by extension.** `*.test.ts` is vitest's and runs
  under `node` with no React Native in it at all; `*.test.tsx` is jest's, with
  the React Native preset, because rendering a component needs the babel
  transform for React Native's Flow-typed source and vitest's esbuild pipeline
  does not have it. Three things in `jest.config.cjs` are load-bearing and each
  cost a debugging cycle. The **transform allow-list** must name every ESM-only
  dependency by hand (`immer`, `zustand`, `i18next`, every `@sudobility`
  package) _and_ allow for bun's `.bun/<pkg>@<ver>/node_modules/<pkg>` layout,
  which the usual pattern misses. The **legacy Paper renderer is mapped to a
  stub**: its build asserts an exact React version and this app pins React to
  what react-native-macos requires, a patch ahead of what react-native's Paper
  build was compiled against — so merely _loading_ it throws, which
  `Animated`'s native driver does through `RendererImplementation`. Nothing in
  the app reaches it (all three platforms run Fabric), so the stub removes a
  test-only path rather than hiding a real mismatch. And the **timeout is
  20s**, because starting i18next costs a couple of seconds the first time in a
  process and the failure it causes is a timeout with nothing wrong in the test. A
  fourth is `jest.mocks.cjs`, which exists for native modules that **throw at
  import** rather than degrading — `AsyncStorage` is one, so anything reaching
  `ThemeContext` (and through it anything asking what colour scheme is in
  force) fails to _load_, in a suite that has nothing to do with storage. The
  package ships its own in-memory mock; use it rather than stubbing methods.
  A fifth is `jest.firebase.cjs`, mapped for `firebase/app` and
  `firebase/auth`: `useSignInForm` reads `isSignInCancelled` from
  `@sudobility/auth_lib/signin`, a subpath that also imports the Firebase JS
  SDK, whose ESM (`.mjs` included) jest cannot load — and no component test
  signs anybody in, since each mocks `@/auth/AuthContext`.

- **React, react-native and react-native-macos are one locked trio, and getting
  it wrong crashes the app at launch.** `react@19.1.4`, `react-native@0.81.6`,
  `react-native-macos@0.81.9` — the combination `react-native-macos` itself
  peers. Each React Native ships a _renderer bundle compiled against one exact
  React version_ and asserts it at load: 0.81.5's wanted 19.1.0 while
  react-native-macos wanted 19.1.4, so iOS and Android died on the first screen
  with **"Incompatible React versions: react: 19.1.4, react-native-renderer:
  19.1.0"** while macOS ran perfectly — a split that makes it look like an iOS
  bug rather than a version one. And it is not avoidable by "running Fabric":
  `RendererImplementation.findNodeHandle` requires the **Paper** shim
  unconditionally, with no Fabric branch, so anything reaching it — `Animated`
  with the native driver, for one — loads Paper and trips its assert. That is
  also why the jest config maps the Paper renderer to a stub; the two are the
  same root cause, and treating the test failure as test-only is what hid the
  runtime crash for a whole session. `react-versions.test.ts` now reads the
  literal each renderer asserts and compares it against the installed `react`,
  so the next mismatch fails a test instead of a launch — and the jest stub that
  used to hide it has been deleted, because a workaround for a fixed bug is a
  blindfold for its recurrence.

- **A `.test.tsx` using `jest.fn()` must `import { jest } from '@jest/globals'`,
  and forgetting it fails only in `typecheck`.** Jest injects the global at run
  time, so the suite passes; `tsc` sees the ambient _namespace_ and reports
  `TS2708: Cannot use namespace 'jest' as a value` — which means `bun run test`
  is green and `bun run verify` is red, and the failure names a file whose tests
  all passed a moment earlier. Every existing test file here has the import;
  copy one when adding a file rather than starting from the web app's, where
  vitest's `vi` needs no such thing.
- **RNTL is pinned to v13, and that pin is about React.** v14 renders through
  `test-renderer`, whose `react-reconciler` is built for React **19.1.0**
  exactly, and this app is on 19.1.4 for react-native-macos. There is no
  stable 0.33.x reconciler for 19.1.4, so v14 cannot work here; v13 uses
  `react-test-renderer`, which _is_ published at 19.1.4. The visible symptom of
  getting this wrong is an `AggregateError` from `render` with no cause in it.

- **Printing needs no PDF writer.** Every one of the three print services takes
  a _drawing_ and produces the document itself: `PrintedPdfDocument` hands back
  a `Canvas` on Android, `UIPrintInteractionController` lays out page images on
  iOS, and `NSPrintOperation` calls `drawRect:` with a print context on macOS.
  So `print-pages.ts` renders each page into a Skia offscreen surface with the
  same renderer the editor draws with, and `native/print` hands the PNGs over.
  Everything about _what_ a printed page is — page mode, one ink, no gutter, no
  editor state, paper sizes, margins, and page turns that land where the player
  has bars free — lives in `music_drawing` and is shared with the web app.
  Which score goes on paper (a part via `extractPart`, or the marked full
  score), which tracks, which systems per page and whose page turns is
  music_drawing's `printPlan`, the web print view's own call; `PrintSheet` asks
  scope, paper and orientation from music_types' `PAPER_OPTIONS`/
  `ORIENTATION_OPTIONS`. This
  app's own `print-plan.ts` is deleted.
  **The print dialog must never be presented over a sheet that is still on
  screen, and that ordering is the caller's job.** The sheet stays up with
  Print spinning while `renderPrintPages` draws (async, yielding between
  pages), and `printScore`'s `beforeDialog` closes it only then. Closing first
  raced: on a long score the drawing held the JS thread for seconds, the close
  reached UIKit late, the native module gave up waiting after 2 s and presented
  over the sheet, and the departing sheet took the dialog with it — a blank
  screen (reproduced with a 21-page print on an iPhone 17 Pro simulator).
  `MoosiacPrint.mm` now waits up to 10 s and rejects `print_busy` rather than
  present over anything. Each page is a ~3000×4000 GPU surface, so its surface
  and snapshot are `dispose()`d as soon as its PNG is taken.

- **A file picker is three controls.** iOS and iPadOS raise a
  `UIDocumentPickerViewController`, Android goes through the Storage Access
  Framework, and macOS puts up an `NSOpenPanel` — and
  `@react-native-documents/picker` declares `:ios` only, because there is no
  Mac equivalent of that class. The Mac half is `native/file-picker`, a local
  autolinked module of about ten lines of AppKit, selected by
  `file-picker.macos.ts`. On a sandboxed build the panel is not a convenience:
  it is where the _permission_ to read the file comes from, which is why a path
  from anywhere else cannot be opened.

- **A project-level `platforms` entry replaces a package's own.** Listing
  `@moosiac/file-picker` in `react-native.config.js` with
  `platforms: { ios: null, android: null }` wiped the `macos` entry the package
  declares for itself, and it disappeared from autolinking entirely — the pod
  was never installed, with no error anywhere, because `loadConfig` swallows a
  failed dependency in a bare `catch`. A package that declares its own
  platforms needs no entry here; only add one to _remove_ a platform it does
  declare. Diagnose with `bunx react-native config | grep <package>`.

  A second trap in the same file: `podspecPath` is **absolute** and
  `sourceDir` (Android) is **relative to the package root** — the Android
  resolver joins it onto the root itself, so an absolute path there resolves to
  nothing and the module is silently not linked. And `react-native config` from
  the project root is not the oracle for macOS: it reports `macos: null` for
  packages that macOS autolinking does install, because the macOS Podfile does
  its own `list_native_modules!`. Check `macos/Podfile.lock` instead.

- **Two macOS build flags live in `macos/Podfile`, not in a shell.**
  `react-native-audio-api` ships prebuilt Ogg/Vorbis/Opus libraries whose macOS
  slices are built for **macCatalyst**, and vendors its FFmpeg xcframeworks
  under `s.ios` only. `DISABLE_AUDIOAPI_STATIC_EXTERNAL_LIBS=1` fixes the
  first; without `DISABLE_AUDIOAPI_FFMPEG=1` as well it merely swaps one link
  error (_"built for 'macCatalyst'"_) for another (_"\_swr_init … symbol(s) not
  found"_), which reads like the fix regressing. Passing them to one
  `pod install` by hand leaves the next one producing a project that does not
  link.

- **The generation rules are `music_client`'s.** Polling the _project_ rather
  than the job, comparing `updatedAt` strictly rather than for difference,
  reloading before unlocking, and slowing the cadence when nothing is running
  are rules about _this server_, and both apps obey them — so
  `useProjectGeneration` lives there and `useDocumentGeneration` here supplies
  only what differs: the per-document store, the client, a `flush` (the
  store's `saveNow`), and a `ForegroundPort` over `AppState` where the web app
  passes one over `document.hidden`. After a job lands the editor calls the
  store's `reloadFromServer(player)`, which stops the transport before it
  adopts.

- **`advanceCaret` defaults to false.** `insertNoteAtCaret` leaves the caret
  where it is unless told otherwise, so a run of taps writes every note at the
  same tick. The piano-keyboard and tap-to-note paths in music_editing pass
  `true`; so must any note-entry UI here. A test pins it.
- **Multi-codepoint musical characters do not render, and the fix is that the
  glyphs are data now.** `𝅝`, `𝄽`, `𝆔` and `𝄐` are outside the system font's
  coverage and draw as `?` boxes, where the single-codepoint `♩`, `♪`, `♭`, `♯`
  and `♮` are fine. So no notation mark is a character: `NOTATION_ICONS` in
  music*types holds every one of them as shapes, `NotationIcon.tsx` replays
  them with `react-native-svg`, and the web toolbar replays the same table —
  a semiquaver here \_is* the web's semiquaver rather than a lookalike. Reach
  for `NotationIcon` before reaching for a character; if a mark is missing from
  the table, add it there (authored in `music_app`'s `notation-icons.tsx` and
  generated, see that repo's CLAUDE.md) rather than finding a codepoint.
- **A notation glyph's colour is passed, and it must come from the theme.**
  `currentColor` is an SVG idea `react-native-svg` does not resolve, so every
  `NotationIcon` is handed a literal colour — which is exactly the thing that
  cannot follow light/dark. The toolbar hardcoded `#18181b`, so every drawn
  glyph on the editing bar vanished in dark mode. **Heroicons are the same
  case, not an exception**: a `className` colour on one is silently dropped —
  NativeWind's interop only reaches elements created through its JSX runtime
  or a `createElement` its babel plugin recognises as React's, and the
  prebuilt heroicons call it through an alias it does not — so
  `fill="currentColor"` resolves to black. Play and Stop drew black on the
  dark playback bar this way, along with every title-bar glyph. Every icon
  takes `color={ink.…}`; `design-system.test.ts` refuses a class on one.
  `useNotationInk()` resolves
  `foreground` / `primaryForeground` / `mutedForeground` from the same
  `swissTheme` tokens `themeVars.ts` applies, so there is one statement of what
  "foreground" is rather than a hex copy of it. Never write a hex for a glyph.
- **The editing bar and the playback bar are the web app's, control for
  control** — same groups, same order, same dividers, same glyphs, same
  availability rules. They are one product, and a native bar that offers a
  different set of tools is a different app wearing the same name. Two things
  about that are load-bearing. **Several choices are a picker, not a row of
  chips**: six note values, five accidentals, five articulations, five
  ornaments and four quantize grids came to twenty-five chips and a bar three
  screens wide, where the web's fits one — each is a `ToolbarSelect` with one
  glyph on the trigger and the words in the sheet, which is what the web's
  `Select` does and for the same reason (five near-identical marks are
  unreadable as a row of 18px glyphs). No library select can be used for this:
  `Select`, `PopupSelect` and `SheetSelector` each draw their own bordered text
  trigger and none accepts one, so only the sheet is ours. (`SheetSelector`,
  which the inspector's Track tab uses, now presents through `ModalHost` as a
  real RN `<Modal>` that slides up on a phone and fades in on a tablet, with a
  `Portal` only on macOS where mounting a `<Modal>` throws — it drew a raw
  `Portal` before, the one overlay in the app that appeared with no animation.)
  And **a compact window groups
  the bar; a wide one shows it all**. Every button is a full minimum
  touch target now (`MIN_TOUCH_TARGET`, 44/48 — see the buttons note below), so
  the editing bar's ~30 controls do not fit a narrow window. In a compact window
  only the note-entry essentials stay on the bar — add-track, the note value,
  note input and accidentals, plus the inspector toggle pinned right — and the
  rest go into a `ControlsSheet` behind one "…". A wide window has room and
  shows them all inline (`flex-wrap`, no sheet). **Compact is a size class, not
  a device** (`features/layout/compact-bars.ts`'s `barsCompact`): always a phone,
  whose ~30 controls do not fit even in landscape, and a tablet or desktop only
  while its window is narrower than `COMPACT_BAR_MAX_WIDTH` (~600pt, the point
  the iPad's horizontal size class flips to compact and the split view collapses
  to one column). So the bar collapses when an iPad is resized into a split view
  or a Mac window is dragged small, and opens back up when widened — the width is
  the bar's **own measured width** (`useContainerSize`, never
  `useWindowDimensions`, which reports the display on macOS and does not update
  for a windowed app), so the two `EditorToolbar` layouts follow a resize. This
  used device `useFormFactor` before, which pinned an iPad to the inline bar
  however small its window. The controls are defined once
  as variables in `EditorToolbar` and placed into whichever arrangement applies,
  so the two cannot drift. This replaced a horizontal scroller with the view
  controls pinned outside it, which hid half the tools off the right edge under
  the notch.
- **Every button is a full minimum touch target, and a NativeWind gotcha hid
  that for a while.** `IconButton` draws at `MIN_TOUCH_TARGET`
  (`@sudobility/components-rn`: 44pt on iOS/macOS, 48dp on Android) in *both*
  width and height, the 18px glyph centred; `GlyphChip` and `TextChip` wrap
  `IconButton`, so they inherit it. It used to draw at 30pt and only widen the
  *touch region* with `hitSlop`, so the buttons looked narrower than they
  responded. The min size is a **static** style object: NativeWind silently
  **drops a `style` *function*** passed alongside `className` (the border added
  to prove it never showed), so a function-returned `minWidth` never applied and
  the buttons stayed content-narrow. The pressed dim is a `active:opacity-40`
  className variant now, not a `style` function.
- **Each of the three editor bars groups behind one "…" when it is short of
  room.** The
  title bar uses `OverflowMenu` (a list of actions); the editing bar and the
  playback bar use `ControlsSheet` (a settings panel holding the live controls —
  toggles, selects, sliders, a field). A wide window shows everything inline.
  The title bar keeps Save/Undo/Redo and sheets Export/Print/Snapshots/Help/
  Settings; the playback bar keeps reset/play/the readouts/the scrubber/the 3D
  stage and keyboard toggles and sheets loop/metronome/tempo/speed/output/volume
  — the 3D toggle is a view you step into like the keyboard, not a setting, so
  it stays on the bar beside it rather than in the sheet. **The editing and
  playback bars group by size class** — `barsCompact` over the bar's own
  measured width (see the editing-bar note above), so they collapse in a narrow
  iPad or desktop window, not only on a phone. **The title bar still groups by
  device** (`useFormFactor`): its few actions fit any tablet or desktop window,
  so there is nothing to gain from measuring it. Each bar's controls are defined
  once and placed into whichever arrangement applies.
- **Every navigation bar is the design theme's red, and the app root is painted
  the same red so a pushed screen has no band above its bar.** The red is one
  rule — `useNavigationTheme`'s `card`/`text` are `primary`/`onPrimary`, so
  every React Navigation header (the editor's, the split views' `PanelBar`s, the
  tab screens' bars) is red with white text, not just the editor's. The
  `TopClearance` strip above a panel bar is `bg-primary` too (its body paints
  `bg-background` over the rest, or the red bleeds through a pane's notch padding
  as a band down the side in landscape), the `PanelBar` back chevron is
  `onPrimary`, and `ThemedStatusBar` is **always** `light-content` now, since the
  top of every screen is red. The editor's
  native header is `bg-primary` (red); a pushed native-stack screen is inset
  below the window's top safe area on the iPhone Duo's folded cover screen, and
  the strip above its bar shows the app root — so `App.tsx` paints the root
  `bg-primary` (the design theme's colour, via the vars provider, so it follows
  light/dark), and the red reads to the top edge with no white/grey band. A
  custom opaque `headerStyle.backgroundColor` does **not** extend under the
  status bar there (the default translucent bar does, which is why sudojo's
  plain-default headers never showed a band). The status bar is shown on every
  device — `ThemedStatusBar`, app-based (`UIViewControllerBasedStatusBarAppearance`
  is NO; a native-stack `statusBarStyle`/`statusBarHidden` redboxes against that,
  and the JS `StatusBar` redboxes against YES) — and the editor renders a
  `light-content` `StatusBar` over its red header.
- **Availability is the other half of copying the bar.** Eleven controls act on
  the selection and quietly return when it is empty; leaving them live is a
  control that invites a tap and gives no feedback, which is worse than one
  plainly unavailable. The rules are music_editing's `selectToolbarAvailability`, which the web
  bar reads too, and the multi-call controls are the library's as well:
  `insertDefaultNoteAtCaret`, `quantizeSelectionToGrid`, `runMoreAction`,
  `addTrackChoices`/`runAddTrackChoice`, `selectEffectiveEditMode`/
  `editModeHintKey` — over music_types' vocabulary (`EDITOR_MORE_ACTIONS`,
  `EDIT_MODE_OPTIONS`, `QUANTIZE_GRIDS`, `EDITOR_VOICE_COUNT`). The bar
  **shows** the effective mode and never writes it back: the library's write
  paths (`insertNoteAtCaret`, `paste`) read `selectEffectiveEditMode`
  themselves, so Stack chosen on a piano is still Stack after a visit to a
  flute. The write-back effect this bar used to run is what lost that choice.
  Go to bar passes the typed text to
  `goToBarFromInput`, which counts bars as drawn (a pickup has no number). Fix
  all's toast and whether the issues list closes are `repairIssuesOutcome`'s.
- **Volume and pan use native sliders on all app platforms.** iOS uses
  `@react-native-community/slider`; macOS uses the `@sudobility/components-rn`
  AppKit `NSSlider` view. Android uses the community slider's SeekBar, while
  Windows uses the shared package's Fabric Composition slider. Both mixer
  rows come from `features/tracks/MixerSliders.tsx` so their labels, slider
  widths and readouts stay aligned. Pan's `C`/`L40`/`R25` readout states the
  position even where the native track fills from the left.
- **The tempo field is the one control on the playback bar that edits the
  score.** Loop, metronome, speed, volume and seeking are real-time device
  control and go to the player; BPM is persisted with the music and goes
  through music_editing's `commitOpeningTempoText` (blank is no change;
  rounded and clamped), which is why `TransportBar` takes the document's
  store as well as its score. Whole numbers only, and a non-numeric draft is
  refused rather than committed — a score with a `NaN` tempo has no tempo at
  all.
- **Every other transport control goes through `usePlayerBinding`**
  (music_lib's `bindPlayer`), which writes loop, metronome, speed, volume
  and `synthLoad` into the document store and mirrors the transport state there
  — which is what makes the edit lock during playback real on this app. The bar
  reads those values back from the store. A `PlayerFailure` becomes a toast
  worded with `libraryMessage`, as music_lib's adapter does. `useTransport.ts`,
  the binder this app wrote for itself, is deleted; loop now follows the web
  rule (the selection when there is one, else the whole score).
- **The property sheet is the web inspector's, tab for tab** — and the two
  ways it had quietly drifted are both the kind that look fine on screen.
  **A percussion track's `midiProgram` addresses a kit, not an instrument**, so
  the Track tab offering `INSTRUMENT_OPTIONS` on every track named a drum part
  after whatever instrument shared its number (Brush is kit 40; program 40 is
  Violin). It asks `isPercussionTrack` and offers `KIT_OPTIONS` instead — the
  same split the web makes, and the reason `setTrackInstrument` takes the
  catalogue _value_ rather than a number. And the Note tab **printed a literal
  `1` for every note's voice**, which is right by coincidence on the default
  track and wrong the moment anybody uses the second; it reads `voiceNumberOf`
  now. Fields that were simply absent — octave, velocity, the tie toggles, the
  slide span, the grace-note conversion, the bar/beat position, the track
  readout, the clef, the key and time signatures, Delete Track — are there too.
- **Every inspector field answers for the whole selection, via `commonValue`.**
  Where the selected notes agree it shows the value; where they do not it reads
  "Mixed" and setting it applies to all of them. A panel that showed the _first_
  note's value would say "Staccato" for a selection that is mostly not, and
  setting it would look like a no-op on the notes that already agreed.
- **Pitch is edited through the display lens and never round-tripped.** The
  step, accidental and octave a reader sees on a transposing instrument or
  inside an `8va` are not what is stored, so a patch is applied to what is
  _shown_ and converted once by `setNotePitch`. Feeding the stored pitch back
  through the lens moves it by the transposition every time the panel is
  touched — silently, since the note then draws exactly where it was.
- **Replace lives on the property sheet's tabs, not on the toolbar.** The scope
  _is_ the tab: Replace Notes beside the note you selected, Replace Measures
  beside the bars, Replace Track beside the part. On a toolbar all three are
  equally far from the thing they act on and the reader has to work out which
  region each one means from its name. It briefly sat in the toolbar's More
  menu here; the web has always put it in the tabs.
- **Cut, copy, paste, clear and delete live on the long-press menu, not on the
  editing bar** — on both platforms. Four toolbar buttons that all act on
  something already selected and none of which can say _what_: Delete means a
  track going, a bar going and the score renumbering, or notes going and the
  ones behind shifting forward. `ScoreActionsSheet` opens **on the object** and
  names it first, in small grey type above the entries. The sheet draws
  music_editing's `scoreContextMenuModel` (bars counted by index, not id) and
  `AppLayout` performs entries with `runScoreContextAction`, which re-checks the
  edit lock at the moment an entry is chosen. **Clear joined them**, and it is a different edit rather than
  a softer Delete: a cleared bar keeps its number and its markings, a cleared
  track keeps its instrument and its mix.
- **A touch is classified, then routed by music_editing.** `ScrollingScore`
  hands the canvas's hit to `onPress(hit, pointTick)` or `onLongPress(hit)`
  and decides nothing else. It tells a tap from a long press from a drag with
  music_editing's `classifyPress` (`pointer: 'touch'`), measuring movement in
  **page** coordinates, because the surface moves with the finger during a
  scroll — measured on the surface, a flick that came to rest over a note
  selected it. `AppLayout` passes a tap to `routeScorePress` (the web's click
  rules, with `pointTick` from `canvas.tickAt`, so a press on nothing is still
  reported), and a long press to `selectForContextMenu`, which keeps a
  selection the press lands inside and selects nothing on a bare stave. The old
  long press aimed the caret first, which cleared the selection the menu then
  opened to act on.
- **Lyric entry is music_editing's rules over watched text.** `beginLyricEntry`
  picks the notes and the start (null while playing); `LyricEntryBar` runs
  every input through `lyricEntryStep`/`applyLyricStep` and splits typed text
  with `splitLyricSeparator`, so a hyphen or space counts **anywhere** in the
  text, as the key does on the web; this bar used to honour one only at the end.
- **The inspector decides nothing.** What each field offers and commits is
  music_editing's `inspector.ts` (`commitBarTempo`,
  `setClefAtMeasure`/`measureClefOptions`, `canReplace`,
  `selectEditLocked`/`controlLocked`, `noteTextFieldsVisible`,
  `defaultInspectorTab`) and music_types' tab order and field values
  (`INSPECTOR_TABS`, `pickupBeatOptions`, `parse/formatEndingNumbers`, `durationFieldState`,
  `parseNumericDraft`, `clampVolume`/`clampPan`/`volumeReadout`). Number fields
  are `NumberDraftInput` drafts committed on blur — blank is no change, never 0
  — not `NumberInput`, which committed per keystroke and could not show Mixed.
  The Note, Bar and Score tabs lock while playing; only volume, pan, mute and
  solo stay live. **A draft whose commit wrote nothing goes back to the stored
  value**: `changeVelocity`, `setFingering` and `setNotePitch` answer a boolean,
  and `DraftInput`/`NumberDraftInput` reset when `onCommit` returns `false` —
  an octave outside the compass stayed on screen as though applied. The Note
  tab's **bar and beat are typed**, as on the web (`BarBeatFields`: two drafts
  committed together on blur through music_types' `barBeatCommitTick` — the
  whole parse-and-is-this-a-move rule, shared with the web's `BarBeatField` —
  and `moveNoteToTick`, which answers a boolean like the three above; a move it
  refused re-seeds both fields **and raises a toast**, since resetting alone is
  indistinguishable from a typo being snapped back. The beat is shown by
  `formatBeatForField`, and the fields appear for one note only), and the Track tab
  says how many notes the instrument cannot play (`inspector.outOfRange`, from
  music_types' `outOfRangeNoteIds` — the scan the notation colours them by). A bar's clef, barline and navigation are resolved on the
  bar's **own** track: they used to be read from the active track and from
  track 1, so a bar selected on another part edited the wrong one.
- **Export is music_lib's `planExport` over music_types'
  `WRITABLE_EXPORT_FORMATS`.** A project writes
  `<title>.moo` through `serializeProjectFile`; the extension is the shared
  list's own (`DOCUMENT_EXTENSION`), and the copy calls it a "project file"
  (项目文件), never "project JSON".
- **The status strip says what is selected — it is not a second place to read
  the track name.** It used to print the active track's name and a bar/track
  count, neither of which the web app shows and both of which the reader already
  had: the renderer paints the track's name into the gutter beside every system,
  in both apps. What was missing was the one thing a status strip is for.
  `selectionSummaryLabel` is music_types', so the two apps read a selection with
  the same function and differ only in the words. The web strip lost two
  readouts in the same pass, for the mirror-image reason: its bar/beat and zoom
  percentage repeated what the transport and the toolbar already say.
- **A refusal from the store has to reach the reader.** `setTrackInstrument`
  answers `outOfRange` rather than half-applying when the part is wider than the
  instrument can play, and the Track tab discarded the result — so a refused
  change looked exactly like one that happened. The Track tab sends it to `pushToast`, an error toast, as the web does. The same
  shape of bug was in the pickup field, which was a `Switch` that always wrote
  one beat: a three-beat anacrusis could be written on the web and not here, and
  a score that had one showed a toggle whose next touch would have shortened it.
- **The keyboard's show/hide control is the transport bar's rightmost button,
  and the keyboard draws nothing when collapsed.** It used to be a bar of the
  keyboard's own — a whole row for one button, and the control that _reveals_
  the keyboard sat inside the thing it reveals, so the row had to survive
  collapsing to stay reachable. The glyph is `PianoKeysIcon` from
  `NOTATION_ICONS`, so it is the same drawing the web toolbar shows: white,
  black, white, because three identical filled bars read as three black keys and
  a black key only ever sits _between_ two whites. `KeyboardPanel` carries a
  `testID` because its keys are not drawn until it has been measured and a test
  renderer measures nothing — there is no key to point at when asserting where
  the panel sits.
- **The piano keyboard's range is the active track's instrument, not always all 88.** `KeyboardPanel` passes no range at one point in its life and
  `PianoKeyboard` fell back to `FULL_RANGE`, so a piccolo part offered three
  octaves that could never sound and a drum kit offered a piano's compass. The
  range comes from `trackKeyboardSpan` (music_drawing, the web keyboard's own
  call), which takes a **`Track`** — asking `midiProgram` directly is the
  drum-kit bug again, since the drums that do sound (35-81) then sit partly off
  the end. It is the instrument's compass snapped to white keys, **widened to
  reach every note the track holds**: an import can hold notes the instrument
  cannot play, and those keys are drawn pale (`KEYBOARD_OUT_OF_RANGE_WHITE`)
  and `disabled`, so they show the notes without letting a person play more of
  them. Editing refuses the same notes through music_editing's
  `range-refusal.ts`.
- **MIDI asks before it imports; every other format does not.** A performance
  has no bar lines, no clefs and no key, and every one of those is a guess — a
  guess nobody was shown is a guess nobody can correct. `MidiImportSheet` opens
  pre-filled from `defaultMidiImportOptions`, so somebody who does not want to
  think about quantization presses Import and is done. A tracker module states
  every note and instrument outright and MusicXML carries its own notation, so
  both go straight in; asking there would be asking a question with one answer.
- **A 402 is not a network failure.** `POST /jobs` answers it at a balance of
  zero, and `useProjectGeneration`'s `onStartError` seam exists so that lands as
  the paywall rather than as a string in the generation overlay. Returning true
  marks it handled, which is what leaves the inline message empty — the sheet is
  the report (New Project decides the same through music*client's
  `classifyGenerationError`), and showing both says the same thing twice in two
  registers.
  **Purchasing is deliberately not offered**: `consumables_pages` has no React
  Native build, so the sheet explains and points at the Credits screen rather
  than half-implementing a store. The \_balance* needs none of that —
  `ConsumablesApiClient` takes a base URL and a network client and nothing else,
  which is why `useCreditBalance` can read it with no purchase SDK and no pods.
- **New Project's credit rules are music_lib's `newProjectCreditState`, and
  its explanation sits under the switch.** The rules are the user's and are
  stricter than they were (the old gate refused only at a spent balance, on
  purpose, and let a job overdraw): "Generate for me" is disabled signed out,
  with no server, or below zero; Create is disabled while generating when
  `balance − estimate` (bars × tracks) would go below zero. A site
  administrator is never refused, and an unknown balance refuses nothing.
  `useNewProjectForm` hands the function an `account` and returns its answer;
  nothing here re-decides it. `GenerateToggle` (shared by `NewProjectSheet`
  and `NewPane`) prints `t(messageKey, messageValues)` **under the switch**,
  with a Buy credits link when the caller passes `onOpenCredits`. It used to be
  "Out of credits" at the bottom of a scrolling form, far from the pinned
  Create button, and nobody saw it. The `newProject.*` strings are the web's
  word for word (`cross-app-parity.test.ts`).
- **A component that renders must not reach for auth.** `NewProjectSheet`
  takes its `account` (signed in, balance, site admin, server) as a prop
  rather than looking it up, because looking it
  up means importing `AuthContext`, which imports Firebase — and that is how a
  form for choosing a key signature ends up unable to render in a test. The
  screen has the auth context; the sheet renders. The same rule is why
  `notation-ink.ts` is worth watching: anything it imports lands in every
  toolbar.
- **`@sudobility` packages need a `default` export condition, and two of them
  did not have one.** `di_rn` and `di` published `exports` maps with `import`
  and `types` only; jest resolves through CJS, falls through every condition and
  reports the package as **missing** — which surfaces as "Cannot find module
  '@sudobility/di_rn'" in a test that never mentions it. Both are fixed at the
  source (`types` first, `default` last, recursing into nested conditions like
  `react-native`). If a new `@sudobility` package ever reports itself missing
  under jest, check its exports map before the transform allow-list.
- **A horizontal `ScrollView` in a column needs `flexGrow: 0` and a height.**
  It has no intrinsic height and takes whatever it is offered, which puts an
  empty band above and below a toolbar.
- **A `className` must appear in the source as a complete literal.** Tailwind
  extracts classes by scanning text, so
  `` className={`flex-1 ${row ? 'flex-row' : ''}`} `` generates no `flex-row`
  utility — the class never appears whole in any file. It fails **silently and
  partially**: colours and borders keep working (those literals occur
  elsewhere), while layout classes vanish, and the score renders into a box of
  zero height. Write two complete strings and choose between them:
  `className={row ? 'min-h-0 flex-1 flex-row' : 'min-h-0 flex-1 flex-col'}`.
- **The design theme is Swiss, and it must match in four places.**
  `music_app`'s composition root calls `configureTheme(swissTheme)`; the two
  apps are one product, and a different palette on native would be a different
  product wearing the same name. On React Native that theme has to be stated in
  `tailwind.config.js`, `src/config/designTheme.ts`, `src/config/themeVars.ts`
  and `scripts/generate-theme-css.js` — NativeWind cannot switch CSS-variable
  blocks on native, so the variables are applied at runtime by
  `ThemeVarsProvider` with `vars()`. Change one alone and the utilities and the
  variables disagree.
- **The UI mirrors the web app's, through the same component library.** The
  layout order — title bar, score with the inspector beside it, transport,
  keyboard, status strip — is `music_app`'s `AppLayout`, and the pieces come
  from `@sudobility/components-rn`, the React Native port of the
  `@sudobility/components` the web app uses. Build UI from those rather than
  from bare `View`/`Pressable`: a hand-rolled control does not inherit the
  design tokens, so the two apps drift the first time the palette moves. If a
  component exists on the web and not in RN, port it into
  `mail_box_components_rn` rather than reimplementing it here.
- **Never size anything from `useWindowDimensions()`.** On macOS it reports the
  _display_, not the app's window — measured: a 1280pt window on a 3440pt
  screen laid the keyboard out at 3440 and clipped it, so the app showed three
  octaves of an eighty-eight-key keyboard and a score whose bars ran off the
  right edge. The same bug appears in any resizable window. (It used to appear
  on iPad in Split View too; `UIRequiresFullScreen` has since taken Split View
  away — see the landscape-only entry below — so macOS is the live case.)
  `useContainerSize()` measures the view with `onLayout`, which is the
  honest number everywhere and updates on resize.
- **A container that waits to be measured must state its own height.** If its
  size comes from a child that only renders once measured, it collapses to zero
  and never measures — the keyboard panel went blank exactly this way. State
  the height on the container, or render at a fallback size and let the first
  layout correct it.
- **Read the active track through `selectActiveTrackId`/`selectSelectedTrack`,
  never `state.activeTrackId` raw.** The selectors fall back to the first
  track, which is what makes "one track is always active" true with no
  reconciliation step. Reading it raw gives `null` on a fresh score, and the
  inspector then renders nothing at all.
- **Position must not be read high in the tree.** It arrives ~30 times a second;
  a component that re-renders on it re-renders the notation with it.
  `PositionReadout` subscribes on its own (through
  `features/transport/usePositionReadout.ts`, which renders only when the text
  changes), exactly as the web app's
  `MeasureBeatReadout` does. Keep new readouts isolated.
- **`bun add` reinstalls `node_modules` from the registry**, silently replacing
  any `@sudobility/*` build you rsynced in during cross-repo work. Re-sync after
  one, or the next typecheck fails on a symbol you just added upstream.
- **The inspector is always a right-hand column, and on touch it trades places
  with the canvas track gutter.** Shown → no gutter; hidden → gutter. The
  arithmetic is why: an iPhone 16 Pro in landscape is 874pt wide and 750 inside
  the safe area, and a 320pt panel beside a 220pt `TRACK_INFO_WIDTH` column
  leaves **210pt of music** — one bar per system. What the gutter says (name,
  instrument, mute, solo) is what the inspector's Track tab says, so nothing is
  lost while it is off, and the active track is changed by tapping a staff,
  which was never the gutter's job anyway (the toolbar's track picker is gone;
  which tracks are drawn is the Track tab's `VisibleTracksField`). **macOS
  keeps both** — hence `TRADES_GUTTER_FOR_INSPECTOR = Platform.OS !== 'macos'`
  rather than a width threshold, which would have to pick a number that quietly
  re-enabled the gutter on an 11" iPad. Hiding it is `ScoreCanvasView.showTrackInfo`
  → `RenderOptions.showTrackInfo`, the one mechanism for this and the same one
  `printRenderOptions` uses: a **layout** option, so the 220 goes back to the
  music and the hit test, `contentSize`, the caret's `clipLeft` and the
  continuous-mode follow clearance all move with it. A canvas that only stopped
  _painting_ would leave the score inset by an invisible column.
  This replaced a 760×600 threshold that put the panel in a **strip beneath the
  score** on anything smaller. That rule made sense while a portrait tablet was
  possible; in landscape it is backwards — a column costs width, which is
  plentiful, and a strip costs height, which is the only thing the score has
  none of (every other row is fixed). `INSPECTOR_COLUMN_MIN_WIDTH`/`_MIN_HEIGHT`
  are gone; what is left is `features/layout/inspector-default.ts` —
  `INSPECTOR_COLUMN_WIDTH` (320, the `w-80`, now in the arithmetic),
  `MIN_SCORE_WIDTH` (480) and `inspectorOpensByDefault`, which decide only
  whether it _opens_ by default. **That helper must subtract the safe-area
  insets, and it is a module of its own so vitest can say so.** `onLayout`
  reports a view's own frame and `SafeAreaView` pads _inside_ it, so the width
  it is handed is the whole 874 of a landscape iPhone, not the 750 the content
  gets — and 874 − 320 clears 480 while 750 − 320 does not. Measured on the
  simulator with the insets left in: the panel opened by default on the phone,
  the score got 430pt and the column came out 105pt tall with "Piano" cut off
  halfway. `AppLayout.test.tsx` cannot catch that — it renders with no layout,
  so `useContainerSize` answers 0×0 and the rule never runs.
- **Mobile is no longer landscape-only — every orientation is supported.** It
  used to be locked to landscape (a system of music is wide), but a foldable
  like the iPhone Duo has a narrow portrait cover screen that the app must work
  on, so `Info.plist` lists all four orientations under **both**
  `UISupportedInterfaceOrientations` and `UISupportedInterfaceOrientations~ipad`
  and sets `UIRequiresFullScreen` **false**. The editor copes with the narrow
  width by **wrapping** its bars rather than relying on a wide screen: the
  editing bar (`EditorToolbar`) and the playback bar (`TransportBar`) are
  `flex-wrap` rows that break to a second (or third) line instead of scrolling
  or running off the edge. Because the width is no longer guaranteed, nothing
  should assume landscape. macOS is a desktop window and none of this applies
  to it.
- **A failed save must leave the document dirty.** music*lib's saver clears
  `dirty` only after a write succeeds \_and* the score written is still the one
  open; the reverse leaves a document that looks safe to close after the write
  failed. `documents/document.test.ts` pins it for this app's wiring.
- **A document from a newer format version is refused, not read hopefully.**
  A newer file may say something this build would drop, and losing half a score
  on the next save is worse than not opening it. The reader is music_codecs'
  `parseProjectFile` (through music_lib — this app may not import music_codecs
  directly), which also reads the web's JSON project export.
- **Every document store is built from `DocumentServices`, provided once.**
  The composition root (`App.tsx`) builds the server context (client, Firebase's
  `readIdToken` — module-level, because a store keeps the context it was built
  with for life and the scratch document exists before any provider), the file
  storage, the toast sink and an `onSaved` that feeds the recent list, and
  `DocumentsProvider` hands them down. Anything that makes a document —
  `newDocument`, `openFileInto`, `openProjectInto`, an import — takes them from
  `useDocumentServices()`. The old autosaver lived in the composition root where
  nothing below could reach it, so a document made from the File menu never
  saved itself.
- **`DocumentList` owns a document's lifetime, and its caret.** Opening attaches
  (the device-prefs mirror) and closing detaches and `dispose`s the store, so a
  closed tab keeps neither a subscription nor a debounce timer. A duplicate
  turned away by origin is disposed too. There is one playhead, and document
  stores are built with `resetPosition` false so opening one does not send the
  front tab's caret to bar 1 — the list banks the leaving tab's tick and
  restores the arriving one's (0 for a tab never in front), including when the
  front tab closes and the fallback takes its place. **It keeps each tab's
  scroll offset too**: the editor is a fresh component per document, so a tab
  brought back opened at the top, pages away from its restored caret.
  `ScrollingScore` banks its offset on unmount (`bankScroll`, ignored for a
  closed tab) and reopens at `scrollOffset` — or, for a tab never scrolled, at
  `ScoreCanvas.followTarget` for the caret — once per axis, when that scroll
  view's content is first laid out (earlier clamps to the top). Closing asks first through
  music_lib's `decideClose` over the store's `dirty`; leaving the foreground
  flushes every open document (`flushAll`), because a phone may kill a
  backgrounded app inside the debounce window.
- **Android's Back asks before it throws work away** (`UnsavedQuitGuard.tsx`).
  The editor is the stack's `initialRouteName`, so there is nothing to pop and
  Back finishes the activity — reproduced on a Pixel 9 Pro XL: two notes, title
  bar reads "Unsaved", Back, launcher, relaunch, empty score, no prompt. The
  `AppState` flush covers _backgrounding_, which a finished activity does not
  reliably reach. The decision is music_lib's `decideQuit` — the sibling of the
  `decideClose` a tab's × uses, which had no production caller at all — because
  Back at the root is a **quit** rather than a tab close and asks about every
  open document at once. Same guard module, same `ConfirmSheet`, same
  `document.unsaved*` copy: one rule and one dialog. Answering it calls
  `BackHandler.exitApp()` rather than dismissing and waiting for a second press.
  Registered through **`useFocusEffect`**, which is the whole of "do not hijack
  Back anywhere else": `BackHandler` subscriptions are global and run newest
  first, so one left registered while Settings or Docs is on top swallows the
  pop that should return to the editor. Sheets need no allowance — a React
  Native `Modal` is a dialog holding the window focus, so Android hands Back to
  its `onRequestClose` and these listeners never run.
- **An import becomes a server project when somebody is signed in** (decision 2
  of the parity plan), built from the create response rather than re-read. Signed
  out, or when the server cannot be reached, it is a local unsaved document; a
  server that answers and refuses (`ApiError`) is reported, not hidden.
- **A `.moo` is imported, not opened, because only macOS has a File menu.**
  `file.new`/`file.open` live on the menu bar, so a project file was a format
  iOS and Android could _write_ from the export sheet and then never read back.
  It is the fifth entry in the dashboard's Import menu now — reachable signed
  out, since a `.moo` is decoded on the device and needs no account — reading
  through music_lib's re-export of `parseProjectFile` rather than a call on
  `music_io`, because a project file is this app's own document and not a
  notation format. It is the one import that **keeps the name the file states**:
  `importedTitle` is right for a `.mid`, where the only names available are the
  score's and the file's, but a `.moo` carries the project name the reader gave
  it. Export needed nothing: `WRITABLE_EXPORT_FORMATS` already carries
  `project`/`moo` and `ExportSheet` lists the lot on every platform.
- **A file picker filtered on a bare extension filters on nothing** — silently,
  on both touch platforms, and this is a trap worth knowing before adding a
  format. `pickFile` used to pass `['.mid', '.midi']`. iOS builds its allowed
  list with `UTType(identifier)` and `compactMap`s the nils away, so `.mid` is
  not a UTI and simply vanishes; Android normalises each entry into
  `EXTRA_MIME_TYPES` and matches it against each document's real MIME type,
  where the literal `.mid` matches nothing. Either way the file the reader
  tapped Import for is the one greyed out, with nothing on screen saying why.
  `pickerTypes` asks the device instead, through the picker's own
  `isKnownType` (`UTType(filenameExtension:)` / `MimeTypeMap`), and **widens to
  `types.allFiles` the moment one extension has no name there**. That is `.moo`:
  registered nowhere, so there is nothing to filter on, and a list of its
  siblings alone would grey out the one file the menu entry exists to open.
- **Device prefs are one store; only pitch display is mirrored into documents.**
  Theme, language, pitch display, developer mode, the developer settings
  (`devSettings`) and keyboard-collapsed are music_lib's
  `createDevicePrefsStore` (`config/useDevicePrefs.ts`), loaded and saved by
  `bindDevicePrefs` at the composition root. Editing reads only pitch display
  off the document store (note entry inverts the written-pitch lens), so
  `mirrorDevicePrefs` copies that one in. **Document stores no longer hold the
  theme, developer mode or `devSettings` at all**: `ThemeContext` reads
  `themeMode` straight off `devicePrefs`. **There is no developer settings
  sheet here any more.** It drew six toggles — `showIds`, `showTicks`,
  `showMeasureBoundaries`, `showPlaybackScheduling`, `enableDiagnostics`,
  `enableValidationWarnings` — that no package in the family read, so every one
  of them did nothing; they are gone from `DevSettings` in music_types, and the
  one setting left (`generationVariant`) has no control in this app, so a sheet
  would open on nothing. Settings has no Developer row, and a test pins that.
  **A control writes the
  prefs store, never a document store** — the pitch-display chip writing the
  document store would change one tab, persist nothing and be overwritten by the
  next change. The keyboard starts **expanded** and remembers collapsing, as on
  the web. `language` null means "follow the device" (`languageFor`).
- **Toasts go to one queue, not into stores.** Every store is built with
  `context.toasts = appToasts` (`features/toasts/Toasts.tsx`), so an autosave
  failure, a failed generation job and an editing refusal — with the Undo a
  refused paste offers — reach `<Toasts>` whichever tab raised them. Before this
  the stores appended toasts to a list nothing read.
- **Library copy is music_lib's `createLibraryCopy`, installed at start-up.**
  `config/initialize.ts` exports `libraryCopy` (built from `i18next.t`, every
  entry read when used); the status strip and the MusicXML import read its
  `selection()` and `musicXmlWarnings()`. `i18n/lib-copy.ts`, the hand-written
  copy of the web's table, is deleted.
- **There is no in-editor Generate Score; there is Generate Again.** Whole-score
  generation is where a project starts (New Project); an open project whose
  score came from a generation shows `GenerationChoices` under the Score tab's
  fields, the web's panel: each choice with a lock, `regenerateWithLocks`
  building the request, `regenerateCreditEstimate` quoting it, and a confirm
  before the whole score is replaced.
- **Snapshots are music_client's `useProjectSnapshots`.** `SnapshotsSheet` binds
  it to the document (flush = `saveNow`, adopt = `adoptOutsideScore` after
  stopping, `noteServerVersion`); `SnapshotsPanel` only draws it. Nothing
  re-downloads the project after a create or an open.

- **The score-setup form draws music_lib's New Project draft.** `ScoreSetupFields` takes a `NewProjectFormDraft` and a `dispatch` over `reduceNewProjectDraft`; its tests build drafts through the reducer (fixed rng) and read the pickers' triggers, which print the chosen label — a native `Select`'s modal is not mounted in tests. Option lists come from `generationInstrumentOptionsFlat` and `labelledOptions` (with `NO_MARK`/`optionalToPicker`), tested upstream; rows are addressed by entry id and only style-essential rows lock.
- **New Project opens on a piano, and used to open on a drum kit.** The initial roster was `INSTRUMENT_OPTIONS[0]`, which was the first _kit_ — so native New Project started as a drum solo where the web one started on piano. It comes from `initialNewProjectDraft` now, which is what the web dialog uses.
- **The moods were rendered as their own raw values.** `bittersweet`, `upbeat` — labels written straight into the options with no key, which is the one class of missing translation `locale-parity` cannot see, since there is no key to be absent. They go through `moodLabelKey` (and complexity through `complexityLabelKey`) via `labelledOptions`, sorted by translated label. `generateScore.moodName.*` was missing from this app's locales entirely until the draft adoption — `keys-exist` cannot see a key built at runtime.
- **Turning the Generate toggle on gives the roster a singer**, through `setGenerating` in music_lib's reducer, which tracks the added voice by entry id (`autoVocalId`) and takes back only that one. Same rules as the web dialog, because they are the web dialog's code.
- **Replace and New Project defaults are music_lib's.** Replace opens on `defaultReplaceSubmission` (nothing preserved, moderate complexity, the default variant) with `REPLACE_PRESET_KEYS` translated under `replace.preset.<key>`; New Project sends `DEFAULT_GENERATION_VARIANT`. MIDI import number fields go through `parseNumericDraft` and `patchMidiImportOptions`, never `Number(text)` — a cleared field is not zero.

- **`useServerContext` hands the hooks a token _getter_ and the user id, never a token.** A captured token fails an hour into a session and read `null` for a signed-in user on the first render; `getToken` is awaited per request and `userId` decides synchronously whether a query may run. `siteAdmin` comes from music_client's `useSiteAdmin` over the same shape.
- **`publicServerContext()` exists so a public route does not drag in Firebase.** `useServerContext` reads the auth context, so importing it into a component pulls the whole auth stack into every test that renders it — which is how adding the preset picker broke two suites with "Cannot use import statement outside a module" from `firebase/app`. The presets route needs no identity, so it gets a context built straight from the network client with `token: null`, and `null` where there is no server at all.
- **The preset picker is the server's list and this app's words**, the same contract the web dialog uses: `GET /public/presets?style=` says which briefs, `generateScore.preset.<key>` says what they read, and `preset-contract.test.ts` proves every brief the server could send has a translation in both languages. Rendered only when a list has arrived — a local document with no server gets no control rather than one that opens empty.
- **`renderWithApp` mounts a `QueryClientProvider`, exactly as `App.tsx` does.** Without one, any component that reads server data throws "No QueryClient set", which takes the whole render down rather than leaving a value missing — so a component that merely _might_ ask the server breaks every test that renders it. Fresh client per render, retries off, no cache between tests.
- **The default title follows the Generate toggle** — "New Score" / "Generated Score" — as the placeholder and as the fallback, and it reaches the project name and the request rather than the draft, so a blank field still leaves the score's own metadata at "Untitled".

- **The lyric's subject sits under the Write-lyrics switch**, shown only while words are being written and blank-means-follow-the-prompt, exactly as the web dialog has it. `music_lib` drops it from the request unless the lyrics it describes were asked for, so neither app has to police it.

- **A playback frame re-renders nothing but what changed.** `useScoreCanvas` hands out the picture, the cursor description and the scroll offset as _signals_ (`createSignal`/`useSignal`), read by `ScoreView` and `PlaybackCursor` alone. They were state in `ScrollingScore`, so every change of lit notes re-rendered the whole score view — including `displayScore`'s scan of every note — measured at 7% of the JavaScript thread on a dense import, as much as half the painting it was only there to show. `ScrollingScore.test.tsx` pins that a new picture, cursor or scroll offset renders it zero times. The score reaches the canvas through `setStoredScore(score, pitchDisplay)`, which applies the lenses and the out-of-range scan once per score.
- **The notation paints in layers, and prepares the next window ahead.** The surface is `createSkiaLayeredPaint` from `music_drawing/skia`: a base `SkPicture` kept until anything but the lit notes changes, and a frame that replays it under the active track's notes, so a change of lit notes records one track rather than the window. Painting fell from 17% of the JavaScript thread to under 5% on the dense import. `prepare` builds the window following playback is about to scroll to, a column per task, so the system break does not also format it. See `music_drawing/docs/score-canvas.md`. **The page turn rides the cursor's own clock**: `ScoreCanvas.subscribeCursorSystem` announces a system crossing when the path swaps, and `bindPlaybackToCanvas` follows on that rather than waiting for the next 30Hz position report — the caret is placed in content coordinates, so a follow scroll that arrives late leaves it clipped outside the viewport, measured here at a median 66ms of invisibility per page turn (2.5% of playback) against 34ms after. `followTo`'s once-per-bar `followedMeasure` guard is what stops the report that arrives afterwards following the same bar twice. One artifact is left: the first path for a new system is interpolated across whole bars until that window's own paint records its note positions, so the caret hops 16–22px forward one frame after the turn.
- **The first Skia picture can be dropped, so it is sent again.** `Canvas` ships a picture from a layout effect through reanimated's UI runtime (`runOnUI` → `SkiaViewApi.setJsiProperty`), which lands on the main thread some time after the commit that created the view — and one that arrives before that view's drawing surface is ready is discarded with no error and nothing to re-send it. That only shows on a canvas painted **once**, which is every score that fits the viewport: measured on this react-native-macos build, the eight-bar starting score came back blank on about one tab activation in two, a long score never (it repaints while scrolling and recovers), and any second picture — a zoom, a resize — drew it correctly. `ScoreView.tsx` re-renders for `RESEND_FRAMES` frames after the first picture exists, because a new `Canvas` render is what re-sends it; two spare sends at mount and nothing after, so playback pays nothing. **`SkiaViewApi.requestRedraw` (`ref.current.redraw()`) cannot work here** and was the first attempt: it asks the view to present the picture it _holds_, and the whole problem is that it never received one.
- **The macOS navigator draws no stack header, so the body has to offer the way back.** Every screen but the editor is pushed with `headerShown: true`, and on this react-native-macos / react-native-screens build that header is not drawn at all — measured on the accessibility tree: Settings and Docs expose their content and no back control of any kind, to the pointer or to VoiceOver. A Mac has no swipe-back either, so a pushed screen was a one-way trip out of which the app had to be relaunched. `ScreenBackBar.macos.tsx` draws the control the header would have (guarded on `canGoBack`, since the editor is the stack's first route); `ScreenBackBar.tsx` renders `null` on iOS and Android, whose navigator has a real header and a gesture, and a second one in the body would duplicate it. Two neighbouring facts about this build. **`accessibilityRole="tab"`/`"tablist"` map to nothing in AppKit** and arrive as `AXUnknown`, an element VoiceOver cannot press — measured on the tree, with `tab` the inspector's four segments were unpressable — so `SegmentedTabs.macos.tsx` uses `button` plus `accessibilityState.selected` and gives the group no role at all. And that control is drawn **in-app** rather than by `@react-native-segmented-control`, whose JS drawing moves its selected pill with `Animated.timing({useNativeDriver: true})`: a native-driven animation never reaches a view on this build (the same thing that makes the playhead an `NSView` of its own), so the pill sat on whichever tab was selected at mount while the label styling followed the real one — the strip said Track over the Note panel, with an invisible label where Note should have been.
- **On Windows the score is a windows_canvas_rn picture, not SVG.** The
  shared renderer draws into that library's `PictureRecorder` (a canvas 2D
  context that records commands, `picture-layered-paint.ts`), and
  `ScoreView.windows` shows the base and the lit-notes overlay as two
  `CanvasPicture` views, each replayed natively in one Direct2D pass with
  DirectWrite text. It used to be an SVG string through react-native-svg,
  whose Windows renderer redrew its whole document once _per element_ changed
  and leaked a document per redraw: a page turn (every element's transform
  carries the scroll offset) was N redraws of N elements on the UI thread,
  each page slower than the last, and since RNW fires JS timers through the UI
  thread the player's pump starved and the audio broke up. It also drew no
  text at all — `RNSVGText` is registered as unsupported there — and painted a
  white background under the dark theme's light notation. react-native-svg is
  still patched for both bugs (`patches/README.md`), since icons use it.
  `svg-context.ts` remains for **printing** only: WebView2 prints SVG, text
  included, onto white paper. Native code: the package's `windows/WindowsCanvas.targets`,
  imported by `MoosiacRN.vcxproj` (preferring a sibling `../windows_canvas_rn`
  checkout), registered in `MoosiacRN.cpp`. Four things on this side go with
  it: `useScoreCanvas.windows.ts`'s `scrollTo` tells the canvas and the scroll
  signal at once rather than waiting for RNW's `onScroll` (until then the
  cursor sat on the new system's path against the old offset, and the old page
  stayed painted); the surface reports `presentLatencyMs` from the time
  `ScoreView.windows` takes to commit a frame, since `paint` there only records
  commands and the lit notes were published that much too late; the
  look-ahead (`prepare`) is on again; and `installWindowsAnimationFrames`
  serves every frame request with one timer aimed at a 60Hz grid — a fixed
  `setTimeout(16.7)` lands on the second ~15.6ms system tick, a 32fps cursor.
- **On Windows the Spatial stage is drawn on the GPU, in 3D, by
  windows_canvas_rn's `LineScene`** — Direct3D 11 on the device the
  Composition surfaces already use, with a depth buffer, multisampling and
  linear fog. music_spatial_rn's `SpatialCanvas.windows.tsx` hands it what the
  web hands three.js (each model's geometry and world transform, the camera's
  view matrix) instead of projecting in JavaScript. The view was turned off on
  Windows (`spatial/availability.ts`, a `null` `SpatialSection.windows.tsx`)
  while the only Windows canvas was react-native-svg; both are deleted, and
  the transport's 3D toggle shows on every platform. `LineScene` is registered
  by `RegisterWindowsCanvas`, so the app project needed nothing new.
  gesture-handler runs no gestures on Windows, so the stage drag and the
  map's marker drags both go through the responder system there
  (music_spatial_rn's `usePointerDrag`) rather than `Gesture.Pan`. The native
  view is as uncompiled as the rest of the Windows code.
- **A legacy native view's colour prop must be processed by hand when it is declared `NSColor`.** React Native runs `processColor` only for props a view manager declares `UIColor`; `@moosiac/playhead` declares `lineColor` as `NSColor`, so the theme's CSS string reached AppKit as a string, converted to nil, and the caret drew transparent — invisible on the Mac from the day it began taking the theme's colour, with no error anywhere. The package's `index.js` now wraps the native component and processes the colour. Found by drawing a plain `View` at the cursor's props (visible) beside the native view (not).
- **The keyboard is sized like the web's, from music_drawing.** `AppLayout` measures the score area and hands `KeyboardPanel` a `height` of `keyboardPanelHeight(score + keyboard as drawn)` — half the room they share, up to 160 — so on a short screen the two are the same height. White keys are `WHITE_KEY_WIDTH` (44): the panel is a horizontal `ScrollView` that centres a keyboard narrower than itself and opens a wider one at `keyboardScrollStart`. **A drag scrolls only from the strip under the keys** (`labelGutter`, which includes music_drawing's `KEYBOARD_SCROLL_STRIP`), through a `PanResponder` that calls `scrollTo`: a finger on the keys plays them, so on iOS and Android the `ScrollView`'s own dragging is off (`scrollEnabled` only on macOS/Windows, which keep trackpad and wheel scrolling), and on a desktop the strip is what a mouse drags. The drag has momentum and bounces at the ends — music_drawing's `KineticScroller`, shared by both apps — with overscroll drawn as a shift of the content, and the platform scrollbar is hidden for a 3px indicator (`keyboardScrollIndicator`).
- **The keyboard ignores notes it does not show.** The player reports every track's sounding notes; `KeyboardPanel` compares the active track's lit keys with `samePitchSet` (music*drawing, shared with the web keyboard) against a ref \_before* `setSounding` — an updater that returns the previous set still renders to find that out. Keys come from music_drawing's `keyboardKeys` (`fit: 'width'`) and fills from `keyboardKeyFill`; what is lit is music_drawing's `litKeys` (from `playingPitchesForTrack`; sounding only while playing, plus held keys). A pressed key auditions through music_types' `auditionVoiceFor(track)` — program and percussion flag together, a stray kit address resolved as playback resolves it.
- **Every pressable control needs `onAccessibilityTap`, and on a Mac that is the _only_ way in.** There is no synthesized-touch fallback on this build: an assistive activation arrives as `onAccessibilityTap` and never as `onPress`, so a control wired to the press handlers alone can be focused, read out, and never fire. Withheld while the control is disabled (`{...(disabled ? {} : { onAccessibilityTap: handler })}`), because `disabled` stops the press pair and would leave this the one way past the refusal. The piano keys were the sharp case and the one a press pair cannot express: they are press-and-hold, and the note's length comes from the held time — an activation has none, so it hands `playKeyGroup` a `heldMs` of **null** and the note is written at the toolbar's own note value. Everything else about it is the ordinary gesture's code — the same compass refusal, the same audition, the same `playKeyGroup` — because a second write path would be a second copy of the caret advance, the chord toggle and the edit lock. The audition alone needs a timer (`TAP_AUDITION_MS`): there is no moment the finger lifts, and switching the note off in the instant it started is a key that says its name and makes no sound.
- **A CTA that starts a wait spins through it, and cannot be pressed twice.**
  The user's rule: whatever a control starts that somebody has to wait for —
  a network call, a file chosen and decoded, a job posted, an audio render —
  the control _itself_ becomes a spinner until it settles, and a second press
  meanwhile does nothing. Use the component's own loading support
  (`Button`'s `loading`, a `FormModal` action's `loading`, `FieldRow`'s
  `actionLoading`, `IconButton`'s and `PressableCard`'s `loading`,
  `ConfirmSheet`'s `busy`) and track it with `usePendingAction`
  (`components/controls`), which sets the flag before the await, clears it in
  `finally`, and refuses re-entry with a **ref** — two taps inside one frame
  both read the state from before the first, so a state-only guard submits
  twice. A sheet whose CTA starts the work **stays up**, its other ways out
  refused (`saving` on `FormModal`, and `onClose` ignored, since Android's
  Back reaches it regardless), until the work is done; then it closes. The one
  exception is Export: its sheet closes first because the share sheet or the
  hidden-tracks question follows it and neither can be raised over a sheet
  still dismissing, so the title bar's Export button spins instead. Loading
  implies disabled, so `onAccessibilityTap` is withheld with it.
- **Navigation is two arrangements of one set of routes, and `hasTabBar()` is the one test** (`src/app/tab-bar.ts`). On iOS and Android Projects, Community, Docs, Resources and Settings are bottom tabs (`MainTabs.tsx`), the app opens on them, and everything else is pushed _above_ the tab navigator — which is the whole of how an open project gets the full screen: a pushed screen covers the tab bar, so nothing hides it and nothing has to remember to show it again. On macOS and Windows there is no tab bar; the menu bar and the separate Projects window carry the same destinations and the app still opens on the editor. The route names are identical either way (`Dashboard` is Projects), so a screen inside the tabs navigates to a sibling by name under both. **From beside the tabs — the editor, the menu commands — use `goToTab`, never `navigate('Main', …)`**: React Navigation 7's `navigate` no longer goes back to a route already in the stack, so it would push a second copy of the tabs over the first; `goToTab` dispatches `popTo`. `sudojo_app_rn` is where the tab arrangement came from, but two things here have no counterpart there: it never hides its tab bar, and its master pane never collapses.
- **The tab bar is the system's, through `react-native-bottom-tabs`, as sudojo_app_rn and the rest of the family use.** `MainTabs` uses `createNativeBottomTabNavigator` from **`@bottom-tabs/react-navigation`** (`react-native-bottom-tabs`, both pinned `1.5.0`), which hands the tabs to a real `UITabBarController` on iOS — Liquid Glass on the iOS 26 SDK — and a Material bar on Android. It used to be `@react-navigation/bottom-tabs/unstable`, whose native tabs are react-native-screens' `RNSTabBarController`: under React Native 0.83 that aborts on the first mount with `[RNScreens] Expected exactly 1 focused tab` (`assertExactlyOneFocusedTab`, a debug-only invariant that fires before the app draws), which was the launch crash the migration fixed. `sidebarAdaptable={false}` keeps the bar at the bottom everywhere (on the iPhone Duo's compact-wide screen the sidebar style moves it to a trailing strip); `labeled` keeps every label on (Android otherwise shows only the chosen tab's once there are more than three). The package declares a macOS slice (`s.osx`), so `react-native.config.js` switches it off for macOS and Windows, which resolve `MainTabs.macos.tsx`/`.windows.tsx` instead. A system bar takes a platform image rather than a React view: SF Symbols on iOS (`person.2` for Community — the narrower family glyph, not the wide `person.3`), and `android/app/src/main/res/drawable/ic_tab_*.xml` on Android (the heroicon outlines as vector drawables).
- **One bar per row: where the tab bar is along the top it is overlaid on the tabs' own native bar, and where it is along the bottom each screen draws a titled bar of its own.** `MainTabs` shows the native header only under `hasTopTabBar()` (an iPad from iPadOS 18), with a blank title, since the tab bar floats across that row and names the screen; a split view's panels and a whole screen (`TitledScreen`: Community, Resources) then draw no bar (`hasPanelBar()` is false) and the detail is headed in its content, as on a desktop. Under a bottom tab bar (Android, an iPhone) the native header is off — it drew a blank 48dp strip on Android — and both of a split view's bars are titled, the list's with what it lists and the detail's with what was chosen, as is a whole screen's. Android's bar is 48 on a phone and 64 on a tablet; **a phone's status bar is hidden** (`ThemedStatusBar`), and because Android goes on reporting its inset, `TopClearance` clears no top edge on a phone. The native `SafeAreaView`, not the hook: the hook's inset reaches below an iPad's floating tab bar.
- **Master/detail is the shared library's `MasterDetailLayout`, which this app's `SplitViewContainer` adapts** (`SplitViewContainer.tsx`). The whole RN family shares that one component now: two columns when wide, and on a narrow phone it drills in — a row press **pushes** the detail on a real `@react-navigation/native-stack` (the platform's own slide and back-swipe), not an in-component swap. Projects, Docs and Settings each put a 320-point list beside a detail, and each panel is a navigation tree of its own (`NavigationIndependentTree`) with its own bar — the list titled with what it lists, the detail with what was chosen. Projects is one component in two places (`ProjectsSplitView`: the desktop Projects window and the Projects tab; what happens once a project is open is the caller's, `onProjectOpened`). The wide-vs-narrow choice is `MasterDetailLayout`'s own `onLayout` measurement, never `useWindowDimensions()` (which this app must never size from): a split view opts into collapsing with `collapsible` (a breakpoint of 0 keeps a desktop window and the editor's Projects popup two columns). `useMasterDetail()` gives the list `showDetail()` (the push, inert when wide) and the detail its back (`showMaster`); `SplitViewContainer`'s `DetailChrome` clears the pane's own right notch when drilled in and lets the two columns pad it when beside the list. **Inside a panel `useNavigation()` answers the panel's navigator, which has one screen**, so whatever leaves the split view is handed down: Docs and Settings take `navigation` and `route` as props rather than from hooks, and their tests render the real trees instead of stubbing `@react-navigation/native`. **The panels use the plain JS stack on every platform, and an iPad is why**: a native bar is laid out against the window, so under the iPad's floating tab bar each panel's bar stretched to twice its height and the list's title was not drawn at all. **The detail's bar is untitled under that tab bar** (`hasTopTabBar()`): the bar floats across the middle of the same row, the list's title shows beside it and the detail's would sit underneath it. `MasterDetailLayout` was rebuilt for this — measured by `onLayout`, wrapping neither pane in a `ScrollView` (a pane holding a `FlatList` could not sit in one), and loading `@react-navigation` **lazily** inside its narrow branch so the library's barrel never forces a navigator on a consumer (importing it, or rendering the wide layout, pulls in no stack). The panels keep drawing their own red `PanelBar`, so the component's stack draws no header (`headerShown={false}`). **Every detail pane brings its own scrolling** — `ScreenScaffold`, or a list — because `SplitPanel` cannot supply it: half of what it holds virtualize, and a list inside a scroll view draws nothing. `split-detail-scrolls.test.ts` reads each split view for what it puts in its detail panel and refuses a pane with no scroller. A pane that is also a pushable screen (Credits, sign-in inside Settings) is wrapped in `EmbeddedScreen`. **A list — anything that does not scroll sideways — clears the left/right safe area it meets** (`ScreenScaffold`, the split view's menu `FlatList`, `ProjectTiles`): its content is padded by the inset so it does not run under the notch, while the scroll view itself stays full-width. The exception is a pane shown *beside* another, where the split view has already cleared the sides (the container widens the list panel for a left cutout and pads the detail for a right one) — so `EmbeddedScreen` carries **`sidesHandled`**, true then and **false when the split view is collapsed and the pane is drawn full-width**, so the pane clears its own sides exactly as a standalone screen does. `embedded` (the back bar stands down) and `sidesHandled` are two separate facts: a collapsed pane is embedded but handles its own sides.
- **In the editor the Projects sidebar is a popup, drawn in the editor's own tree** (`ProjectsPopup.tsx`, opened from the header's leading button beside the back control). Not a `Modal`: a `Modal` is a second native window with its own supported orientations, and this app is landscape-only. Choosing an item leaves for the Projects tab with that pane showing, carried as `{ pane, at }` — `at` tells one request from the next, since asking for the same pane twice is two requests.
- **Under a tab bar one project is open at a time, and it outlives the editor.** `DocumentList`'s `single` (set from `hasTabBar()` in `appState.ts`) closes whatever was open when another document opens, so the editor there has no tab strip (`AppLayout` leaves `DocumentTabs` out) and no second document sitting unseen behind the first; a desktop build still holds several. The list closes without asking, as `close` always has, so every way of opening a document on those platforms goes through `useSingleDocumentGuard`: it **saves first and asks second** — a document with a file or a project to live in is written, and only work with nowhere to go is asked about, with `decideQuit` and the `ConfirmSheet` that Android's Back uses. Import is guarded _before_ the file picker, since "no" after somebody has found their file is the question asked too late. Three things follow from the editor being a screen above the tabs. The scratch "Untitled" document is not made at launch there, since the app opens on Projects. The Projects list gains **Open project** while one is open, because an unsaved document behind the tabs had no other way back. And `UnsavedQuitGuard` is mounted on the tabs rather than in the editor, with `backBehavior="none"`: Back in the editor pops to the tabs, and the tabs are where Back finishes the activity. `AppLayout` also leaves the top inset to the navigator where it draws the header (`hasNativeHeader()`); clearing the status bar twice left an empty band under the header.
- **Google and Apple sign-in borrow the native modules for a token and nothing else — and the how lives in `@sudobility/auth_lib/signin`, not here.** This app runs Firebase's JS SDK everywhere because the China proxy is a `fetch` wrapper the native SDKs never pass through; `sudojo_app_rn` still runs `@react-native-firebase` on mobile. `AuthContext` supplies only what is this app's — the `.env` values as a `SignInConfig`, `Platform.OS`, and the native modules as lazily `require`d bridges — and auth*lib's `googleSignInAvailable`/`appleSignInAvailable`/`googleCredential`/`appleCredential`/`createFirebaseJsAuth` do the rest (the desktops through `WebAuth`, which has no iOS or Android half, and are offered no Apple). Jest cannot read auth_lib's `exports` map, so `jest.config.cjs` maps `@sudobility/auth_lib/(oauth|signin)` to the dist files by path. **Both modules are `require`d inside the function that uses them, never `import()`ed**: Metro answers a dynamic import by fetching a second bundle when the button is pressed, which failed here with "Could not load bundle" on the sign-in screen. **`pod install` needs `GoogleUtilities` and `RecaptchaInterop` as modular headers** (`ios/Podfile`), or it refuses the whole install — and a refused install leaves the old Pods in place, so the app still builds and the new modules are simply not in it; check `Pods/Manifest.lock` for the module rather than trusting a green build. What each platform needs is in `.env.example`, grouped by platform. **`.env` is everything JavaScript reads**; `GoogleService-Info.plist` (in the Xcode target — it was on disk but not in the target for a long time, so nothing native ever saw it) and `google-services.json` (via the google-services Gradle plugin) configure **native Firebase only**: analytics, crashlytics and messaging on iOS and Android, started by `config/native-firebase.{ios,android}.ts` through `di_rn`'s `initializeRNApp` from `index.js`, with a desktop no-op. The Google sign-in module is always given `iosClientId` so it never reads the plist either. iOS and the desktops take the iOS-type client (`GOOGLE_OAUTH_CLIENT_ID_MACOS`; its reversed form is \_derived* by auth_lib's `reversedGoogleClientId` rather than configured), Android the web-type client, and Android's Apple button a Services ID and redirect. The one value that cannot come from `.env` is iOS's Google URL scheme, hard-coded in `Info.plist`; `constants.test.tsx` checks it against the checkout's `.env`. iOS pods: Firebase is kept on CocoaPods (`$RNFirebaseDisableSPM`) with every pod a **static framework**, the same arrangement as sudojo_app_rn, because the prebuilt React core cannot link dynamic pods. A way that is not configured shows no button (`googleSignInAvailable`, `appleSignInAvailable`).
- **The Mac app is sandboxed, as the Mac App Store requires** (ITMS-90296 rejected build 1.0.1 (17) without it). `CODE_SIGN_ENTITLEMENTS` points at `macos/music_app_rn-macOS/music_app_rn.entitlements`: App Sandbox, network client, user-selected files read-write, and printing (`com.apple.security.print`; a sandboxed `NSPrintOperation` needs it). The same build also lacked `LSApplicationCategoryType` (ITMS-90242); the Mac `Info.plist` declares `public.app-category.music`. Under the sandbox the app's own files live in `~/Library/Containers/com.sudobility.moosiac/`. **Known gap:** recent documents are stored as plain paths, so a file the user opened from elsewhere opens fine in that session but is refused from Recents after a relaunch; reopening it needs a security-scoped bookmark saved by the file picker, which `@moosiac/file-picker` does not do yet.
- **iOS plays through the native synthesizer, on a FluidSynth built here.** `createPlayer` hands `FluidR3Mono_GM.sf3` to `NativeSynthBackend` on macOS, Windows and iOS; Android has no native module and takes the MP3 sample engine. iOS was on the sample engine too, and it is why the first Play took so long: every instrument's pack was read, parsed and its 88 clips decoded in JavaScript when Play was pressed (measured in Hermes: ~1.7 s of blocking JS per pack for the read alone). The native module was already linked — it could not load the font, because **the XCFramework FluidSynth publishes is built with `-Denable-libsndfile=OFF`** (its own `contrib/ios_build.sh`) and SF3 is Ogg Vorbis. `native/synth/scripts/build-fluidsynth-apple.sh` builds the same framework with libsndfile in it, for iOS (device and simulator) and macOS (universal); macOS used to link Homebrew's libfluidsynth, which built only on a Mac that had it — Xcode Cloud's archive failed with "'fluidsynth.h' file not found", Homebrew's arm64-only copy left no Intel slice, and the shipped app would have looked for it under `/opt/homebrew`. Three things that script learned the hard way. **libsndfile's Xiph codecs are one switch**: without FLAC and Opus present it turns Vorbis off too, so all four are built though only Vorbis is wanted. **FluidSynth has to find libsndfile by its installed CMake config** (`CMAKE_FIND_PACKAGE_PREFER_CONFIG`): its fallback finder found the library, printed "Support for SF3 files: no", and left FLAC and Opus off the link line. **pkg-config answers for the Mac**, and offered Homebrew's macOS libsndfile to an iPad build until `PKG_CONFIG_LIBDIR` was pointed at the prefix. Measured in the simulator with a test program: the official framework fails `fluid_synth_sfload` on the bundled font, this one loads it in ~3.3 s and renders a note. **Replacing the framework is not enough to change the app**: `@moosiac/synth` is a `file:` dependency, so CocoaPods reads the copy in `node_modules` and Xcode keeps another in DerivedData — two rebuilds "succeeded" with the old binary still inside the app. The script prints the three commands; verify with `nm` on the binary inside the built `.app`.
- **Signing in is a page where somebody goes to do it, and a modal where it interrupts something else — the web's rule.** The form is the family's: components-rn's `LoginView` (email and password, creating an account, a forgotten password, Google, Apple), in one of two shells, and `features/account/useSignInForm.ts` supplies both with the same handlers (analytics included), providers (`googleAvailable`/`appleAvailable`), words and Apple-mark tone. **`SignInPage`** is building*blocks_rn's `LoginPage` — app name, a heading that follows the mode, its own scroller and keyboard avoidance — and is used where a reader \_navigates in order to* sign in: Settings' Account pane and the Projects window's Connect pane, both signed out. **`SignInModal`** is components-rn's `LoginModal`, opened by `SignInRequired` over a screen whose job is something else and which has nothing to show without an account — the project list, Credits — and signing in closes it and leaves the reader on that screen, which re-renders signed in. **It opens by itself once, on arrival**, as in the family's other apps (state initialised open at mount, not an effect, so a re-render does not reopen it); closing it leaves the prompt and its Sign in button in place, so backing out is not a dead end. A closed Google or Apple sheet _rejects_ (`auth/user-cancelled`, auth_lib 0.0.105+) and `LoginView` stays open with no error; `useSignInForm`'s `tracked` rethrows it without recording an error or `login_success`. Never send somebody to a route to sign in from such a place: there is no `SignIn` route any more, and `SignInScreen`/`SignInView` are deleted. "Forgot password?" is the context's `sendPasswordResetEmail` (the same Firebase JS SDK it signs in with). The footer is split as on the web — `auth.alreadyHaveAccount`/`auth.dontHaveAccount` are the question only, and the link after it is `nav.signIn`/`auth.signUp`. Inside a split pane `SignInPage` clears no edges (the split view has); a page of its own would clear the sides and bottom the one rule names.
- **Settings lists the account first, and what it lists depends on who is signed in** (`settingsSectionsFor`). Signed out: Account — which is then the sign-in page (`SignInPage`) — Appearance, and the legal pages. Signed in: Account, Credits, Credit history, API keys, Manage coupons (site administrators), Appearance, then **Privacy Policy and Terms of Service** last — redeeming a coupon is a form on the Credits screen, under the balance it changes, not an entry of its own; the web dashboard's order, with the device's one section last. **The legal pages are offered signed out too** (`FOR_EVERYONE`): a privacy policy and terms need no account to read. The web app has neither page, so there is nothing to mirror — the wording is this app's own (following `sudojo_app_rn`'s, music-adapted), lives in the locales (`privacy.*`/`terms.*`, held level by `locale-parity`), and is drawn by `LegalSection` with this app's own themed components, **not** building_blocks_rn's `AppTextScreen`, which reads a theme context this app never mounts and throws. The account's sections talk to the server through `ConsumablesApiClient` and `EntityClient` directly (`useAccountClients`), as the balance always has: `consumables_client`'s hooks read a store only a purchase adapter initialises, and `entity_client`'s `useCurrentEntity` reads `localStorage`. **Every request they make has its trailing slash taken off** (`withoutTrailingSlash`): `ConsumablesApiClient` builds addresses with `new URL(…).toString()`, React Native's `URL` answers `…/balance/` where a browser's answers `…/balance`, and the server routes only the second — so every credits request this app had ever made was a 404 (44 of 44 in the API's log) and the balance read "—". API keys are the **personal** workspace's, since this app has no workspace picker. Score and About are gone from the list — written pitch is on the editing bar, and the build is stated at the foot of Appearance, which is now the only place it shows.
- **The profile picture is prepared on the device** (`useAvatarPicker`): chosen through the document picker — the app carries no image picker and asks for no photo permission — then cropped square and reduced to 256px with Skia, because the server keeps pictures in Postgres and refuses anything over `AVATAR_MAX_BYTES`. Skia is `require`d when a picture is chosen, since the Windows build has none.
- **Keyboard shortcuts are a sheet, not a screen** (`ShortcutsSheet`), opened from the project view's title bar ("?", as on the web) and from the Docs topic. The `Shortcuts` route and its Settings section are gone. The rows are drawn outright rather than by a `SectionList`, which measures nothing inside a sheet that already scrolls.
- **A field and the button that acts on it are one height, stated** (`FieldRow`). The library draws an `Input` at 33 points and a `Button` at 44, and side by side that reads as two neighbours rather than one form. Both are drawn at `MIN_TOUCH_TARGET`, as a style rather than a class, since which of two heights wins a `className` merge is not visible from the caller. Use it wherever a field has an action beside it; the coupon, nickname and API-key forms do.
- **Colours and controls come from the design system, and `design-system.test.ts` scans for the ones that do not.** No hex literal, no Tailwind palette class (`text-amber-700`, `bg-black/30`), no CSS colour name on a colour prop, no `Text`/`TextInput`/`Switch` from `react-native`, and no `Pressable` outside the app's wrappers — each with an allow list that gives a reason per file and fails when an entry is no longer needed. What it was written after: a document tab strip in zinc literals that stayed a light band across a dark editor, title-bar glyphs in `color="white"` beside a title in `text-primary-foreground` (black in dark mode), and a save-state pill whose `text-warning` sat on the `View` — a `Text` inherits no colour from the view around it, so the words were drawn in `foreground` on the bar's red at 3.6:1. A value that must be passed (an SVG glyph, a navigator header) comes from `useNotationInk()`. **A row the library's `Select` sits in cannot be given a height from outside**: its trigger is wrapped in a bare `View`, so `h-full` has nothing to fill; `FieldSlot` (beside `FieldRow`) states the height for a field and buttons only.
- **A documentation topic about the interface opens with a figure of the element it is about, captured from this app.** `src/features/docs/figures.ts` is a `Record` over `DOCS_TOPIC_IDS` — a new topic fails to compile until somebody decides whether it gets a picture, and `null` is that decision (the reference topics are live tables; `sharing` has none because a snapshot needs a server project and the figures are captured from a local document). The files are in `assets/docs/figures/`, twice the stated size in pixels, and `figure-assets.ts` holds the `require`s apart from the table so a test with no bundler can read it; `figures.test.ts` holds table, asset list and files to each other. The words under a figure are `docs.<topic>.figure`, the same in both apps (`docs-parity.test.ts`), so they name the element and not the app. **The frame has the size and the image fills it** (`DocsFigure.tsx`): `width`/`maxWidth`/`aspectRatio` on the `Image` itself drew it at the file's pixel size, wider than the pane. There is no capture script here as there is on the web — the simulator has no tap tool — so a figure is retaken by starting the app in the state wanted, `xcrun simctl io <udid> screenshot`, and cropping to the element.
- **Controls that share a row share a height, and a `Select` is given it as a class.** `FieldRow` draws a field and its button; `FieldSlot` with `SLOT_FIELD_CLASS`/`SLOT_BUTTON_CLASS` is for the rows it cannot (a draft committed on blur, a button after a picker). A `Select` takes `SLOT_SELECT_CLASS` instead, because the library wraps its trigger in a view of its own and `h-full` has nothing to fill — it replaces the trigger's `min-h-[36px]`, which is only a class (and so replaceable) since components-rn stopped stating it as `style`. It is two whole literals chosen by platform, `MIN_TOUCH_TARGET` being 48 on Android; `field-row.test.ts` holds them to the constant. The inspector's time signature (field / picker) and the New Project instrument rows (picker, remove button) were the two rows still mixing 33, 36 and 32 points.
- **A profile picture is chosen from the photo library on a phone or tablet, and from a file on a desktop** (`useAvatarPicker.ts`, `hasPhotoLibrary`). The file chooser opens on Files, where a phone keeps no pictures. `react-native-image-picker`'s `launchImageLibrary` presents the system's own picker — `PHPickerViewController` on iOS, the Photo Picker on Android — which runs outside the app and hands back only what was chosen, so **no photo permission is asked for at run time**; do not add `READ_MEDIA_IMAGES` for it. `NSPhotoLibraryUsageDescription` _is_ declared, and must stay: App Store Connect scans the binary for code that can reach the photo library, finds it in the picker module, and rejects the upload without the key (ITMS-90683, build 1.0.1 (4)) whether or not the app ever asks. Declaring it shows no prompt. `NSMicrophoneUsageDescription` is there for the same reason: `react-native-audio-api` bundles an iOS recorder this app never starts, and its string says so. Never call `launchCamera` without adding the camera permission first. The module is iOS and Android only and is `require`d inside `pickPicturePath`, never imported; it needs no `react-native.config.js` entry, since its podspec is `:ios` and it ships no Windows code. It is a native module: adding it needs `pod install` and a rebuild, not a reload.
- **The reader's projects are tiles in a grid, with Duplicate and Delete on each** (`features/projects/ProjectTiles.tsx`), in My Projects and on the desktop dashboard alike — the web's Projects page. **How many across comes from the pane's own measured width** (`onLayout` → `tileGrid`), never the window's: the pane shares the window with a list on a tablet and is all of it on a phone. One column until measured; every tile the same width, the last row included; and the `FlatList` is keyed by its column count, since one cannot change how many it has. The actions are `PressableCard`'s `footer`, inside the card's frame and **outside its pressable part** — a button inside a button is one a screen reader cannot reach, and Delete must not also open the project. Delete asks first (`ConfirmSheet`) and **closes the project if it was the one open**; Duplicate copies on the server (`useDuplicateProject`) and opens nothing.
- **Every format on Import opens the file picker, audio included.** `AudioImportSheet` used to answer with "sign in" or "not available" _instead of_ the picker where a recording could not be sent, which read as the one format that was broken. It opens the picker whatever the answer will be, and says why not once a recording has been chosen; nothing is uploaded before that, so nothing is wasted but a choice.
- **Android's tab icons are PNGs, and its labels are forced on.** The native tab bar takes an `image` icon through React Native's image loader, which reads bitmaps: handed the _name_ of a vector drawable (`{ uri: 'ic_tab_docs' }`) it draws nothing and says nothing. And with more than three tabs Android shows a label only for the chosen one. Together that was a tab bar of five where four were invisible — found the first time the app was run on an Android tablet. The icons are `assets/tab-icons/*.png` at 1x/2x/3x, rendered from the vector drawables by `scripts/make-tab-icons.mjs` (re-run it after changing one), and `tabBarLabelVisibilityMode: 'labeled'` is set for the whole navigator. The status bar's ink is stated too (`ThemedStatusBar` in `App.tsx`): the default drew a light clock on the light background.
- **Building for Android here:** `JAVA_HOME` is Homebrew's `openjdk@17` (there is no system Java, so `java` alone fails; `android/gradle.properties` already names it for Gradle), the emulators are `Pixel_Tablet` and `Pixel_10_Phone`, and the device needs `adb reverse tcp:8091 tcp:8091` for Metro and `tcp:8032` for the API. The first launch takes ~40 s to bundle and shows the launcher meanwhile.
- **Which edges a screen clears is one rule, `useSafeEdges()` (`src/platform/safe-edges.ts`), and every screen reads it.** `{top, bottom, left, right}`: the pure `safeEdgesFor(formFactor, notch)` in `safe-edges-rule.ts` (type-only imports, so vitest can read it) still answers a desktop nothing, a tablet its top and bottom, and a phone the notch's side; but **the hook now widens that to whatever iOS actually insets**. The notch heuristic (`useNotchPosition`, native on iOS) does not know every device — on the iPhone Duo's folded cover screen it returns `null` while the real right inset is 84pt and the bottom is 34pt — so `useSafeEdges` ORs the rule's answer with `useSafeAreaInsets()`: an edge iOS insets is cleared whether or not the heuristic saw it, which is what keeps the bars and the score off the cutout and the home indicator there. This only *adds* clearing, so the far side of a phone that iOS leaves at zero stays at the edge as before. The status bar is shown on every device now (`ThemedStatusBar`), the app no longer being landscape-only. A `SafeAreaView` asks `useSafeEdgeList(among)` for the edges it is responsible for among those the rule names (a bar answers for the sides, a root for the top); a padding computed by hand checks `edges.left`/`edges.right` before adding an inset. **Two exceptions, both about a native bar having cleared the top already**: `AppLayout` asks for no top edge under a native header, and the split view's `TopClearance` asks for none under an iPad's top tab bar — clearing it again put a band of nothing between the tabs and the panels that Community, with no panels, never had. **Sheets follow the rule too, through components-rn**: `AppSafeEdges` (at the root of each window) hands `useSafeEdgeList` to the library's `SafeAreaEdgesProvider`, and every library surface that pads for insets — `FormModal`, `Select`'s picker, `SheetSelector`, `Sheet`, `Dialog` — reads it (`useSurfaceInsets`/`useSafeAreaEdges`); context crosses a native `Modal`. Without it a phone's full-screen sheet padded all four insets, and Print on a landscape Android phone had a band where the hidden status bar would be. App overlays drawn by hand (`Toasts`) check `edges` like any other padding. `safe-edges.windows.ts` answers none without the hooks that platform cannot load; tests stand the hook in with `safeEdgesFor(...)` for the device they mean, never mock `useNavigation`, and never re-derive the rule. **A tab screen reaches the app's navigator only from outside its own bar**: `TitledScreen` draws that bar with a navigator of its own, so a screen takes the app's navigator as a prop from its navigator, as Docs, Settings and Community do. **On iOS the tab screens run to the bottom edge under the floating tab bar**; only Android, whose bar is opaque, keeps a screen above it (`SCREEN_LAYOUT` in `MainTabs`).
- **The Play button's spinner is the player's readiness, not the store's `synthLoad`** — the same music_player hook the web uses (`usePlaybackReadiness(getMusicPlayerIfInitialized())`), which starts the engine's bring-up the moment the button is on screen and shows a spinner, labelled "Preparing instruments", until it is up. `installTestAppServices` registers its player in the singleton too (last one wins there, where in the app the first does), and a fake player in a test carries `readiness` and `prepare`; `loadingPlayer` in `TransportBar.test.tsx` moves its readiness with what it emits, as the real player does.
- **Metro reads `@sudobility/components-rn` from its `src/`, not its `dist/`** — the package's `react-native` field points there. A locally built copy has to have its `src/` synced into `node_modules` as well, or the app goes on running the published component while the tests, which read `dist`, pass against the new one.
- **The track-info column is the whole thing or the instrument icons alone, switched by one toolbar control, and only the full one gives way to the inspector.** The pref (`trackInfo`, a device pref) still holds any of music_types' `TRACK_INFO_MODES`, `hidden` included, but the toolbar offers a single switch between `full` and `icon` — its label naming what tapping does, as the pitch switch beside it — since three buttons for a width was two too many. `trackInfoShown` in `AppLayout.tsx` then decides what is drawn: on a touch device the **full** column is still traded for the inspector, but the icon-only column stays beside it — it is 40 points, and it was the full column's 220 the trade was decided against. `ScrollingScore` takes `trackInfo`, not `showTrackInfo`. **A published score always draws the icons alone**, and beneath it the editor's own `TransportBar` whole — position, loop, metronome, speed, volume — in `readOnly`, which turns the tempo into a readout because it is the one control on the bar that edits the score; it plays that screen's own store through its own binding, the web page's arrangement.

- **Store screenshots are driven by links, in a debug build only.**
  `app_store/scripts/capture.sh` opens `moosiac:///<lang><path>` for each
  entry of `app_store/paths.json` on a running app; the grammar is
  `features/screenshots/screenshot-links.ts` (editor: `demo`, `keyboard`,
  `spatial`, `play`, `track`, `sheet=print|generate-track|create-snapshot`;
  `projects/new?generate=1`). `ScreenshotLinks.tsx`, mounted under `__DEV__`,
  sets the language, opens the bundled demo score (`demo-score.ts`, eight bars
  of MusicXML read through the real importer) and publishes a scene that the
  editor, `AppLayout` and File ▸ New each apply once (`screenshot-scene.ts`).
  **Every option is stated by every link**: an editor link that does not ask
  for the keyboard hides it, and one that names no sheet closes the open one,
  so a shot never depends on the one before it. A `paths.json` entry may be
  `{"path", "delay"}` for a shot that needs longer than `--delay` (the Spatial
  stage, which waits for the soundfont). **A debug build signs itself in** to
  the test account `.env` names (`DEV_SIGNIN_EMAIL`/`DEV_SIGNIN_PASSWORD`,
  `auth/DevAutoSignIn.tsx`), through the ordinary email provider, so New
  Project's Generate is really available; `babel.config.js` inlines those two
  into development bundles only, keyed on `BABEL_ENV`, so no release bundle
  holds the password. Signed in, the demo is a **server project**: the
  account's "Morning Light", created once and found by name on every later
  launch with its score put back to the demo (its snapshots are kept), so
  Generate Track and Create Snapshot — the snapshot history opened on its
  create form (`SnapshotsPanel.startCreating`) — are the real thing. Signed
  out, or with no server, it is a local document and the snapshot shot is the
  bare editor. iOS needed `moosiac` in `CFBundleURLTypes` and
  `SceneDelegate.scene(_:openURLContexts:)` handing links to
  `RCTLinkingManager`: with a scene delegate, links never reach the
  application delegate, so `Linking` heard nothing. Android has a `VIEW`
  intent filter for the scheme.

## Patches

macOS dependency fixes are applied by `patch-package` on `postinstall`:
`react-native-audio-api`, `@shopify/react-native-skia`, `react-native-svg`,
`react-native-macos`, and `@sudobility/components-rn` (the themed native slider
and fader thumb). See `patches/README.md`.

**A `Podfile.lock` entry proves a pod resolved, not that it compiles.** Skia
was assumed to build on macOS because `sudojo_app_rn` links it; it builds there
because that repo patches it, and the same patch was needed here.

**The macOS Podfile patches `fmt` in `post_install`.** React Native 0.81 pins a
version whose `consteval` format-string checks fail under clang 21 / Xcode 26 —
every error is inside `fmt/format-inl.h`. It has to be patched in the header,
not defined on the command line: the chain setting `FMT_USE_CONSTEVAL` opens
with a plain `#if` and no `#ifndef`, so the header overrides whatever the
compiler was told. Pod sources land read-only, so it `chmod`s first.

## Structure

- `src/documents/` — a tab over music_lib's document store and the services it
  is built with (`document.ts`), the open-document list with each tab's caret
  (`document-list.ts`), import/export arrangement, recents, and the filesystem
  (`rn-storage.ts`, the one platform-bound file).
- `src/config/initialize.ts` — platform services: player first (music_lib's
  adapter resolves it from a singleton on first use), then io, then the
  library copy. `app/App.tsx` builds the document services, binds device prefs
  and the language, and mounts the toast queue.
- `src/config/useDevicePrefs.ts` — the device prefs store.
- `src/features/toasts/` — the toast queue every store's sink points at.
- `src/i18n/` — bundled locales and which language is in force.
- `src/features/score/` — the Skia score view.
- `src/features/transport/` — `usePlayerBinding` (music_lib's `bindPlayer`
  over a document store) and `usePositionReadout`.
- `src/features/documents/`, `src/features/editor/` — UI.
- `src/features/print/` — `PrintSheet` (scope, paper, orientation) and the
  Skia page rendering over music_drawing's `printPlan`.
- `src/features/tracks/` — the mixer rows the property sheet's Track tab is
  built from, drawn the way the web draws them.
- `src/features/credits/` — the balance, and what happens when it runs out.
- `src/screens/ResourcesScreen.tsx` / `AboutScreen.tsx` — the web's Resources
  and Home pages, in the form a native app can use: the link list
  (`RESOURCE_GROUPS`) is shared from music*lib, and the home page's \_content* is a section of Settings
  without the landing-page shape an installed app has already answered.
- `src/components/controls/` — the controls the shared libraries cannot
  supply: `LevelSlider` (native on macOS, painted on Windows),
  `ToolbarSelect` (a picker whose trigger is a toolbar button rather than a
  bordered text field) and `ConfirmSheet` (a yes/no whose confirm can be
  destructive, which `FormModal`'s `onSave` shorthand cannot express).
- `src/features/inspector/` — the property sheet: four tabs in music_types'
  `INSPECTOR_TABS` order (Score, Track, Note, Bar), opening on
  `defaultInspectorTab`; `Field`/`DraftInput`/`NumberDraftInput`/`ReplaceButton`
  shared between them.
- `src/components/icons/` — `NotationIcon`, which replays music_types'
  `NOTATION_ICONS`, and `notation-ink.ts`, which says what colour to draw one.

## Related projects

`music_types` · `music_codecs` · `music_drawing` · `music_player` · `music_io` ·
`music_editing` · `music_client` · `music_lib` · `music_app` · `music_api`
