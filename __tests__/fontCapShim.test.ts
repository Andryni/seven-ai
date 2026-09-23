// This file loads CommonJS artifacts on purpose — the Metro shim, metro.config.js
// and the jest.mock factories that stand in for Metro's module registry — so
// `require` is the point here, not an accident.
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Covers the pieces that make the font cap work on a real device and that the
 * unit tests around `withFontScalingCap` alone cannot reach:
 *
 *  - `metro.config.js` must resolve the bare `react-native` specifier to the
 *    shim on native platforms, the magic `react-native$seven-real` specifier to
 *    the real package (no re-entry loop), and leave sub-path imports and web
 *    untouched;
 *  - `src/shims/react-native-font-cap.js` must re-export the real module with
 *    exactly `Text`/`TextInput` wrapped, cache the wrappers, and forward every
 *    other property through the original getters.
 *
 * Jest resolves `react-native` through its own mapper (not Metro), so the shim
 * is exercised here by mapping its private specifier to the Jest-mocked
 * react-native, which is what the shim would get from Metro on device.
 */

jest.mock(
  'react-native$seven-real',
  () => require('react-native'),
  { virtual: true }
);

// metro.config.js only needs the resolver hook from this module; loading the
// real one drags Metro's ESM toolchain into Jest for no benefit.
jest.mock('expo/metro-config', () => ({ getDefaultConfig: () => ({ resolver: {} }) }));

const path = require('path');
const RN = require('react-native');
const shim = require('../src/shims/react-native-font-cap');
const metroConfig = require('../metro.config.js');

describe('metro resolver wiring', () => {
  const context = {
    resolveRequest: (ctx: unknown, moduleName: string) => ({
      type: 'sourceFile',
      filePath: `passthrough:${moduleName}`,
    }),
  };

  const resolve = (moduleName: string, platform: string) =>
    metroConfig.resolver.resolveRequest(context, moduleName, platform);

  it('routes the bare react-native specifier to the shim on native platforms', () => {
    for (const platform of ['android', 'ios']) {
      const result = resolve('react-native', platform);
      expect(result.filePath).toBe(
        path.resolve(__dirname, '..', 'src', 'shims', 'react-native-font-cap.js')
      );
    }
  });

  it('routes the shim’s private specifier straight to the real package', () => {
    const result = resolve('react-native$seven-real', 'android');
    expect(result.filePath).not.toContain('shims');
    expect(result.filePath.endsWith(path.join('react-native', 'index.js'))).toBe(true);
  });

  it('leaves sub-path imports (used by RN internals and libraries) alone', () => {
    const result = resolve('react-native/Libraries/Text/TextNativeComponent', 'android');
    expect(result.filePath).toBe('passthrough:react-native/Libraries/Text/TextNativeComponent');
  });

  it('does not touch web, where react-native-web already clamps scaling', () => {
    expect(resolve('react-native', 'web').filePath).toBe('passthrough:react-native');
  });
});

describe('react-native-font-cap shim', () => {
  it('wraps Text and TextInput', () => {
    expect(shim.Text).not.toBe(RN.Text);
    expect(shim.Text.displayName).toBe('FontScalingCapped(Text)');
    expect(shim.TextInput.displayName).toBe('FontScalingCapped(TextInput)');
  });

  it('returns the same wrapper on every access, so React never remounts', () => {
    // A fresh component identity per property read would remount every Text on
    // each render — the Proxy must cache.
    expect(shim.Text).toBe(shim.Text);
    expect(shim.TextInput).toBe(shim.TextInput);
  });

  it('forwards every other export through the real module', () => {
    expect(shim.View).toBe(RN.View);
    expect(shim.Platform).toBe(RN.Platform);
    expect(shim.StyleSheet).toBe(RN.StyleSheet);
    expect(shim.Pressable).toBe(RN.Pressable);
  });

  it('leaves the real components unmutated', () => {
    expect((RN.Text as unknown as { displayName?: string }).displayName).not.toBe(
      'FontScalingCapped(Text)'
    );
  });
});
