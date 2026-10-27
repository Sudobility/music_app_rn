/**
 * Component tests, beside the vitest suite rather than replacing it.
 *
 * Two runners because they answer different questions and neither does both
 * well. Vitest runs the plain-TypeScript half — the document model, the store
 * wiring, the platform adapters — under `node`, fast, with no React Native at
 * all. Jest with the React Native preset is what can actually *render* a
 * component: it has the babel transform for React Native's Flow-typed source,
 * which vitest's esbuild pipeline does not.
 *
 * The split is by extension, so there is nothing to remember: `*.test.ts` is
 * vitest's, `*.test.tsx` is jest's.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.mocks.cjs'],
  setupFilesAfterEnv: ['./jest.setup.cjs'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
  transformIgnorePatterns: [
    // Bun stores deps in node_modules/.bun/<pkg>@<ver>/node_modules/<pkg>/,
    // so the usual pattern misses every one of them.
    // `@react-native-documents/picker` ships ESM (`export { … } from`), like
    // every other package in this list — added when `MenuFileCommands.tsx`
    // got its first test and pulled it in through `file-picker.ts`, the first
    // time anything under jest reached that import. `react-native-in-app-review`
    // is reached through `@sudobility/building_blocks_rn`'s barrel, which
    // `safe-edges.ts` imports for `useNotchPosition`.
    'node_modules/(?!(\\.bun/[^/]+/node_modules/)?(react-native|react-native-macos|@react-native|@react-native-community|@react-native-segmented-control|@react-native-documents|@react-navigation|nativewind|react-native-css-interop|react-native-reanimated|react-native-svg|react-native-heroicons|react-native-gesture-handler|react-native-safe-area-context|react-native-in-app-review|clsx|class-variance-authority|tailwind-merge|@testing-library|@sudobility|immer|zustand|nanoid|uuid|i18next|react-i18next|@moosiac|color|color-string|color-convert|color-name|simple-swizzle|is-arrayish|react-native-bottom-tabs|@bottom-tabs)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Skia draws through a native canvas that does not exist under jest; the
    // score view is checked by the app, not here.
    '^@shopify/react-native-skia$': '<rootDir>/jest.skia.cjs',
    // The Spatial stage: Skia plus `three`, neither of which jest can run.
    '^@sudobility/music_spatial_rn$': '<rootDir>/jest.spatial.cjs',
    // auth_lib's subpaths are reachable only through its `exports` map,
    // which jest's resolver does not read; the same files, by path.
    '^@sudobility/auth_lib/(oauth|signin|account)$':
      '<rootDir>/node_modules/@sudobility/auth_lib/dist/$1/index.js',
    '^@sudobility/auth_lib/auth-js$':
      '<rootDir>/node_modules/@sudobility/auth_lib/dist/auth/index.js',
    // `/signin` imports the Firebase JS SDK, whose ESM jest cannot load and
    // which no component test uses (each mocks `@/auth/AuthContext`).
    '^firebase/(app|auth)$': '<rootDir>/jest.firebase.cjs',
  },
};
