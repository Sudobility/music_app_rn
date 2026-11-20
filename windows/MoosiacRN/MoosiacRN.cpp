// MoosiacRN.cpp : Defines the entry point for the application.
//
// A React Native Windows *Composition* app: a packaged, full-trust Win32
// process hosting React Native in a WinAppSDK `AppWindow`, the template every
// other app in the family uses. It replaced a UWP/XAML project, and the
// reason was sign-in: Google's redirect for an installed app is a loopback
// address (`http://127.0.0.1:<port>/callback`), which an app container may
// not listen on, and its reversed-client-id URL scheme is longer than the 39
// characters a UWP protocol name allows. The shared `WebAuthModule` from
// building_blocks_rn runs that loopback flow, and it builds only here.
//
// What the XAML pages used to provide, this file now provides in Win32:
// the File/Edit menu bar (a native `HMENU` and an accelerator table, posting
// through `MenuBridgeModule`), and the main window itself. The Projects
// window is `WindowManagerModule`'s.

#include "pch.h"
#include "MoosiacRN.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"

#include "FilePickerModule.h"
#include "FileSystemModule.h"
#include "MenuBridgeModule.h"
#include "MoosiacNativeSlider.h"
#include "WindowsCanvas.h"
#include "PrintModule.h"
#include "SynthModule.h"
#include "WebAuthModule.h"
#include "WindowManagerModule.h"
#include "WindowTitleModule.h"

#include <iterator>

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
    winrt::MoosiacNativeSlider::implementation::RegisterMoosiacNativeSlider(packageBuilder);
    // The score is drawn by windows_canvas_rn's picture view; its measureText
    // module is picked up by AddAttributedModules above.
    WindowsCanvas::RegisterWindowsCanvas(packageBuilder);
  }
};

