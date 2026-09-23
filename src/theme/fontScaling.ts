import { Text, TextInput } from 'react-native';

/**
 * Cap for OS-driven font scaling (Settings > Accessibility > Larger Text /
 * Font size). Without a cap, `<Text>`/`<TextInput>` grow unbounded with the
 * system font size and this UI's fixed-height widget tiles (see
 * `WidgetCanvas`), dock chips, and terminal-style dense layouts start
 * clipping or overlapping well before 2x scale.
 *
 * 1.3 was chosen as a middle ground: it still lets a user with a "Larger
 * Text" preference get meaningfully bigger type (30% larger) for
 * readability, without letting the most extreme OS settings (which can
 * reach 2x-3x) break layouts that assume roughly-fixed text heights. This
 * is a resize *cap*, not a resize *disable* — `allowFontScaling` stays at
 * its default of `true` everywhere, so scaling still applies up to the cap.
 */
export const MAX_FONT_SIZE_MULTIPLIER = 1.3;

/**
 * Applies the cap globally via `Text.defaultProps` / `TextInput.defaultProps`
 * instead of threading `maxFontSizeMultiplier` through ~400 individual
 * `<Text>`/`<TextInput>` call sites across the app. React reads
 * `type.defaultProps` at element-creation time for any component (function,
 * class, or the newer `component(...)` syntax RN's own `Text.js` uses), so
 * this mutation is picked up by every existing and future `<Text>`/
 * `<TextInput>` in the tree without changing call sites.
 *
 * Call once, before first paint (see `app/_layout.tsx`). Idempotent: safe to
 * call more than once (e.g. Fast Refresh) since it always re-sets from the
 * same constant rather than compounding.
 */
export function installFontScalingCaps(): void {
  const TextAny = Text as unknown as { defaultProps?: Record<string, unknown> };
  TextAny.defaultProps = {
    ...TextAny.defaultProps,
    maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER,
  };

  const TextInputAny = TextInput as unknown as { defaultProps?: Record<string, unknown> };
  TextInputAny.defaultProps = {
    ...TextInputAny.defaultProps,
    maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER,
  };
}
