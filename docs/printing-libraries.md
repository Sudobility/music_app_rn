# Shared printing libraries: `printing_core`, `printing`, `printing_rn`

Design, API spec, and implementation plan for extracting the printing paths of
Moosiac (music, web + RN) and the Screenwriter app (web) into three shared
libraries. Written from the three codebases as they stand — `music_ui`'s
`PrintView`/`PrintSystem`, `music_app_rn`'s `print-service.ts`/`print-pages.ts`
+ the `@moosiac/print` native module, `music_drawing`'s `print-plan.ts`, and
`screenwriter_app`'s `print-item.ts` + `EditorPage` sheet path.

## Why this split

Printing has four distinct jobs, and they divide by *what they know* and *what
they can be shared across*:

1. **Common math** — paper sizes, orientation, margins, the usable page
   rectangle. Knows nothing about music or screenplays, nothing about a
   browser or Skia. Pure and fully shareable.
2. **Delivery** — getting marks onto paper or into a PDF. Platform-bound and
   **not shareable between web and RN** (see below).
3. **Pagination** — breaking content into pages. Needs to know what the content
   *is* (a system that must not be split; a scene heading that must not be a
   page's last line). Belongs to the content library, not here.
4. **Orchestration** — pick options, inject the renderer, call delivery. Thin
   app glue.

`printing_core` owns (1). `printing` and `printing_rn` own (2), one per
platform. (3) stays in `music_drawing` / `writing_ui`. (4) stays in the apps.

### The load-bearing fact: web and RN print in different currencies

This is why delivery cannot be one shared library, and why `printing_core` must
not expose a single uniform `print(pages)`:

- **Web prints *live DOM*** — a `<canvas>` or text nodes — and the browser does
  pagination, rasterization, PDF, and the dialog itself via `@page` +
  `window.print()`. The app never hands anyone a page image.
- **RN prints *baked pages*** — one PNG (or SVG, on Windows) per page, handed
  page-by-page to an OS print service (`UIPrintInteractionController`,
  `NSPrintOperation`, `PrintedPdfDocument`, or the Windows WebView2 PDF bridge).
  There is no `window.print()`.

So `printing_core` defines only the model and the math. Each platform library
defines a printer API suited to its medium. Forcing a shared `PrintablePage`
across both is the trap — web has nothing to hand it.

## Dependency graph

```
                     printing_core
                 (paper · geometry · options model)
                   ▲        ▲                ▲
         ┌─────────┘        │                └──────────┐
      printing          printing_rn                      │
   (web delivery)     (rn delivery + native)             │
         ▲                  ▲                             │
         │                  │                             │
         │                  │                music_drawing / writing_ui
         │                  │                 (pagination — knows content)
         │                  │                             ▲
         └──────────┬───────┴─────────────────────────────┘
                    │
              apps: music_ui · music_app_rn · screenwriter_app
          (orchestrate: options → paginate → inject renderer → deliver)
```

Rules the graph enforces:

- `printing_core` depends on nothing but React (peer, for the headless hook in
  its `/react` subpath). No DOM, no react-native, no Skia, no domain types.
- `printing` depends on `printing_core` + react/react-dom. No domain types.
- `printing_rn` depends on `printing_core` + react-native + `@shopify/react-native-skia`
  + its own native module. **No dependency on `music_drawing`** — the 2D
  context adapter and the draw are injected by the caller, never imported here.
- `music_drawing` / `writing_ui` depend on `printing_core` for geometry; they
  do **not** depend on `printing` or `printing_rn`.

Published under `@sudobility/*` on GitHub Packages like the other libs; dev-linked
by rsync overlay, never a `file:` symlink (see the `music_ui_rn` overlay note in
CLAUDE.md — the overlay must carry both `dist` and `src` and have no nested
`node_modules`).

---

## `printing_core` — API spec

Pure data + math + an options model. The one React touch (a headless hook) sits
behind a `/react` subpath so pure consumers never pull React.

### `paper.ts` — the paper model (lifted out of `music_types`)

```ts
export type PaperSize = 'a4' | 'letter' | 'legal' | 'tabloid' | 'a3';
export type PaperOrientation = 'portrait' | 'landscape';

export interface PaperOption {
  value: PaperSize;
  labelKey: string;      // i18n key; apps resolve it
  css: string;           // the CSS @page size token, e.g. 'A4', 'letter'
  widthMm: number;       // portrait width
  heightMm: number;      // portrait height
}

export const PAPER_OPTIONS: readonly PaperOption[];
export const ORIENTATION_OPTIONS: readonly { value: PaperOrientation; labelKey: string }[];

/** Region default: Letter where the locale prints on Letter, A4 elsewhere. */
export function defaultPaperSizeFor(languages: readonly string[]): PaperSize;
```

`music_types` re-exports these for one release so its current consumers
(`PrintView`, `PrintSheet`) don't break on the move; the re-export is deleted
once they import from `printing_core`.

### `geometry.ts` — the page math (generalized from `music_drawing`)

```ts
export const DEFAULT_MARGIN_MM = 10;   // was PAGE_MARGIN_MM — the one source of truth

export interface PageGeometry {
  paper: PaperSize;
  orientation: PaperOrientation;
  marginMm: number;      // default DEFAULT_MARGIN_MM
}

/** Full sheet in mm, orientation applied. */
export function paperDimsMm(paper: PaperSize, orientation: PaperOrientation): { widthMm: number; heightMm: number };

/** Printable area inside the margins, in mm. */
export function usablePageMm(geo: PageGeometry): { widthMm: number; heightMm: number };

/**
 * Usable page height in *content units*, given the content's pixel width —
 * the number pagination packs systems/sheets into. Generalizes
 * `usablePageHeight(paper, orientation, PRINT_WIDTH)`.
 */
export function usablePageHeight(geo: PageGeometry, contentWidth: number): number;

/** The `@page` CSS rule for this geometry. The ONLY place a print margin is written. */
export function pageCss(geo: PageGeometry, pageName?: string): string;
```

`pageCss` is the fix for the recurring "the printer's page and the packer's page
must be the same page" drift warned about in `PrintView.tsx` and `print.css`:
both the web `@page` rule and pagination's usable height now derive from one
`PageGeometry`.

### `options.ts` — the options model (framework-agnostic)

```ts
export interface PrintOptions {
  scope: string;              // domain-defined; core treats it as opaque
  paper: PaperSize;
  orientation: PaperOrientation;
}

export interface PrintOptionsInit {
  rememberedPaper: PaperSize | null;   // the persisted device pref, or null
  defaultPaper: PaperSize;             // defaultPaperSizeFor(...) until one is chosen
  initialScope?: string;               // opened on a track's part, say
}

export function initialPrintOptions(init: PrintOptionsInit): PrintOptions;
```

### `react/usePrintOptions.ts` — the headless hook (React peer dep)

```ts
export interface UsePrintOptions {
  scope: string;        setScope: (s: string) => void;
  paper: PaperSize;     setPaper: (p: PaperSize) => void;   // calls onPaperChange
  orientation: PaperOrientation; setOrientation: (o: PaperOrientation) => void;
  geometry: PageGeometry;    // {paper, orientation, DEFAULT_MARGIN_MM}
}

export function usePrintOptions(
  init: PrintOptionsInit & { onPaperChange: (p: PaperSize) => void },
): UsePrintOptions;
```

The hook holds scope and orientation (about *this* printout) and reflects the
remembered paper through `onPaperChange` (about the *printer*) — exactly the
split `PrintView` and `PrintSheet` each re-implement today. Both apps drop their
copies and render their own widgets around this.

---

## `printing` (web) — API spec

Depends on `printing_core` + react/react-dom. Everything here delegates the
actual pagination/rasterization/PDF to the browser; it only arranges the DOM and
emits the right CSS.

```ts
/**
 * The detached-print dance: mount a subtree under <body>, hide the app, wait for
 * any async draw, window.print(), clean up on afterprint. This is what
 * screenwriter's printDoc() and EditorPage both hand-roll, and what music's
 * PrintView could adopt instead of a whole route.
 */
export interface DetachedPrintOptions {
  geometry: PageGeometry;                 // emits @page via pageCss
  mount: (host: HTMLElement) => void;     // render your pages into host
  hideSelector?: string;                  // what to hide while printing (default '#root')
  /** Resolve once every page is drawn — music waits for all canvases here. */
  onReady?: () => Promise<void> | void;
}
export function printDetached(opts: DetachedPrintOptions): Promise<void>;

/** React wrapper carrying break-inside:avoid — what PrintSystem's outer div is. */
export function PrintSlice(props: { children: React.ReactNode }): JSX.Element;

/** Gate a Print button until N async draws have reported in — PrintView's `preparing`. */
export function useDrawGate(expected: number): {
  ready: boolean;
  markDrawn: (id: number) => void;
  reset: () => void;                      // a new plan starts the count over
};
```

`printDetached` listens for `afterprint` **and** the `print` media-query change,
because saving a PDF without a dialog does not fire `beforeprint`/`afterprint` —
the lesson already encoded in `EditorPage`.

The web apps still own their page *content* (music draws a `<canvas>` per slice;
screenwriter emits text nodes). `printing` gives them the scaffolding, the
`@page` rule, the hide-the-app machinery, and the readiness gate.

---

## `printing_rn` — API spec

Depends on `printing_core` + react-native + `@shopify/react-native-skia` + its
own native module (the relocated `@moosiac/print`). Knows nothing about scores.

### The native module (relocated `@moosiac/print`)

Its JS surface stays as it is today — only its home changes:

```ts
export type PrintablePage =
  | { base64: string; width: number; height: number }   // raster (iOS/macOS/Android)
  | { svg: string; width: number; height: number };      // vector (Windows WebView2)

export function isSupported(): boolean;
export function printPages(jobName: string, pages: PrintablePage[]): Promise<boolean>;
```

### The page-render loop (surface lifecycle, generic over the draw)

The yield-between-pages / dispose-the-~48MB-surface / clear-white / snapshot
loop from `print-pages.ts`, with the 2D context and the draw **injected** so this
library never imports `music_drawing`:

```ts
import type { SkCanvas } from '@shopify/react-native-skia';

export interface RenderPagesOptions {
  skia: typeof import('@shopify/react-native-skia');
  pageCount: number;
  pixelWidth: number;      // PRINT_WIDTH * PRINT_SCALE, computed by the caller
  pixelHeight: number;
  /** Draw one page onto the raw Skia canvas. Caller wraps it with its own 2D context. */
  drawPage: (canvas: SkCanvas, pageIndex: number) => void;
  /** Asked between pages; true abandons and resolves null. */
  isCancelled?: () => boolean;
}

/** One white PNG per page. null if cancelled. Disposes every surface/snapshot. */
export function renderPagesToPng(opts: RenderPagesOptions): Promise<PrintablePage[] | null>;
```

Music's `print-pages.ts` collapses to: compute `pixelWidth/Height`, and in
`drawPage` wrap the canvas with `createSkiaContext2D` (still in `music_drawing`),
`translate(0, -first.top)`, and `renderer.render(...)`. The surface memory
discipline and the cancel/yield cadence live here, once.

### Orchestration helper (optional)

```ts
export interface PrintHooks {
  beforeDialog?: () => Promise<void> | void;  // close the options sheet before the dialog
  isCancelled?: () => boolean;
}
export type PrintResult = 'printed' | 'cancelled';

/** render → beforeDialog → printPages. What printScore() is, minus the plan. */
export function printRenderedPages(
  jobName: string,
  pages: PrintablePage[],
  hooks?: PrintHooks,
): Promise<PrintResult>;
```

`beforeDialog` carries the platform rule from `MoosiacPrint.mm`: the dialog must
not be presented over a sheet that is animating away, or it is dismissed with it.

### Platform entries

`.windows.ts` resolution stays: `renderPagesToSvg` (vector) feeds the same
`printPages` currency for the WebView2 PDF bridge. Native build concerns — the
podspec `prepare_command` that restores xcframework symlinks `npm pack` strips,
the Android NDK/autolinking pins — move with the module and are the real cost of
this library (see Risks).

---

## What stays in the domain libraries

**`music_drawing`** keeps `printPlan`, `paginate`, `printSystems`, `extractPart`,
`printRenderOptions`, `createSkiaContext2D`, `CanvasScoreRenderer`, and the
`PRINT_WIDTH`/`PRINT_SCALE` constants. `printPlan` changes only to take a
`PageGeometry` (or to build one) and to call `printing_core`'s `usablePageHeight`
instead of its own. `__architecture.test.ts` keeps enforcing that this logic is
never in the app.

**`writing_ui`** keeps the `.wui-sheet` sheet layout and screenplay pagination.
The pure `PrintDoc` / `contentFor` / `scriptFont` model lifts out of the app's
`print-item.ts` into `writing_ui` (or `screenwriter_lib`); only `renderPrintDoc`
(DOM) and `printDoc` (which becomes a `printDetached` call) stay app-side for now.

## What stays in the apps

- **`music_ui`** — `PrintView` renders the widgets around `usePrintOptions`,
  draws a `<canvas>` per slice inside `PrintSlice`, gates Print with
  `useDrawGate`, and emits `pageCss`. Shrinks to layout + wiring.
- **`music_app_rn`** — `print-service.ts` becomes: `printPlan` →
  `renderPagesToPng` (with music's draw injected) → `printRenderedPages`. The
  `PrintSheet` widgets wrap `usePrintOptions`. `print-pages.ts`'s surface loop is
  gone (now in `printing_rn`); the allow-list in `__architecture.test.ts` updates.
- **`screenwriter_app`** — `printDoc` and `EditorPage` call `printDetached`;
  `index.css`'s `@page`/hide rules come from `pageCss` + the lib's class names.

---

## Implementation plan

Phased so the cheap, high-value dedup lands before the expensive native move.
Each phase ends green on the owning repo's `verify`/test scripts and leaves every
app building.

### Phase 0 — scaffold (no behavior change) — ✅ done 2026-11-10

Executed. The three repos live in the **`Sudobility` org** (public, default
branch `main`), each with the `GH_PACKAGES_READ_TOKEN` secret and the unified
CI/CD workflow:

- https://github.com/Sudobility/printing_core — `paperDimsMm` + paper types
- https://github.com/Sudobility/printing — `pageCss`
- https://github.com/Sudobility/printing_rn — `PrintablePage` + `isRasterPage`

**They must be in the `Sudobility` org, not a personal namespace.** The shared
workflow derives the npm scope from the repo owner; an `@sudobility/*` package in
a `johnqh`-owned repo makes the workflow route the `@johnqh` scope instead,
`npm publish` falls through to npmjs.org, and it fails `ENEEDAUTH`. `di`/`di_web`/
`di_rn` are all `Sudobility/*` (the `johnqh/di` paths are redirects). Build, test,
lint and dist build pass regardless — only the publish step cares about the owner.

Each was copied from its `di` template, trimmed to the Phase 0 surface, and
verified locally (typecheck + lint + tests + build; 100% coverage on core and
web). Everything below is the recipe followed.

Each project copies its settings **and** CI/CD from the matching `di` project,
because `di` already ships the three-way (core / web / rn) compatibility story:

| New repo | Package | Copy settings + CI/CD from | Compatibility |
|---|---|---|---|
| `printing_core` | `@sudobility/printing_core` | `di` | web **and** RN |
| `printing` | `@sudobility/printing` | `di_web` | web only |
| `printing_rn` | `@sudobility/printing_rn` | `di_rn` | RN only |

Steps, per repo:

1. **Copy the template.** Take `package.json` (scripts, `type: module`,
   `exports`/`main`/`types`, `publishConfig.access: public`, `peerDependencies`
   shape), `tsconfig.json` (+ `tsconfig.test.json` for `printing_core`/`printing`),
   `.npmrc` (`@sudobility:registry=https://npm.pkg.github.com`), eslint/prettier,
   and `.github/workflows/ci-cd.yml` from the matching `di` repo. Rename the
   package and strip the exports/peers down to this library's surface.
   - `printing_core` follows `di`'s dual build: `exports['.']` with a
     `react-native` condition → `dist/rn`, `default` → `dist/web` (so one package
     resolves correctly in both apps), plus a `./react` subpath for the headless
     hook.
   - `printing` follows `di_web` (single `dist/`, `react`/`react-dom` peers).
   - `printing_rn` follows `di_rn` (single `dist/`, `react`/`react-native`/skia
     peers) **and additionally** carries the native module (podspec, gradle,
     `react-native.config.js`) added in Phase 2.
2. **CI/CD.** The copied `.github/workflows/ci-cd.yml` calls the shared
   `johnqh/workflows/.github/workflows/unified-cicd.yml@main` with
   `publish-target: github` (publish to + consume from GitHub Packages). Keep the
   per-template secrets wiring exactly as the source repo has it:
   - `printing_core` (from `di`) uses `secrets: inherit` — all repo secrets pass
     through, including `GH_PACKAGES_READ_TOKEN`.
   - `printing` / `printing_rn` (from `di_web` / `di_rn`) **enumerate** secrets;
     keep the full list, which already includes `GH_PACKAGES_READ_TOKEN`
     (`NPM_TOKEN`, `GIT_DEP_TOKEN`, the Docker/Cloudflare/Railway/Vercel/PyPI
     entries, etc.). Unset secrets resolve empty and are simply skipped.
   - `permissions` must keep `packages: write` (publish) and `contents: write`
     (releases), as all three `di` templates do.
3. **Git + GitHub.** `git init`, commit the scaffold, create the GitHub repo
   **in the `Sudobility` org** (where the `di` repos live — this is required for
   the `@sudobility` scope to publish, see the warning above), and push **`main`**
   as the default branch (the workflow triggers on `main` and `develop`):

   ```sh
   gh repo create Sudobility/printing_core --public --source=. --remote=origin --push
   ```

4. **Repo secret for CI/CD.** Set `GH_PACKAGES_READ_TOKEN` on each repo so CI can
   install `@sudobility/*` deps from GitHub Packages. Its value is the
   `//npm.pkg.github.com/:_authToken=` line in the developer's `~/.npmrc` (a
   `read:packages` token):

   ```sh
   TOKEN=$(grep -E '//npm\.pkg\.github\.com/:_authToken=' ~/.npmrc | sed -E 's/.*_authToken=//')
   for r in printing_core printing printing_rn; do
     gh secret set GH_PACKAGES_READ_TOKEN --repo <owner>/$r --body "$TOKEN"
   done
   ```

   If the unified workflow also needs `NPM_TOKEN`/`GIT_DEP_TOKEN` to publish or to
   pull private git deps, set those from the same `~/.npmrc`/git credentials at the
   same time; they are org-level on the existing repos, so an org secret covers all
   three at once.
5. **First publish + overlays.** `printing_core` ships first as a minimal
   `0.0.1` (one smoke test) so the other two can depend on it. Then wire dev
   overlays into the three apps (rsync, `dist`+`src`, no nested `node_modules`).

### Phase 1 — `printing_core` + `printing` (web, zero native risk) — ✅ largely done 2026-11-10

Done: `printing_core@0.1.0` (paper model, geometry, options, `usePrintOptions`)
and `printing@0.1.0` (`printDetached`, `PrintSlice`, `useDrawGate`, re-exported
geometry) are published. `music_ui`'s `PrintView` is rewritten onto them
(committed on `main`, push pending). `screenwriter_app`'s `printDoc` prints
Catalog items via `printDetached`/`pageCss` (merged to `main`). `music_app`
(web) and `music_app_rn` have the printing packages added to `package.json`
(install + overlay re-apply pending). The tail is also done: `music_types`'s
`print.ts` now re-exports the paper model from `printing_core` (step 1 — one
definition; all 1420 music_types tests pass), and `music_drawing`'s
`PAGE_MARGIN_MM`/`usablePageHeight`/`PAPER_DIMENSIONS_MM` now come from
`printing_core`'s geometry with `printing_core` declared as a runtime peer
(step 2 — architecture test updated; all 725 tests pass). Both are committed on
`main` (push/publish pending). What remains is Phase 2.

1. **Paper model** — move `PaperSize`/`PaperOrientation`/`PAPER_OPTIONS`/
   `ORIENTATION_OPTIONS`/`defaultPaperSizeFor` into `printing_core`; re-export
   from `music_types`. Ship.
2. **Geometry** — implement `geometry.ts` (`usablePageMm`, `usablePageHeight`,
   `pageCss`, `DEFAULT_MARGIN_MM`). Port `music_drawing`'s `usablePageHeight` and
   `PAGE_MARGIN_MM` to call it; delete the local margin constant.
3. **Options model + hook** — `initialPrintOptions`, `usePrintOptions`.
4. **`printing` (web)** — `printDetached`, `PrintSlice`, `useDrawGate`, `pageCss`
   passthrough.
5. **Adopt in `music_ui`** — rewrite `PrintView` onto `usePrintOptions` +
   `PrintSlice` + `useDrawGate` + `pageCss`. Keep `PrintSystem`'s canvas draw.
   Verify the print snapshot tests.
6. **Adopt in `screenwriter_app`** — lift `PrintDoc`/`contentFor`/`scriptFont`
   into `writing_ui`; rewrite `printDoc` + `EditorPage` onto `printDetached` +
   `pageCss`. Verify sheet + Catalog-item print tests.

At the end of Phase 1 both web apps share the paper model, geometry, options
hook, and the detached-print machinery. No native code has moved.

### Phase 2 — `printing_rn` (the expensive half) — ◑ JS/TS done 2026-11-10, native relocation pending

Done at the JS/TS + architecture level, all local-linked (overlays, unpublished):
`printing_rn`'s `renderPagesToPng` (the memory-managed Skia render loop, generic
over the canvas, Skia + draw injected) is implemented and tested; `music_app_rn`'s
`print-pages.ts` now delegates to it (injecting `createSkiaContext2D` + the score
renderer), with `print-service.ts` and its tests unchanged (12 pass) and the
architecture allow-list still valid; `music_ui_rn`'s `PrintSheet` holds options
via `usePrintOptions`. The integrated `music_app_rn` typechecks against the
refreshed overlays.