namespace {

winrt::Microsoft::ReactNative::ReactNativeHost g_host{nullptr};
winrt::Microsoft::ReactNative::ReactNativeWindow g_mainWindow{nullptr};
std::wstring g_appDirectory;
HWND g_mainHwnd = nullptr;
HACCEL g_accelerators = nullptr;
HHOOK g_acceleratorHook = nullptr;

// ---- The menu bar ----------------------------------------------------------
//
// Each item posts one command string to JS, the same strings macOS's
// storyboard posts and `src/app/menu-commands.ts` lists. JS owns what a
// command does; this file only owns where it is in the menu.

struct MenuCommand {
  UINT id;
  const wchar_t *command;
};

enum : UINT {
  ID_FILE_NEW = 40001,
  ID_FILE_OPEN,
  ID_NAV_PROJECTS,
  ID_NAV_SETTINGS,
  ID_FILE_SAVE,
  ID_FILE_SAVE_AS,
  ID_FILE_SNAPSHOTS,
  ID_IMPORT_MIDI,
  ID_IMPORT_MUSICXML,
  ID_IMPORT_TRACKER,
  ID_IMPORT_AUDIO,
  ID_EXPORT_MIDI,
  ID_EXPORT_MUSICXML,
  ID_EXPORT_XM,
  ID_EXPORT_WAV,
  ID_EXPORT_MP3,
  ID_FILE_PRINT,
  ID_EDIT_UNDO,
  ID_EDIT_REDO,
};

constexpr MenuCommand kMenuCommands[] = {
    {ID_FILE_NEW, L"file.new"},
    {ID_FILE_OPEN, L"file.open"},
    {ID_NAV_PROJECTS, L"nav.projects"},
    {ID_NAV_SETTINGS, L"nav.settings"},
    {ID_FILE_SAVE, L"file.save"},
    {ID_FILE_SAVE_AS, L"file.saveAs"},
    {ID_FILE_SNAPSHOTS, L"file.snapshots"},
    {ID_IMPORT_MIDI, L"import.midi"},
    {ID_IMPORT_MUSICXML, L"import.musicxml"},
    {ID_IMPORT_TRACKER, L"import.tracker"},
    {ID_IMPORT_AUDIO, L"import.audio"},
    {ID_EXPORT_MIDI, L"export.midi"},
    {ID_EXPORT_MUSICXML, L"export.musicxml"},
    {ID_EXPORT_XM, L"export.xm"},
    {ID_EXPORT_WAV, L"export.wav"},
    {ID_EXPORT_MP3, L"export.mp3"},
    {ID_FILE_PRINT, L"file.print"},
    {ID_EDIT_UNDO, L"edit.undo"},
    {ID_EDIT_REDO, L"edit.redo"},
};

const wchar_t *CommandFor(UINT id) noexcept {
  for (const auto &entry : kMenuCommands) {
    if (entry.id == id) return entry.command;
  }
  return nullptr;
}

HMENU BuildMenuBar() noexcept {
  HMENU importMenu = CreatePopupMenu();
  AppendMenuW(importMenu, MF_STRING, ID_IMPORT_MIDI, L"&MIDI…");
  AppendMenuW(importMenu, MF_STRING, ID_IMPORT_MUSICXML, L"Music&XML…");
  AppendMenuW(importMenu, MF_STRING, ID_IMPORT_TRACKER, L"M&odule…");
  AppendMenuW(importMenu, MF_STRING, ID_IMPORT_AUDIO, L"&Audio…");

  HMENU exportMenu = CreatePopupMenu();
  AppendMenuW(exportMenu, MF_STRING, ID_EXPORT_MIDI, L"&MIDI…");
  AppendMenuW(exportMenu, MF_STRING, ID_EXPORT_MUSICXML, L"Music&XML…");
  AppendMenuW(exportMenu, MF_STRING, ID_EXPORT_XM, L"M&odule…");
  AppendMenuW(exportMenu, MF_STRING, ID_EXPORT_WAV, L"&WAV…");
  AppendMenuW(exportMenu, MF_STRING, ID_EXPORT_MP3, L"MP&3…");

  HMENU fileMenu = CreatePopupMenu();
  AppendMenuW(fileMenu, MF_STRING, ID_FILE_NEW, L"&New\tCtrl+N");
  AppendMenuW(fileMenu, MF_STRING, ID_FILE_OPEN, L"&Open…\tCtrl+O");
  AppendMenuW(fileMenu, MF_STRING, ID_NAV_PROJECTS, L"&Projects…");
  AppendMenuW(fileMenu, MF_STRING, ID_NAV_SETTINGS, L"Se&ttings…");
  AppendMenuW(fileMenu, MF_SEPARATOR, 0, nullptr);
  AppendMenuW(fileMenu, MF_STRING, ID_FILE_SAVE, L"&Save\tCtrl+S");
  AppendMenuW(fileMenu, MF_STRING, ID_FILE_SAVE_AS, L"Save &As…\tCtrl+Shift+S");
  AppendMenuW(fileMenu, MF_STRING, ID_FILE_SNAPSHOTS, L"Snapshot &History…");
  AppendMenuW(fileMenu, MF_SEPARATOR, 0, nullptr);
  AppendMenuW(fileMenu, MF_POPUP, reinterpret_cast<UINT_PTR>(importMenu), L"&Import");
  AppendMenuW(fileMenu, MF_POPUP, reinterpret_cast<UINT_PTR>(exportMenu), L"&Export");
  AppendMenuW(fileMenu, MF_SEPARATOR, 0, nullptr);
  AppendMenuW(fileMenu, MF_STRING, ID_FILE_PRINT, L"P&rint…\tCtrl+P");

  HMENU editMenu = CreatePopupMenu();
  AppendMenuW(editMenu, MF_STRING, ID_EDIT_UNDO, L"&Undo\tCtrl+Z");
  AppendMenuW(editMenu, MF_STRING, ID_EDIT_REDO, L"&Redo\tCtrl+Y");

  HMENU menuBar = CreateMenu();
  AppendMenuW(menuBar, MF_POPUP, reinterpret_cast<UINT_PTR>(fileMenu), L"&File");
  AppendMenuW(menuBar, MF_POPUP, reinterpret_cast<UINT_PTR>(editMenu), L"&Edit");
  return menuBar;
}

HACCEL BuildAccelerators() noexcept {
  ACCEL accelerators[] = {
      {FVIRTKEY | FCONTROL, 'N', ID_FILE_NEW},
      {FVIRTKEY | FCONTROL, 'O', ID_FILE_OPEN},
      {FVIRTKEY | FCONTROL, 'S', ID_FILE_SAVE},
      {FVIRTKEY | FCONTROL | FSHIFT, 'S', ID_FILE_SAVE_AS},
      {FVIRTKEY | FCONTROL, 'P', ID_FILE_PRINT},
      {FVIRTKEY | FCONTROL, 'Z', ID_EDIT_UNDO},
      {FVIRTKEY | FCONTROL, 'Y', ID_EDIT_REDO},
  };
  return CreateAcceleratorTableW(accelerators, static_cast<int>(std::size(accelerators)));
}

// The main window's procedure, subclassed for the menu's WM_COMMAND: a menu
// click arrives with a high word of 0, an accelerator with 1.
LRESULT CALLBACK MainWindowSubclass(
    HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam, UINT_PTR subclassId, DWORD_PTR) {
  if (message == WM_COMMAND && HIWORD(wParam) <= 1) {
    if (const wchar_t *command = CommandFor(LOWORD(wParam))) {
      winrt::MoosiacRN::implementation::MenuBridgeModule::Emit(command);
      return 0;
    }
  }
  if (message == WM_NCDESTROY) {
    RemoveWindowSubclass(hwnd, MainWindowSubclass, subclassId);
  }
  return DefSubclassProc(hwnd, message, wParam, lParam);
}

// ReactNativeWin32App runs WinAppSDK's own message loop (`RunEventLoop`),
// which has no place to call TranslateAccelerator. A WH_GETMESSAGE hook on
// this thread sees each message as it is retrieved, translates key presses
// bound for the main window or its React content into WM_COMMAND, and turns
// the original into WM_NULL so the key is not also typed. Keys pressed in the
// Projects window are left alone — it has no menu bar.
LRESULT CALLBACK AcceleratorHook(int code, WPARAM wParam, LPARAM lParam) {
  if (code == HC_ACTION && wParam == PM_REMOVE && g_mainHwnd && g_accelerators) {
    auto *msg = reinterpret_cast<MSG *>(lParam);
    if ((msg->message == WM_KEYDOWN || msg->message == WM_SYSKEYDOWN) &&
        (msg->hwnd == g_mainHwnd || IsChild(g_mainHwnd, msg->hwnd)) &&
        TranslateAcceleratorW(g_mainHwnd, g_accelerators, msg)) {
      msg->message = WM_NULL;
    }
  }
  return CallNextHookEx(nullptr, code, wParam, lParam);
}

} // namespace

