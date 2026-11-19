import UIKit
import FirebaseCore
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  // The window and the `startReactNative` call live in `SceneDelegate` now —
  // Xcode 27's iOS 27 SDK crashes at launch (`EXC_BREAKPOINT` in
  // `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) for an app
  // with no scene adoption at all, where earlier SDKs only warned. The factory
  // is still built here, once, at the same point it always was; the scene
  // delegate reaches back into it through `UIApplication.shared.delegate`.
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Native Firebase — analytics, crashlytics, messaging, remote config —
    // configured from `GoogleService-Info.plist`. Auth is not this: it runs
    // on Firebase's JS SDK, configured from `.env` (see `src/auth`).
    FirebaseApp.configure()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    self.launchOptions = launchOptions

    NotificationCenter.default.addObserver(
      forName: Self.menuAvailability, object: nil, queue: .main
    ) { [weak self] note in
      self?.enabledCommands = (note.userInfo?["commands"] as? [String]).map(Set.init)
      UIMenuSystem.main.setNeedsRevalidate()
    }

    return true
  }

  // MARK: - Menu bar

  /*
    The iPad's menu bar (and the ⌘ shortcut overlay), the same menu the Mac
    app has in `macos/music_app_rn-macOS/Base.lproj/Main.storyboard`. Each item
    posts a command that `MoosiacMenuBridge.m` hands to JavaScript as the same
    `menuCommand` event the Mac sends, so `src/app/menu-commands.ts` and every
    listener behind it serve both unchanged.

    What the Mac menu has and this one does not: Open Recent, which on the Mac
    is AppKit's `NSDocumentController` and has no UIKit counterpart.
  */
  static let menuCommand = Notification.Name("MoosiacMenuCommand")
  static let menuAvailability = Notification.Name("MoosiacMenuAvailability")

  /*
    The commands JavaScript can answer right now (`useMenuAvailability`), which
    `canPerformAction` enables; `nil` until it first reports, which enables
    everything. Without it Export, Print and Undo stayed enabled on screens
    where the editor that answers them is not showing, and did nothing.
  */
  private var enabledCommands: Set<String>?

  private static let commandsBySelector: [Selector: String] = [
    #selector(moosiacFileNew(_:)): "file.new",
    #selector(moosiacFileOpen(_:)): "file.open",
    #selector(moosiacFileSave(_:)): "file.save",
    #selector(moosiacFileSaveAs(_:)): "file.saveAs",
    #selector(moosiacFileSnapshots(_:)): "file.snapshots",
    #selector(moosiacFilePrint(_:)): "file.print",
    #selector(moosiacImportMidi(_:)): "import.midi",
    #selector(moosiacImportMusicXml(_:)): "import.musicxml",
    #selector(moosiacImportTracker(_:)): "import.tracker",
    #selector(moosiacImportAudio(_:)): "import.audio",
    #selector(moosiacExportMidi(_:)): "export.midi",
    #selector(moosiacExportMusicXml(_:)): "export.musicxml",
    #selector(moosiacExportXm(_:)): "export.xm",
    #selector(moosiacExportWav(_:)): "export.wav",
    #selector(moosiacExportMp3(_:)): "export.mp3",
    #selector(moosiacEditUndo(_:)): "edit.undo",
    #selector(moosiacEditRedo(_:)): "edit.redo",
    #selector(cut(_:)): "edit.cut",
    #selector(copy(_:)): "edit.copy",
    #selector(paste(_:)): "edit.paste",
    #selector(delete(_:)): "edit.delete",
    #selector(selectAll(_:)): "edit.selectAll",
    #selector(moosiacNavProjects(_:)): "nav.projects",
    #selector(moosiacNavSettings(_:)): "nav.settings",
    #selector(moosiacNavDocs(_:)): "nav.docs",
  ]

  private func post(_ command: String) {
    NotificationCenter.default.post(
      name: Self.menuCommand, object: nil, userInfo: ["command": command])
  }

  override func buildMenu(with builder: UIMenuBuilder) {
    super.buildMenu(with: builder)
    guard builder.system == .main else { return }

    func item(
      _ title: String, _ action: Selector, _ key: String? = nil,
      _ modifiers: UIKeyModifierFlags = .command
    ) -> UICommand {
      guard let key else { return UICommand(title: title, action: action) }
      return UIKeyCommand(title: title, action: action, input: key, modifierFlags: modifiers)
    }
    func group(_ children: [UIMenuElement]) -> UIMenu {
      UIMenu(title: "", options: .displayInline, children: children)
    }

    let appName =
      Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Moosiac"

    // App menu: Settings… where the system's own item would open this app's
    // page in the Settings app — the Mac's Preferences….
    builder.replace(
      menu: .preferences,
      with: UIMenu(
        title: "", identifier: .preferences, options: .displayInline,
        children: [item("Settings…", #selector(moosiacNavSettings(_:)), ",")]))

    // File, in the Mac's order. Close is the system's (it closes the window).
    let close = builder.menu(for: .close)
    builder.replace(
      menu: .file,
      with: UIMenu(
        title: "File", identifier: .file,
        children: [
          group([
            item("New", #selector(moosiacFileNew(_:)), "n"),
            item("Open…", #selector(moosiacFileOpen(_:)), "o"),
            item("Projects…", #selector(moosiacNavProjects(_:))),
          ]),
          group([close].compactMap { $0 } + [
            item("Save", #selector(moosiacFileSave(_:)), "s"),
            item("Save As…", #selector(moosiacFileSaveAs(_:)), "s", [.command, .shift]),
          ]),
          group([item("Snapshot History…", #selector(moosiacFileSnapshots(_:)))]),
          group([
            UIMenu(
              title: "Import",
              image: UIImage(systemName: "square.and.arrow.down"),
              children: [
                item("MIDI…", #selector(moosiacImportMidi(_:))),
                item("MusicXML…", #selector(moosiacImportMusicXml(_:))),
                item("Module…", #selector(moosiacImportTracker(_:))),
                item("Audio…", #selector(moosiacImportAudio(_:))),
              ]),
            UIMenu(
              title: "Export",
              image: UIImage(systemName: "square.and.arrow.up"),
              children: [
                item("MIDI…", #selector(moosiacExportMidi(_:))),
                item("MusicXML…", #selector(moosiacExportMusicXml(_:))),
                item("Module…", #selector(moosiacExportXm(_:))),
                item("WAV…", #selector(moosiacExportWav(_:))),
                item("MP3…", #selector(moosiacExportMp3(_:))),
              ]),
          ]),
          group([item("Print…", #selector(moosiacFilePrint(_:)), "p")]),
        ]))

    // Edit: the score's Undo and Redo, then the system's Cut, Copy, Paste,
    // Delete and Select All (`.standardEdit`) — a focused text field answers
    // those itself, and with none focused they reach the overrides below.
    builder.replace(
      menu: .undoRedo,
      with: UIMenu(
        title: "", identifier: .undoRedo, options: .displayInline,
        children: [
          item("Undo", #selector(moosiacEditUndo(_:)), "z"),
          item("Redo", #selector(moosiacEditRedo(_:)), "z", [.command, .shift]),
        ]))
    // Nothing the Mac's menus have, and nothing this app answers.
    for menu: UIMenu.Identifier in [
      .find, .replace, .share, .textStyle, .spelling, .substitutions,
      .transformations, .speech, .format, .toolbar, .sidebar,
    ] {
      builder.remove(menu: menu)
    }

    // Help: the app's own Docs tab. There is no help book.
    builder.replaceChildren(ofMenu: .help) { _ in
      [item("\(appName) Help", #selector(self.moosiacNavDocs(_:)), "?", [.command, .shift])]
    }
  }

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if let command = Self.commandsBySelector[action] {
      return enabledCommands?.contains(command) ?? true
    }
    return super.canPerformAction(action, withSender: sender)
  }

  @objc func moosiacFileNew(_ sender: Any?) { post("file.new") }
  @objc func moosiacFileOpen(_ sender: Any?) { post("file.open") }
  @objc func moosiacFileSave(_ sender: Any?) { post("file.save") }
  @objc func moosiacFileSaveAs(_ sender: Any?) { post("file.saveAs") }
  @objc func moosiacFileSnapshots(_ sender: Any?) { post("file.snapshots") }
  @objc func moosiacFilePrint(_ sender: Any?) { post("file.print") }
  @objc func moosiacImportMidi(_ sender: Any?) { post("import.midi") }
  @objc func moosiacImportMusicXml(_ sender: Any?) { post("import.musicxml") }
  @objc func moosiacImportTracker(_ sender: Any?) { post("import.tracker") }
  @objc func moosiacImportAudio(_ sender: Any?) { post("import.audio") }
  @objc func moosiacExportMidi(_ sender: Any?) { post("export.midi") }
  @objc func moosiacExportMusicXml(_ sender: Any?) { post("export.musicxml") }
  @objc func moosiacExportXm(_ sender: Any?) { post("export.xm") }
  @objc func moosiacExportWav(_ sender: Any?) { post("export.wav") }
  @objc func moosiacExportMp3(_ sender: Any?) { post("export.mp3") }
  @objc func moosiacEditUndo(_ sender: Any?) { post("edit.undo") }
  @objc func moosiacEditRedo(_ sender: Any?) { post("edit.redo") }
  @objc func moosiacNavProjects(_ sender: Any?) { post("nav.projects") }
  @objc func moosiacNavSettings(_ sender: Any?) { post("nav.settings") }
  @objc func moosiacNavDocs(_ sender: Any?) { post("nav.docs") }

  override func cut(_ sender: Any?) { post("edit.cut") }
  override func copy(_ sender: Any?) { post("edit.copy") }
  override func paste(_ sender: Any?) { post("edit.paste") }
  override func delete(_ sender: Any?) { post("edit.delete") }
  override func selectAll(_ sender: Any?) { post("edit.selectAll") }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    let provider = RCTBundleURLProvider.sharedSettings()
    // Metro dev-server host/port come from .env (METRO_HOST / METRO_PORT),
    // injected into Info.plist at build time by the "Inject Metro Dev Server
    // (.env)" build phase — nothing hardcoded here. On a physical device the
    // host must be the dev Mac's LAN IP; the simulator can use localhost.
    // Falls back to RN's default (localhost:8081) when the keys are absent.
    if let host = Bundle.main.object(forInfoDictionaryKey: "MetroHost") as? String,
       let port = Bundle.main.object(forInfoDictionaryKey: "MetroPort") as? String,
       !host.isEmpty, !port.isEmpty {
      provider.jsLocation = "\(host):\(port)"
    }
    return provider.jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
