const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const root = __dirname;
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
const defaults = getDefaultConfig(root);
// WebGPU spike: one three.js for the whole bundle, the WebGPU build (which
// includes the core), so music_spatial_core's geometries and the renderer
// share classes. And `.glb` models as assets.
const threeRoot = path.join(root, 'node_modules/three');
const config = mergeConfig(defaults, {
  resolver: {
    unstable_enablePackageExports: true,
    blockList,
        resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'three' || moduleName === 'three/webgpu') {
        return {
          filePath: path.join(threeRoot, 'build/three.webgpu.js'),
          type: 'sourceFile',
        };
      }
      // The spike's WebGPU stage in place of music_spatial_rn's Skia one, on
      // macOS only: SpatialView and everything around it is the library's.
      if (
        platform === 'macos' &&
        moduleName === './SpatialCanvas' &&
        context.originModulePath.includes(
          path.join('@sudobility', 'music_spatial_rn'),
        )
      ) {
        return {
          filePath: path.join(root, 'src/features/spatial/WebGPUSpatialCanvas.tsx'),
          type: 'sourceFile',
        };
      }
      // A config with its own resolveRequest loses the CLI's out-of-tree
      // platform redirect, so it is restated here.
      const outOfTree = { macos: 'react-native-macos', windows: 'react-native-windows' }[platform];
      if (
        outOfTree &&
        (moduleName === 'react-native' || moduleName.startsWith('react-native/'))
      ) {
        return context.resolveRequest(
          context,
          outOfTree + moduleName.slice('react-native'.length),
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  watchFolders: [root],
});

module.exports = withNativeWind(config, { input: './global.css' });
