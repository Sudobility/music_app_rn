# Moosiac — native app

The React Native Moosiac app: iOS, iPad, Android phone and tablet, macOS, and a
React Native **Windows** target (Composition/new-arch Win32; its native code has
never been compiled — see `CLAUDE.md`). Bare React Native (no Expo); RN 0.83.

Everything about music lives in the shared libraries — the model, editing,
layout, rendering, playback and file formats are all `@sudobility/music_*`.
This repo is UI and arrangement, and `src/__architecture.test.ts` enforces it.

## Getting started

The `@sudobility/*` packages are published to **GitHub Packages**, so `.npmrc`
points that scope at `npm.pkg.github.com`. Before the first install, put a
GitHub token with `read:packages` in your user `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=<GitHub PAT with read:packages>
```

Then (Node ≥ 20, bun as the package manager):

```bash
bun install          # runs patch-package afterwards
bun run verify       # format:check, typecheck, lint, vitest unit tests

bun run start        # Metro, port 8092
bun run macos        # or: ios / android / windows
```

Test runners are split by file extension: `*.test.ts` → vitest
(`bun run test:unit`), `*.test.tsx` → jest RN preset (`bun run test:components`).
`bun run typecheck` and `bun run lint` (ESLint over `src`) run standalone.

macOS and iOS need pods first:

```bash
cd macos && RCT_NEW_ARCH_ENABLED=1 \
  DISABLE_AUDIOAPI_FFMPEG=1 \
  DISABLE_AUDIOAPI_STATIC_EXTERNAL_LIBS=1 \
  pod install
```

Both flags are deliberate, not shortcuts, and both must also be set for
`xcodebuild`:

- **FFmpeg** is needed only for MP4/M4A/AAC. The instrument packs are mp3,
  which miniaudio decodes natively.
- **The static external libs** (ogg, opus, vorbis) ship prebuilt, and the
  `macosx` slice is built for **macCatalyst** — linking it into a native macOS
  binary fails with *"building for 'macOS', but linking in object file built
  for 'macCatalyst'"*. We decode none of those formats, so the flag drops them
  and miniaudio's own decoders remain.

## What works today

- Opening, editing and saving `.moo` documents (legacy `.moosiac` still reads),
  several at once, each with its own editing store and its own undo history
- Notation rendered with Skia through the shared renderer, windowed to the
  viewport so a long score costs what a short one does
- Note entry, playback transport, document tabs
- 15 UI languages ship; English and Chinese are the reviewed translations, the
  rest are placeholder fallbacks awaiting review (see `src/i18n/index.ts`)

## What does not yet

- Sign-in, server projects, generation, credits, snapshots and publishing.
  The store is built without a `MusicClient` at all and reports those
  unavailable rather than failing — see `serverAvailable`.
- Import and export of MIDI, MusicXML and tracker formats. `music_io` provides
  them; nothing here calls them yet.
- The piano keyboard, the inspector, and selection by touch.

See `CLAUDE.md` for the architecture and the gotchas worth knowing before
changing anything.
