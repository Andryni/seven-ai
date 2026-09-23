import React from 'react';
import { Text, TextInput } from 'react-native';
import { render } from '@testing-library/react-native';
import { withFontScalingCap, MAX_FONT_SIZE_MULTIPLIER } from '../src/theme/fontScaling';

type AnyProps = Record<string, unknown>;
const CappedText = withFontScalingCap(Text as unknown as React.ComponentType<AnyProps>);
const CappedInput = withFontScalingCap(TextInput as unknown as React.ComponentType<AnyProps>);

/**
 * These tests exercise `withFontScalingCap` directly — the exact function the
 * Metro shim applies to react-native's `Text`/`TextInput` in the shipped app
 * (see metro.config.js / src/shims/react-native-font-cap.js).
 *
 * They deliberately do NOT assert on `Text.defaultProps` anymore: React 19
 * removed defaultProps for function components and no longer folds it for RN
 * host components either, so the previous test only passed because the Jest
 * Text mock is a class that re-implements the defaultProps fold the real
 * runtime dropped. Here the wrapper receives the real (Jest-mocked, but
 * functionally equivalent) components and the assertions are on what the
 * wrapper actually injects into the rendered tree.
 */

describe('withFontScalingCap', () => {
  it('injects the cap when a render site passes no maxFontSizeMultiplier', () => {
    const { getByText } = render(<CappedText>Hello</CappedText>);
    expect(getByText('Hello').props.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it('keeps an explicit call-site value instead of overwriting it', () => {
    const { getByText } = render(<CappedText maxFontSizeMultiplier={2}>Big</CappedText>);
    expect(getByText('Big').props.maxFontSizeMultiplier).toBe(2);
  });

  it('caps TextInput the same way', () => {
    const { getByDisplayValue } = render(<CappedInput value="x" onChangeText={() => {}} />);
    expect(getByDisplayValue('x').props.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it('preserves other props untouched', () => {
    const { getByText } = render(
      <CappedText numberOfLines={1}>Kept</CappedText>
    );
    expect(getByText('Kept').props.numberOfLines).toBe(1);
  });

  it('does not mutate the wrapped component', () => {
    render(<CappedText>Probe</CappedText>);
    expect((Text as unknown as { defaultProps?: Record<string, unknown> }).defaultProps).toBeUndefined();
  });

  it('is stable across calls: two wraps still inject the same cap', () => {
    const a = render(<CappedText>First</CappedText>).getByText('First');
    const b = render(<CappedText>Second</CappedText>).getByText('Second');
    expect(a.props.maxFontSizeMultiplier).toBe(b.props.maxFontSizeMultiplier);
  });
});
