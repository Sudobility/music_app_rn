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
    // Linked spatial packages have their own node_modules for development.
    // Resolve their peer dependencies from this app to keep one React/RN copy.
    resolveRequest: (context, moduleName, platform) => {
      // The WebGPU Spatial canvas pulls three.js through `three/webgpu`, while
      // music_spatial_core builds geometry from `three`. Both must resolve to
      // the one WebGPU build so the renderer and the geometries share classes.
      if (moduleName === 'three' || moduleName === 'three/webgpu') {
        return {
          filePath: path.join(appNodeModules, 'three/build/three.webgpu.js'),
          type: 'sourceFile',
        };
      }
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
      return context.resolveRequest(scopedContext, moduleName, platform);
    },
  },
  watchFolders: [root, ...linkedSpatialPackages],
});

module.exports = withNativeWind(config, { input: './global.css' });
