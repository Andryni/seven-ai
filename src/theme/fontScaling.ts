import React from 'react';

/**
 * Global cap for OS-driven font scaling (Settings > Accessibility > Larger
 * Text / Font size). Without a cap, `<Text>`/`<TextInput>` grow unbounded
 * with the system font size and this UI's fixed-height widget tiles (see
 * `WidgetCanvas`), dock chips, and terminal-style dense layouts start
 * clipping or overlapping well before 2x scale.
 *
 * 1.3 is a middle ground: a "Larger Text" user still gets meaningfully
 * bigger type (30%) for readability, without letting the most extreme OS
 * settings (2x-3x) break layouts that assume roughly-fixed text heights.
 * This is a resize *cap*, not a resize *disable* — `allowFontScaling` stays
 * at its default of `true` everywhere, so scaling still applies up to the
 * cap. An explicit `maxFontSizeMultiplier` prop on a call site still wins,
 * and libraries that already pass their own value keep theirs.
 */
export const MAX_FONT_SIZE_MULTIPLIER = 1.3;

/**
 * Wraps a text-ish component (`Text`, `TextInput`) so the cap is injected
 * whenever a render site doesn't pass its own `maxFontSizeMultiplier`.
 *
 * Why a wrapper at all: React 19 removed `defaultProps` support entirely —
 * not only for function components (which RN 0.86's `Text`/`TextInput` are),
 * but the renderer no longer folds `defaultProps` for native *host*
 * components either, so neither `Text.defaultProps = {...}` nor patching
 * `TextNativeComponent.NativeText.defaultProps` has any effect on a device.
 * The old unit test kept passing only because `@react-native/jest-preset`
 * mocks `Text` as a class and manually re-implements the defaultProps fold
 * the real runtime no longer does — the test was verifying the mock.
 *
 * The wrapper is applied at Metro module resolution (see
 * `metro.config.js` + `src/shims/react-native-font-cap.js`): every
 * `import { Text } from 'react-native'` in the app and in dependencies
 * resolves to the capped component, so no call site has to change. Jest
 * keeps the unshimmed `react-native` (its own module mapper bypasses
 * Metro), so tests exercise this factory directly.
 */
export function withFontScalingCap<P extends { maxFontSizeMultiplier?: number | null }>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  const CappedComponent = React.forwardRef<unknown, P>(function CappedComponent(props, ref) {
    const { maxFontSizeMultiplier, ...rest } = props;
    return React.createElement(Component, {
      ...(rest as unknown as P),
      maxFontSizeMultiplier: maxFontSizeMultiplier ?? MAX_FONT_SIZE_MULTIPLIER,
      ref,
    } as unknown as P & { ref?: unknown });
  });

  const name =
    (Component as unknown as { displayName?: string; name?: string }).displayName ||
    (Component as unknown as { name?: string }).name ||
    'Component';
  CappedComponent.displayName = `FontScalingCapped(${name})`;

  return CappedComponent as unknown as React.ComponentType<P>;
}