**Still pending (native-build-gated, cannot be verified without devices):**
physically relocating the `@moosiac/print` native module (iOS/macOS/Android +
the Windows WebView2 SVG bridge, podspec/gradle/`react-native.config.js`) from
`music_app_rn/native/print` into `printing_rn`, and re-pointing the app's
`isSupported`/`printPages` imports. Until then the native module stays in
`music_app_rn` and `print-service.ts` imports it from `@moosiac/print` as before;
only the render loop moved. This is the step the design always flagged as gated
on a real printout from every target — do it on a machine with the toolchains and
verify by printing a page on each platform.

1. **Relocate the native module** — move `native/print` (`MoosiacPrint` iOS/macOS/
   Android + Windows WebView2 bridge, podspec, gradle, `react-native.config.js`)
   into `printing_rn`. Keep the podspec `prepare_command` symlink restore. Rename
   `@moosiac/print` → `@sudobility/printing_rn` (or a `/native` subpath).
2. **Page-render loop** — implement `renderPagesToPng` (+ `renderPagesToSvg` for
   `.windows.ts`) with `drawPage` injected. Port the surface/dispose/yield/cancel
   discipline verbatim from `print-pages.ts`.
3. **Orchestration helper** — `printRenderedPages`, `isSupported`.
4. **Adopt in `music_app_rn`** — `print-service.ts` becomes plan → render (music
   draw injected) → deliver; delete `print-pages.ts`; point `PrintSheet` at
   `usePrintOptions`; update `__architecture.test.ts`'s allow-list and its note.
