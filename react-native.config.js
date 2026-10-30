/**
 * Which native dependency belongs to which platform.
 *
 * Two of them are platform-specific for the same underlying reason — a file
 * picker is a different control on every OS, and neither package pretends
 * otherwise:
 *
 * - `@react-native-documents/picker` wraps `UIDocumentPickerViewController` and
 *   Android's Storage Access Framework. Its podspec declares `:ios` only, so
 *   listing it for macOS would ask CocoaPods to install something that does not
 *   build there.
 * - `@moosiac/file-picker` is the Mac half — `NSOpenPanel` and `NSSavePanel`.
 *   It needs no entry here: it declares `macos` and nothing else in its own
 *   `react-native.config.js`, which is how a package says which platforms it
 *   has native code for. Repeating that here would *replace* its platform map
 *   rather than adding to it, and the entry would vanish from autolinking
 *   entirely — which is exactly what happened.
 *
 * `@react-native-community/slider` and
 * `@react-native-segmented-control/segmented-control` need **no entry**, and
 * that is worth stating because adding one looks obviously right and is not.
 * Neither has a macOS implementation — both podspecs are `:ios, :visionos` —
 * so autolinking already leaves them out of the macOS Pods, exactly as it does
 * `react-native-screens`; each has a `.macos` variant in `src/` that a Mac
 * build resolves instead. Excluding the slider *here* actively broke Android:
 * this map **replaces** a package's own rather than merging into it, so the
 * entry took `sourceDir` with it and the `cmakeListsPath` the package declares
 * arrived at CMake as a bare relative path — `add_subdirectory given source
 * "src/main/jni/" which is not an existing directory`, and then
 * `react_codegen_RNCSlider ... is not built by this project`. A package that
 * declares its own platforms is one to leave alone.
 *
 * `react-native-screens` needs no entry: it publishes no macOS implementation,
 * so autolinking already leaves it out of the macOS Pods. What that *does* mean
 * is that the navigator has to be JS-backed on the Mac — see `Navigation.tsx`.
 */
const path = require('path');

/**
 * Switch a package off on the given platforms while keeping the package's own
 * iOS and Android settings. Autolinking merges this file over
 * the library's config shallowly: a bare `platforms: { macos: null }` REPLACES
 * the library's `platforms`, dropping settings it declares for Android —
 * since react-native-firebase 26 that includes `cmakeListsPath`, without
 * which the Android build fails in CMake with "not an existing directory".
 * Returns a one-entry object so it can be spread into `dependencies`.
 */
function withoutPlatforms(packageName, dropped) {
  // Loaded by file path: the package's `exports` map does not expose this file.
  const packageDir = path.join(__dirname, 'node_modules', packageName);
  const library = require(path.join(packageDir, 'react-native.config.js'));
  const platforms = library.dependency?.platforms ?? {};
  // Spreading is not enough on its own: the CLI joins a LIBRARY's
  // `cmakeListsPath` to its `sourceDir`, but takes a user-supplied one as
  // written, so the relative path the library declares reached Gradle bare
  // (`add_subdirectory("./src/.../generated/jni/")` — "not an existing
  // directory"). Resolved here against the package's `android/` instead.
  const android = platforms.android
    ? {
        ...platforms.android,
        ...(platforms.android.cmakeListsPath
          ? {
              cmakeListsPath: path.join(
                packageDir,
                platforms.android.sourceDir ?? 'android',
                platforms.android.cmakeListsPath,
              ),
            }
          : {}),
      }
    : undefined;
  return {
    [packageName]: {
      platforms: {
        ...platforms,
        ...(android ? { android } : {}),
        ...Object.fromEntries(dropped.map(platform => [platform, null])),
      },
    },
  };
}

function nativeFirebaseOnMobileOnly(packageName) {
  return withoutPlatforms(packageName, ['macos', 'windows']);
}

