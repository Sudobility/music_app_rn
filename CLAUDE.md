# music_app_rn (Moosiac, native)

> **Git: never auto-commit or auto-push.** Leave work in the working tree; run
> `git commit`/`push`/`gh pr create` only when the user asks in that turn.

Native Moosiac for iOS, iPad, Android, macOS, and a React Native **Windows**
target. Windows is a Composition (new-architecture) **Win32** app — not UWP —
with explicit fallbacks for score rendering, file dialogs and printing; none of
its native code has ever been compiled. Details and remaining work:
`music_app/docs/rn-windows-findings.md`.

**This repo is UI and arrangement only.** Every rule about music lives in the
libraries — if you are about to write score maths here, it belongs elsewhere:

`music_types` (model, vocabulary, pure helpers) · `music_editing` (editing +
its state) · `music_lib` (app state, commands, adapters, player binding, docs
content, device prefs, the document store) · `music_drawing` (layout +
renderer) · `music_player` (scheduler) with synths `music_synth` (web) /
`music_synth_rn` (native) / `music_sample_engine` (MP3 fallback) · `music_io`
(files) · `music_client` (network) · `music_ui_rn` (shared RN functional UI) ·
`routing` (route registry + Navigator contract).

Per-feature behavior, availability rules and the "why" of each control are
documented **in each file's own header comment** — read the component before
changing it. This file holds only the cross-cutting, non-obvious facts.

## Commands

- `bun install` — deps (runs `patch-package` on postinstall; see Patches)
- `bun run verify` — format, typecheck, lint, vitest (the `.test.ts` half). Before any push.
- `bun run test:components` — jest (the `.test.tsx` half)
- `bun run start` (Metro, port 8091) · `bun run ios` / `android` / `macos`

## How it differs from the web app

- **The store is per document** (`createDocumentStore` from music_lib), not
  per app — a desktop edits several scores at once. `MusicDocument = { id, store }`
  (`src/documents/document.ts`). `title`/`origin`/`dirty`/`saveState` are store state.
- **No auth gate** — a local `.moo` needs no account. Server projects are added
  by signing in; anything server-backed reports `serverAvailable` rather than failing.
- **Drawing is Skia through the same renderer** (`createSkiaContext2D`), recorded
  into an `SkPicture` so a scroll replays rather than re-running VexFlow.
- **The reader sees a _bar_; the code keeps `Measure`** (a pickup has an index,
  no number). Keys use the model's word ("Replace Bars").

## Load-bearing gotchas (each cost a debugging cycle)

- **React / react-native / react-native-macos are one locked trio; wrong = crash
  at launch.** `react@19.1.4`, `react-native@0.81.6`, `react-native-macos@0.81.9`.
  Each RN ships a renderer compiled against one exact React version and asserts it
  ("Incompatible React versions…"). Not avoidable by "running Fabric" —
  `Animated`'s native driver reaches the Paper shim unconditionally.
  `react-versions.test.ts` pins it.
- **Two test runners, split by extension.** `*.test.ts` → vitest (node, no RN);
  `*.test.tsx` → jest (RN preset). `jest.config.cjs` is load-bearing: the
  transform allow-list must name every ESM dep *and* allow bun's
  `.bun/<pkg>@<ver>/node_modules/<pkg>` layout; the Paper renderer is stubbed; a
  20s timeout; `jest.mocks.cjs`/`jest.firebase.cjs` cover modules that throw at
  import. A `.test.tsx` using `jest.fn()` must `import { jest } from '@jest/globals'`
  or **typecheck** (not the test) fails. RNTL is pinned to **v13** (v14's
  reconciler wants React 19.1.0, this app is 19.1.4).
- **Sibling UI libs (`music_ui_rn`, `routing`) are dev-linked by overlay, not a
  bare `file:` symlink.** Published registry dep + an overlay: `rsync -a
  --exclude node_modules <sibling>/ node_modules/@sudobility/<pkg>/` (both `dist`
  and `src`). The overlay must have **no nested `node_modules`** or react /
  react-native / routing resolve to a second copy → duplicate-React &
  TurboModule crashes under jest. `bun add`/`bun install`/`bun update` recreate
  nested node_modules and revert overlays — re-overlay after. A `file:` dep must
  never be committed (CI/Xcode Cloud have no sibling checkout). Depend on the
  **latest** published version.
- **`@sudobility` packages need a `default` export condition** or jest resolves
  them as missing; auth_lib/routing subpaths are mapped by path in `jest.config.cjs`.
