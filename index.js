// WebGPU spike: three.js needs TextDecoder before it loads.
import 'fast-text-encoding';
// Configure the Firebase China proxy before anything initializes Firebase.
// Blank/unset means standard Firebase (the library holds no default). It is a
// fetch wrapper, so it covers the Firebase JS SDK — auth, on every platform —
// and not the native modules below, which reach Google directly.
import { setFirebaseProxy } from '@sudobility/di';
setFirebaseProxy(process.env.FIREBASE_PROXY);

// Native Firebase (analytics, crashlytics, messaging) on iOS
// and Android; on the desktops, analytics through GA4's Measurement Protocol.
// The same `src/di/initializeServices` sudojo_app_rn and svgr_app_rn start.
// Not awaited: nothing waits on it, and a failure must not stop the app.
import { initializeAllServices } from './src/di/initializeServices';
initializeAllServices().catch(error =>
  console.error('[firebase] native Firebase failed to start:', error),
);

import { AppRegistry } from 'react-native';
import App from './src/app/App';
import ProjectsWindow from './src/app/ProjectsWindow';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
// The desktop Projects window's own root — a separate native window, given
// its own RCTRootView under this module name. See `ProjectsWindow.tsx`.
AppRegistry.registerComponent('MoosiacProjects', () => ProjectsWindow);
