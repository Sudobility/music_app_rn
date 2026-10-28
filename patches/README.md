# Patches

## `react-native-webgpu+0.13.0.patch` — macOS compile fix (WebGPU spike)

The podspec declares macOS and the view code switches on `TARGET_OS_OSX`,
but two headers never compiled for it: `WebGPUView.h` imports UIKit outright
instead of the package's own `RNWGUIKit.h` shim, and `CAMetalLayer` reaches
`MetalView.mm` on iOS only because UIKit pulls in QuartzCore, which AppKit
does not. The patch routes the view through the shim and imports
`QuartzCore/CAMetalLayer.h` there. With it, the spike stage renders through
Dawn on Metal under react-native-macos 0.81.

## `react-native-safe-area-context+5.6.2.patch` — Windows dialog content

Adds a Windows provider backed by an ordinary `View`, reporting its client
frame with zero cutout insets. The package has no native Windows provider;
without a layout event, a modal's `SafeAreaProvider` never mounts its children.

## `react-native-audio-api+0.13.3.patch` — macOS support

The library declares `:ios` alone in its podspec, but its implementation is
almost entirely portable: the audio graph is `AVAudioEngine` /
`AVAudioSourceNode` / `AVAudioSinkNode`, all of which exist on macOS 10.15+,
and the shared C++ core compiles for macOS with no changes at all (82/82 files,
with `DISABLE_AUDIOAPI_FFMPEG=1` — FFmpeg is needed only for MP4/M4A/AAC, and
our sample packs are mp3, which miniaudio decodes natively).

Three things are genuinely iOS-only and are excluded on macOS: the audio
session, the now-playing/lock-screen notifications, and recording.

The patch:

- adds `:osx => '11.0'` to the podspec and excludes those three from the macOS
  build;
- gives `AudioSessionManager` a separate macOS interface whose methods are
  no-ops — macOS has no session to activate, and `AVAudioEngine` starts without
  one (verified: it renders with no session present);
- guards the `AVAudioSession` reads inside `logAudioEngineState`, a debug
  logger that accounted for 17 of the 19 errors in `AudioEngine.mm`.

Verified: 92/92 files compile for macOS and archive; both patched files still
compile clean for iOS. **Not yet verified: linking, `pod install` with a
`macos` platform, or running under a live bridge.**

This is a candidate for upstreaming rather than a permanent fork.

**`getDevicePreferredSampleRate` must not answer zero.** The engine builds an
`AVAudioFormat` from it and hands that to `-[AVAudioEngine connect:to:format:]`,
which raises an Objective-C exception for a zero rate — uncaught inside C++, so
the process aborts with SIGABRT and no message. The macOS stub asks the output
node instead, which is where macOS keeps what iOS keeps on the audio session.
This was found by reading a crash report, not a log: the abort happens below JS
and Metro only reports the socket closing.

**Two build flags belong with it**, and neither is optional on macOS:
`DISABLE_AUDIOAPI_FFMPEG=1` (FFmpeg is only for MP4/M4A/AAC) and
`DISABLE_AUDIOAPI_STATIC_EXTERNAL_LIBS=1` — the prebuilt `external/macosx/`
archives are built for **macCatalyst**, so linking them into a native macOS
binary fails outright. Neither format matters here: the packs are mp3.

## `@shopify+react-native-skia+2.2.12.patch` — macOS

`RNSkApplePlatformContext.mm` loads a bundled image with `UIImage`, which is
UIKit and does not exist on macOS, and `MetalWindowContext.mm` needs the same
treatment. Ported from `sudojo_app_rn`, which hit this first.

Worth recording why this one was nearly missed: `sudojo_app_rn`'s
`Podfile.lock` lists `react-native-skia (2.2.12)`, and that was taken as proof
that Skia builds on macOS. **A lockfile entry proves a pod resolved, not that
it compiles.** It builds there because that repo patches it — the same patch
now applied here.

## `react-native-macos` — no longer patched

There used to be a `react-native-macos+0.81.2.patch` carrying three fixes: a
`strong` qualifier on `RCTBridgeModule`'s `methodQueue`, and two codegen
changes that built the third-party component map dynamically so a class
`NSClassFromString` could not resolve on macOS did not take the whole map down
with it. **All three shipped upstream in 0.81.9**, which is where this app now
is, so the patch was deleted rather than re-based onto a version that no longer
needs it.

The upgrade itself was not cosmetic — see the React-version note in
`../CLAUDE.md`: `react-native-macos@0.81.9` peers `react-native@0.81.6` and
`react@^19.1.4`, and that trio is the only combination in which all three
platforms' renderers agree on a React version.

## `react-native-svg+15.12.1.patch` — macOS and Windows

