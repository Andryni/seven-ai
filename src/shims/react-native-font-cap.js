/**
 * Metro resolution shim for the `react-native` specifier on native
 * platforms (see metro.config.js). It re-exports the real react-native
 * module through a Proxy — preserving react-native's lazy getters — but
 * replaces `Text` and `TextInput` with versions that inject the global
 * OS-font-scaling cap (see src/theme/fontScaling.ts for why a runtime
 * defaultProps patch cannot work under React 19).
 *
 * The magic specifier 'react-native$seven-real' is rewritten by the custom
 * Metro resolver to the REAL react-native package. It must never be
 * imported anywhere else, and must not itself match the shim interception.
 *
 * Jest never sees this file: jest-expo resolves `react-native` through its
 * own module mapper, not Metro. Web skips the shim in the resolver, since
 * react-native-web already clamps scaling.
 *
 * Proxy on purpose: `{...RN}` would eagerly evaluate every lazy getter in
 * react-native's index.js (defeating lazy init and shifting require order
 * at startup), while the Proxy forwards untouched properties through the
 * original getters. The app and every dependency import from the bare
 * 'react-native' specifier, so this module's `module.exports` is what their
 * named imports bind to (Babel's CJS interop reads properties off it — each
 * access goes through the `get` trap).
 */

const RN = require('react-native$seven-real');
const { withFontScalingCap } = require('../theme/fontScaling');

let cappedText;
let cappedTextInput;

module.exports = new Proxy(RN, {
  get(target, prop) {
    if (prop === 'Text') {
      if (!cappedText) cappedText = withFontScalingCap(target.Text);
      return cappedText;
    }
    if (prop === 'TextInput') {
      if (!cappedTextInput) cappedTextInput = withFontScalingCap(target.TextInput);
      return cappedTextInput;
    }
    return target[prop];
  },
});
