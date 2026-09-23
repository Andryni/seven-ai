import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, TextInput } from 'react-native';
import { installFontScalingCaps, MAX_FONT_SIZE_MULTIPLIER } from '../src/theme/fontScaling';

describe('installFontScalingCaps', () => {
  afterEach(() => {
    // Reset so other test files aren't affected by this global mutation.
    (Text as unknown as { defaultProps?: unknown }).defaultProps = undefined;
    (TextInput as unknown as { defaultProps?: unknown }).defaultProps = undefined;
  });

  it('sets maxFontSizeMultiplier on rendered Text elements', () => {
    installFontScalingCaps();
    const { getByText } = render(<Text>Hello</Text>);
    const node = getByText('Hello');
    expect(node.props.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it('sets maxFontSizeMultiplier on rendered TextInput elements', () => {
    installFontScalingCaps();
    const { getByDisplayValue } = render(<TextInput value="x" onChangeText={() => {}} />);
    const node = getByDisplayValue('x');
    expect(node.props.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it('is idempotent: calling twice keeps the same cap', () => {
    installFontScalingCaps();
    installFontScalingCaps();
    const { getByText } = render(<Text>Hi</Text>);
    expect(getByText('Hi').props.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it('does not clobber other existing defaultProps entries', () => {
    (Text as unknown as { defaultProps?: Record<string, unknown> }).defaultProps = { allowFontScaling: true };
    installFontScalingCaps();
    const props = (Text as unknown as { defaultProps?: Record<string, unknown> }).defaultProps;
    expect(props?.allowFontScaling).toBe(true);
    expect(props?.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it('an explicit maxFontSizeMultiplier prop on a call site still overrides the default', () => {
    installFontScalingCaps();
    const { getByText } = render(<Text maxFontSizeMultiplier={2}>Override</Text>);
    expect(getByText('Override').props.maxFontSizeMultiplier).toBe(2);
  });
});
