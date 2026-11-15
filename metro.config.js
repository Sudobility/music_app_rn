const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const root = __dirname;
const appNodeModules = path.join(root, 'node_modules');
const linkedSpatialPackages = [
  '@sudobility/music_spatial_core',
  '@sudobility/music_spatial_rn',
].flatMap(name => {
  const installed = path.join(appNodeModules, name);
  try {
    return fs.lstatSync(installed).isSymbolicLink()
      ? [fs.realpathSync(installed)]
      : [];
  } catch {
    return [];
  }
});
const rnwPath = path.dirname(
  require.resolve('react-native-windows/package.json'),
);

const pathPattern = directory =>
  directory
    .split(/[\\/]/)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\\\/]');

/** Native and generated build output must not be watched by Metro. */
const blockList = new RegExp(
  [
    /[\\/]windows[\\/]build[\\/].*/,
    /[\\/]windows[\\/]MoosiacRN[\\/]Bundle[\\/].*/,
    /[\\/]macos[\\/]build[\\/].*/,
    /[\\/]macos[\\/]Pods[\\/].*/,
    /[\\/]ios[\\/]build[\\/].*/,
    /[\\/]ios[\\/]Pods[\\/].*/,
    /[\\/]android[\\/]build[\\/].*/,
    /[\\/]android[\\/]app[\\/]build[\\/].*/,
    /[\\/]android[\\/]\.gradle[\\/].*/,
    /[\\/]\.git[\\/].*/,
    new RegExp(
      `${pathPattern(root)}[\\\\/]windows[\\\\/](?:x64|ARM64|Win32)[\\\\/].*`,
    ),
    new RegExp(
      `${pathPattern(
        root,
      )}[\\\\/]windows[\\\\/][^\\\\/]+[\\\\/](?:bin|obj|Generated Files)[\\\\/].*`,
    ),
    new RegExp(`${pathPattern(rnwPath)}[\\\\/](?:build|target)[\\\\/].*`),
    /.*\.ProjectImports\.zip/,
    /[\\/]metro[^\\/]*\.log$/,
  ]
    .map(pattern => pattern.source)
    .join('|'),
);

/**
 * Keep the shared package-export conditions and NativeWind configuration used
 * by iOS, Android and macOS while also supporting the Windows resolver.
 */
const config = mergeConfig(getDefaultConfig(root), {
  resolver: {
    unstable_enablePackageExports: true,
    blockList,
    // Metro's default platforms are ['android','ios']; Windows must be added
    // or none of the app's `.windows.*` overrides resolve (the Windows score
    // canvas, tab bar, safe-area and the react-native-localize-free device
    // locale all live in `.windows` files).
    platforms: ['ios', 'android', 'windows'],
    // Linked spatial packages have their own node_modules for development.
    // Resolve their peer dependencies from this app to keep one React/RN copy.
    resolveRequest: (context, moduleName, platform) => {
      const fromLinkedSpatial = linkedSpatialPackages.some(directory =>
        context.originModulePath.startsWith(directory + path.sep),
      );
      const scopedContext = fromLinkedSpatial
        ? {
            ...context,
            disableHierarchicalLookup: true,
            nodeModulesPaths: [appNodeModules],
          }
        : context;
      // react-native-localize has no Windows native module; redirect it to a
      // local stub so `require('react-native-localize')` never reaches
      // TurboModuleRegistry.getEnforcing('RNLocalize') (which throws). The
      // shared helper's own `.windows` variant is bypassed by explicit-`.js`
      // ESM imports, so the redirect lives here.
      if (platform === 'windows' && moduleName === 'react-native-localize') {
        return {
          type: 'sourceFile',
          filePath: path.join(root, 'src', 'shims', 'react-native-localize.windows.js'),
        };
      }
      // A custom resolver must retain the out-of-tree platform redirect.
      const nativePackage = {
        macos: 'react-native-macos',
        windows: 'react-native-windows',
      }[platform];
      if (
        nativePackage &&
        (moduleName === 'react-native' ||
          moduleName.startsWith('react-native/'))
      ) {
        return context.resolveRequest(
          scopedContext,
          nativePackage + moduleName.slice('react-native'.length),
          platform,
        );
      }
      const resolved = context.resolveRequest(scopedContext, moduleName, platform);
      // Published @sudobility dist barrels re-export with explicit `.js`
      // extensions (`export { X } from './X.js'`), which defeats Metro's
      // `.windows.js` platform resolution — so the Skia/RNLocalize-free
      // `.windows` variants that ship right beside them never load on Windows.
      // When a `.windows.js` sibling of the resolved file exists, prefer it:
      // the generic equivalent of the suffix resolution the extension bypassed.
      if (
        platform === 'windows' &&
        resolved &&
        resolved.type === 'sourceFile' &&
        typeof resolved.filePath === 'string' &&
        resolved.filePath.endsWith('.js') &&
        !resolved.filePath.endsWith('.windows.js') &&
        resolved.filePath.includes('@sudobility')
      ) {
        const windowsVariant =
          resolved.filePath.slice(0, -'.js'.length) + '.windows.js';
        if (fs.existsSync(windowsVariant)) {
          return { type: 'sourceFile', filePath: windowsVariant };
        }
      }
      return resolved;
    },
  },
  watchFolders: [root, ...linkedSpatialPackages],
});

module.exports = withNativeWind(config, { input: './global.css' });