- **A `className` must appear in source as a complete literal** — Tailwind scans
  text, so interpolating classes into a template string silently drops them.
- **Never size from `useWindowDimensions()`** — on macOS it reports the display,
  not the window. Use `useContainerSize()` (`onLayout`).
- **A horizontal `ScrollView` in a column needs `flexGrow: 0` and a height.**

## Native / build

- **macOS build flags live in `macos/Podfile`** (not a shell): `react-native-audio-api`
  needs `DISABLE_AUDIOAPI_STATIC_EXTERNAL_LIBS=1` **and** `DISABLE_AUDIOAPI_FFMPEG=1`.
  The Podfile also patches `fmt` in `post_install` (RN 0.81's pin fails clang 21 /
  Xcode 26). Firebase pods stay on CocoaPods, every pod a static framework.
- **`react-native.config.js` traps:** a project-level `platforms` entry *replaces*
  a package's own (only add one to remove a platform); `podspecPath` is absolute,
  Android `sourceDir` is relative; `react-native config` is not the oracle for
  macOS — check `macos/Podfile.lock`. Diagnose with `bunx react-native config | grep <pkg>`.
- **The tab bar is `react-native-bottom-tabs`** (`@bottom-tabs/react-navigation`,
  both `1.5.0`) — a real `UITabBarController`/Material bar. `@react-navigation/bottom-tabs/unstable`
  aborts on mount under RN 0.83.
- **Firebase runs the JS SDK everywhere** (the China proxy is a `fetch` wrapper).
  `.env` is everything JS reads; `GoogleService-Info.plist` (must be in the Xcode
  target) and `google-services.json` configure native analytics only. `pod install`
  needs `GoogleUtilities`/`RecaptchaInterop` as modular headers — a refused install
  leaves old Pods, so check `Pods/Manifest.lock`.
- **App Store requirements:** the Mac app is sandboxed (entitlements at
  `macos/.../music_app_rn.entitlements`) and declares `LSApplicationCategoryType`;
  `NSPhotoLibraryUsageDescription`/`NSMicrophoneUsageDescription` must stay (the
  binary is scanned for the picker/recorder modules even though no prompt shows).
- **Every orientation is supported** (a foldable has a narrow portrait cover
  screen); bars `flex-wrap` rather than assume a wide screen. `UIRequiresFullScreen`
  is false on iPhone, true-via-plist elsewhere.
- **Android:** `JAVA_HOME` = Homebrew `openjdk@17`; emulators `Pixel_Tablet` /
  `Pixel_10_Phone`; `adb reverse tcp:8091` (Metro) and `tcp:8032` (API).

## Structure

- `src/documents/` — the tab over music_lib's document store, the open-document
  list (`document-list.ts`), import/export, recents, and `rn-storage.ts` (the one
  filesystem-bound file).
- `src/config/` — platform services: `initialize.ts`, `native-player.ts`
  (music_player scheduler + music_synth_rn backend, MP3 fallback), `useDevicePrefs.ts`,
  theme (`designTheme.ts`/`themeVars.ts`; the Swiss theme must match the web app).
- `src/components/layout/AppLayout.tsx` — the editor composition root (navigation,
  menu commands, safe-edges, screenshot scene); renders music_ui_rn's pieces.
- `src/app/` — navigation, `tab-bar.ts`/`native-header.ts` predicates, menu
  commands, the React Navigation `MusicNavigator` adapter (`navigator.ts`).
- `src/features/*` — app-side glue around the library components.
- `__architecture.test.ts` enforces that non-UI logic lives in libraries (with an
  allow-list of platform-glue exceptions, reasoned per entry).

## Patches

macOS dependency fixes via `patch-package` on postinstall: `react-native-audio-api`,
`@shopify/react-native-skia`, `react-native-svg`, `react-native-macos`,
`@sudobility/components-rn`. See `patches/README.md`. A `Podfile.lock` entry proves
a pod resolved, not that it compiles (Skia needed the same patch sudojo_app_rn uses).

## Screen rendering — safe area

Honour the device safe area on every screen with `useSafeAreaInsets()` /
`SafeAreaView` — never a hard-coded padding. Decide per axis by whether it
scrolls: a non-scrolling axis pads by the inset; a scrolling axis renders
full-bleed with scroll insets. Under a tab navigator `insets.bottom` already
includes the tab bar — don't add it twice. One rule: `useSafeEdges()`
(`src/platform/safe-edges.ts`).