const config = {
  dependencies: {
    // This package's iOS slider is the community slider (the custom
    // MoosiacNativeSlider component is implemented for macOS/Windows only).
    // Its codegen metadata currently advertises an iOS Fabric component
    // without an iOS ComponentView class, which makes RN crash while
    // constructing the third-party Fabric registry. Keep it linked for the
    // macOS build, where the native implementation exists.
    ...(!process.env.RN_MACOS_BUILD
      ? { '@sudobility/components-rn': { platforms: { ios: null } } }
      : {}),
    '@react-native-documents/picker': {
      platforms: { macos: null, windows: null },
    },
    // Native Firebase is iOS and Android only; the desktops run Firebase's
    // JS SDK and have no analytics. Spread, not replaced — see the note above
    // on what a bare `platforms` map does to a package's Android settings.
    ...nativeFirebaseOnMobileOnly('@react-native-firebase/app'),
    ...nativeFirebaseOnMobileOnly('@react-native-firebase/analytics'),
    ...nativeFirebaseOnMobileOnly('@react-native-firebase/crashlytics'),
    ...nativeFirebaseOnMobileOnly('@react-native-firebase/messaging'),
    // The native tab bar (a real UITabBarController / Material bar, via
    // react-native-bottom-tabs) is iOS and Android only; the desktops resolve
    // `MainTabs.macos.tsx` / `MainTabs.windows.tsx` and never bundle this
    // module. Its podspec declares `s.osx`, so without this entry autolinking
    // would install it into the macOS Pods for a module nothing on the Mac
    // loads. The mobile side replaces `@react-navigation/bottom-tabs/unstable`,
    // whose react-native-screens `RNSTabBarController` aborts on launch under
    // RN 0.83 (`assertExactlyOneFocusedTab`). sudojo_app_rn uses this package.
    'react-native-bottom-tabs': { platforms: { macos: null, windows: null } },
    '@shopify/react-native-skia': { platforms: { windows: null } },
    'react-native-audio-api': { platforms: { windows: null } },
    // Its Windows project is UWP-only (Paper), which cannot link into this
    // Composition app — and Windows does not use it: the desktops navigate
    // with the JS stack (`createAppStackNavigator.ts`).
    ...withoutPlatforms('react-native-screens', ['windows']),
    'react-native-share': { platforms: { macos: null, windows: null } },
    '@react-native-community/slider': { platforms: { macos: null, windows: null } },
    // Google's SDK is iOS and Android only; the desktops sign in through the
    // system browser (`WebAuth`). Sign in with Apple is offered on iOS and
    // Android only, so its module is left out of the desktop builds too.
    '@react-native-google-signin/google-signin': {
      platforms: { macos: null, windows: null },
    },
    '@invertase/react-native-apple-authentication': {
      platforms: { macos: null, windows: null },
    },
    // Windows resolves device-language.windows.ts and uses Intl directly.
    'react-native-localize': { platforms: { windows: null } },
  },
  project: {
    macos: { sourceDir: 'macos' },
    windows: {
      sourceDir: 'windows',
      solutionFile: 'MoosiacRN.sln',
      project: { projectFile: 'MoosiacRN\\MoosiacRN.vcxproj' },
    },
    /*
      `automaticPodsInstallation: false`, and it is the *declaration* of this
      key that makes it necessary.

      `ios` is auto-detected, so the sibling apps declare no `project.ios` at
      all — and because the CLI's schema only applies defaults inside a
      declared object, their `automaticPodsInstallation` stays undefined and
      the pods step never runs. Declaring `ios` here opts this app in, since
      the schema default is `true`, and `run-ios` then tries `bundle exec pod
      install` for every launch. That needs Ruby >= 3.0 for its `ffi`, which
      is not what is on this machine, so every simulator run died at
      "Installing CocoaPods" with the real reason swallowed.

      Pods are installed explicitly with `pod install` when the native deps
      change, not on every run, which is what the other apps do implicitly.
    */
    ios: { sourceDir: 'ios', automaticPodsInstallation: false },
  },
};

/*
  A macOS build: every package switched off for macOS is switched off for iOS
  too, because a macOS build reads the iOS settings.

  react-native-macos autolinks pods from each package's `platforms.ios`, and
  codegen skips a library only when its config for the platform it generates,
  `ios`, is `null`. So `macos: null` alone reaches neither: the Mac app
  autolinked RNFirebase and the rest, and codegen listed their TurboModules in
  `RCTModuleProviders` with no class behind them, a fatal "Module provider
  RNFBAnalyticsModule cannot be found in the runtime" on a Debug launch.

  `RN_MACOS_BUILD=1` is set by `macos/Podfile` (for `pod install`) and
  `macos/.xcode.env` (for the codegen build phase, which re-runs on every
  build). iOS and Android builds never set it, and keep `ios` untouched.
*/
if (process.env.RN_MACOS_BUILD === '1') {
  for (const dependency of Object.values(config.dependencies)) {
    if (dependency.platforms && dependency.platforms.macos === null) {
      dependency.platforms = { ...dependency.platforms, ios: null };
    }
  }
}

module.exports = config;
