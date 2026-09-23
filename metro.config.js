const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Font-scaling cap injection (see src/theme/fontScaling.ts):
 *
 * React 19 removed `defaultProps` for function components and no longer
 * folds it for RN host components either, so a runtime patch of
 * `Text.defaultProps` does nothing on device. Instead of rewriting ~400
 * call sites, the bare `react-native` specifier is resolved to a shim that
 * re-exports the real module with `Text`/`TextInput` wrapped to inject
 * `maxFontSizeMultiplier` when a call site doesn't pass one.
 *
 * Mechanics:
 *  - 'react-native' (bare specifier, native platforms only) → the shim;
 *  - 'react-native$seven-real' (used ONLY inside the shim) → the real
 *    package, resolved directly so the re-entry can't loop back to the shim;
 *  - sub-path imports ('react-native/Libraries/...', which RN internals
 *    and some libraries use) pass through untouched;
 *  - web is untouched (react-native-web already clamps font scaling).
 *
 * `require.resolve('react-native/package.json')` at config time gives the
 * real package root regardless of where npm hoisted it.
 */
const REAL_RN_ENTRY = path.join(
  path.dirname(require.resolve('react-native/package.json')),
  'index.js'
);

const SHIM_PATH = path.resolve(__dirname, 'src/shims/react-native-font-cap.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web') {
    if (moduleName === 'react-native$seven-real') {
      return { type: 'sourceFile', filePath: REAL_RN_ENTRY };
    }
    if (moduleName === 'react-native') {
      return { type: 'sourceFile', filePath: SHIM_PATH };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