`RNSVGImage.mm` and `RNSVGSvgView.mm` use UIKit image APIs (`CGImage` and
`size` on a `UIImage`), which do not exist on macOS. Ported from
`sudojo_app_rn`, which hit this first — the same shape of problem as the Skia
patch beside it, and a reminder that a pod appearing in `Podfile.lock` says
nothing about whether it *compiles* for this platform.

The Windows half fixes two bugs in its Fabric renderer that scale with the
number of elements in a drawing. They are why the score froze at every page
turn while it was an SVG string replayed by `SvgXml`; the score is now drawn by
`@sudobility/windows_canvas_rn` instead, but every icon on Windows still goes
through react-native-svg:

- **`SvgView::Invalidate` redrew the whole document once per element.** Fabric
  calls it for every descendant mounted, updated or unmounted, and each call
  rebuilt the D2D SVG document from every child and drew it, synchronously, on
  the UI thread. A page turn changes every element (the scroll offset is in
  each one's transform), so it cost N full redraws of N elements. RNW creates
  and fires JS timers through the UI thread too, so the player's scheduling
  pump starved meanwhile and the audio broke up. The patch posts one redraw
  per batch to the UI dispatcher, after the mount transaction.
- **`RenderableView::Render` leaked the previous D2D element on every redraw**:
  `com_ptr::put()` does not release what it overwrites (it only asserts, in a
  debug build, that there is nothing there). Each leaked element kept its
  whole document alive, so every redraw leaked a document, and each page turn
  was slower than the last.

Neither has been compiled here; there is no Windows toolchain on the Mac this
was written on. The Windows hunks were diffed by hand and the whole patch
checked with `git apply --check -R` against the installed package.

Note the filename: `patch-package` could not generate this one under Bun
(`Cannot read properties of undefined`), so the file is sudojo's, renamed to
patch-package's `name+version.patch` convention. It applies the same way.

## `react-native-macos+0.81.9.patch` — skip component classes a Mac build does not link

Codegen runs with `--targetPlatform ios` for a macOS build, so the generated
`RCTThirdPartyComponentsProvider.mm` lists every Fabric component of every
iOS-capable library — including `react-native-screens` and
`@react-native-community/slider`, which have no macOS implementation and are
left out of the macOS Pods. Their `NSClassFromString` lookups return nil, and a
nil inside the generated dictionary literal throws at the first render: the
app launched, loaded its bundle, and aborted in
`+[RCTThirdPartyComponentsProvider thirdPartyFabricComponents]`.

The patch changes the generator to emit name/class pairs and the template to
build the dictionary from the classes that actually exist. Excluding those two
libraries in `react-native.config.js` instead is not an option — see the
comment there: a `platforms` entry replaces the package's own map and broke the
Android build.

The same patch also carries two macOS fixes to React Native itself:

- **Dialogs are native sheets.** `RCTModalHostViewComponentView` compiles its
  whole implementation out on macOS, so `<Modal>` rendered inline in the main
  window. The patch adds the macOS half: each `<Modal>` is presented as a sheet
  on its host window, its React children mounted into the sheet's content view,
  the modal's state sized to the most the window allows, and the sheet shrunk
  to what the content actually drew. Escape sends `onRequestClose`.
  `@sudobility/components-rn`'s macOS `ModalHost` sends `presentation="sheet"`
  dialogs here and keeps menus and popovers in-tree.
- **Resizing the window no longer crashes.** `setNativeProps` replaced
  `ShadowNodeFamily::nativeProps_DEPRECATED` on the JS thread with no lock,
  while a window resize ran layout synchronously on the main thread and copied
  the same value inside `ShadowNode::clone` — a use-after-free in
  `folly::dynamic::type()`. Every read and write now happens under a new
  `nativePropsMutex_DEPRECATED`.

### …and reset a recycled view's hover state

The same patch file carries a second, unrelated fix, in
`RCTViewComponentView.mm`'s `prepareForRecycle`.

Fabric pools its native views. A view taken off screen while the pointer is
over it — a row clicked to leave the list it is in, which is the ordinary way
to leave a list — never receives `mouseExited:`, so it returns to the pool with
`_hasMouseOver` still `YES`. Handed out again for some other row,
`mouseEntered:` returns early on that flag and the row never reports the
pointer arriving: `onHoverIn` is simply not called. Which rows inherit a stale
view depends on the order the pool hands them back, so the symptom is a list
where some rows answer the pointer and some do not, apparently at random, and
a different set each time the list is rebuilt.

`prepareForRecycle` already resets `acceptsFirstMouse` and the rest of the
macOS view state; this adds the tracking area, `_hasMouseOver` and the
clip-view observer to it. Worth sending upstream.

patch-package cannot regenerate this file here — it refuses a project with no
npm or yarn lockfile, and this one has bun's. The hunk was diffed by hand
against the unmodified file and the whole patch checked with `git apply
--check` against a pristine `react-native-macos@0.81.9`.
