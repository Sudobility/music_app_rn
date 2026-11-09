import UIKit
import React

/// Owns the window, on the scene it belongs to.
///
/// `AppDelegate` still builds the React Native factory once, at launch — the
/// same object, the same moment as before this file existed. Only where the
/// window comes from moved: `UIWindow(windowScene:)` rather than
/// `UIWindow(frame: UIScreen.main.bounds)`, because a window with no scene is
/// exactly what iOS 27 now refuses to run.
///
/// The launch look — red (`LaunchScreen.storyboard`'s `LaunchBackground`-red)
/// with the white logo — is the design theme's `bg-primary`, so it flows
/// straight into the app root with no flash. The storyboard is shown by the
/// system until React's first frame, which on a dev build is the whole of the
/// Metro bundle; nothing here has to hold it.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    // A link that launched the app arrives with the scene, not in the
    // application's launch options, which is where React Native's
    // `Linking.getInitialURL()` looks for it.
    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }

    factory.startReactNative(
      withModuleName: "MoosiacRN",
      in: window,
      launchOptions: launchOptions
    )
  }

  /// A link opened while the app runs — `moosiac://open?path=…`, or the store
  /// screenshot links `app_store/scripts/capture.sh` sends. With a scene
  /// delegate these arrive here rather than at the application delegate, so
  /// React Native's `Linking` hears nothing unless they are handed on.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }
}