5. **Build all native targets** — iOS, macOS (check `Podfile.lock`), Android
   (JAVA_HOME/NDK), Windows. A `Podfile.lock`/`Manifest.lock` entry proves resolve,
   not compile — actually print a page on each.

### Phase 3 — tidy

- Delete the `music_types` paper re-export once nothing imports it.
- Delete any now-dead per-app print constants.
- One doc pass: each library README, and a pointer from this file.

---

## Risks and open decisions

**Risks**

- **The native-module move is ~80% of `printing_rn`'s cost.** The JS is trivial;
  the podspec symlink restore (`npm pack` strips versioned xcframework slice
  symlinks — see memory), Android autolinking/NDK pins, and the Windows bridge are
  where days go. Phase 2 is gated on a real printout from every target, not a
  green resolve.
- **`createSkiaContext2D` home.** It stays in `music_drawing` and is injected via
  `drawPage`, so `printing_rn` stays domain-free. If a second RN app ever needs a
  Canvas2D-over-Skia adapter, promote it to its own lib then — not now.
- **Screenwriter on RN is still unbuilt.** `printing_rn` gives it the *delivery*
  seam, but RN/Skia has no CSS text engine: `white-space: pre-wrap`, orphans/
  widows, and `scriptFont` shaping would all have to be written. This plan does
  not close that gap and must not be read as doing so.
- **React in `printing_core`.** Confined to the `/react` subpath (peer dep) so the
  pure core has no framework dependency. If that proves awkward, move the hook
  down into `printing` and `printing_rn` (duplicated, ~15 lines each).

**Open decisions**

1. Absorb the paper model into `printing_core` with a `music_types` re-export
   (recommended), or re-export the other way for a softer migration? → Absorb.
2. Is `scope` opaque to core (recommended — core stays domain-free), or does core
   model "whole vs part"? → Opaque; the domain owns scope meaning.
3. One `printing_rn` package with a `/native` subpath, or a separate
   `@sudobility/printing_rn_native` so the JS lib can be used without the native
   build in tests? → Lean toward a subpath; revisit if jest needs the module stubbed.