namespace MoosiacApp {

winrt::Microsoft::ReactNative::ReactNativeHost Host() noexcept {
  return g_host;
}

winrt::Microsoft::ReactNative::ReactNativeWindow MainWindow() noexcept {
  return g_mainWindow;
}

std::wstring AppDirectory() noexcept {
  return g_appDirectory;
}

void BringToFront(HWND hwnd) noexcept {
  if (!hwnd) return;
  if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
  SetForegroundWindow(hwnd);
}

} // namespace MoosiacApp

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE /* instance */, HINSTANCE, PSTR /* commandLine */, int /* showCmd */) {
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);
  g_appDirectory = appDirectory;

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};
  g_host = reactNativeWin32App.ReactNativeHost();

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{g_host.InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  // Set the name of the bundle file (without the .bundle extension)
  settings.JavaScriptBundleFile(L"index.windows");
  // Disable hot reload
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  // No source map inside the bundle: it triples this app's dev bundle to
  // ~90 MB, and the host's multipart reader takes minutes over that where it
  // takes seconds without — the window sat on "Loading". DevTools fetches the
  // map separately.
  settings.RequestInlineSourceMap(false);
  // Enable hot reload
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  // For Debug builds
  // Enable Direct Debugging of JS
  settings.UseDirectDebugger(true);
  // Enable the Developer Menu
  settings.UseDeveloperSupport(true);
#else
  // For Release builds:
  // Disable Direct Debugging of JS
  settings.UseDirectDebugger(false);
  // Disable the Developer Menu
  settings.UseDeveloperSupport(false);
#endif

  // Get the AppWindow so we can configure its initial title and size.
  // `WindowTitleModule` replaces the title with the open document's.
  g_mainWindow = reactNativeWin32App.ReactNativeWindow();
  auto appWindow{reactNativeWin32App.AppWindow()};
  appWindow.Title(L"Moosiac");
  // The title bar's icon. An AppWindow does not take the exe's icon
  // resource on its own, so it is handed that same icon here.
  appWindow.SetIcon(winrt::Microsoft::UI::GetIconIdFromIcon(
      LoadIconW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(IDI_ICON1))));
  appWindow.Resize({1280, 860});

  // The menu goes on before the window is first shown, so the first layout
  // already measures the client area below it.
  g_mainHwnd = winrt::Microsoft::UI::GetWindowFromWindowId(appWindow.Id());
  SetMenu(g_mainHwnd, BuildMenuBar());
  SetWindowSubclass(g_mainHwnd, MainWindowSubclass, 1, 0);
  g_accelerators = BuildAccelerators();
  g_acceleratorHook = SetWindowsHookExW(WH_GETMESSAGE, AcceleratorHook, nullptr, GetCurrentThreadId());

  // Closing the editor quits the app, as on macOS. The Projects window is
  // torn down here, while the dispatcher queue still runs — once `Start`
  // returns, the queue has been shut down under it.
  appWindow.Destroying([](auto const &, auto const &) {
    winrt::MoosiacRN::implementation::WindowManagerModule::Shutdown();
  });

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"MoosiacRN");

  // Start the app; returns when the main window has closed.
  reactNativeWin32App.Start();

  if (g_acceleratorHook) UnhookWindowsHookEx(g_acceleratorHook);
  if (g_accelerators) DestroyAcceleratorTable(g_accelerators);
  g_mainHwnd = nullptr;
  g_mainWindow = nullptr;
  g_host = nullptr;
  return 0;
}
