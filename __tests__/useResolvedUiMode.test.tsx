/**
 * 'auto' must track the live OS appearance (react-native's useColorScheme,
 * which is itself subscribed to system changes — no polling needed here);
 * an explicit 'dark'/'light' choice must always win regardless of the OS.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as ReactNative from 'react-native';
import { useResolvedUiMode } from '../src/hooks/useResolvedUiMode';

let colorSchemeSpy: jest.SpyInstance;
beforeEach(() => {
  colorSchemeSpy = jest.spyOn(ReactNative, 'useColorScheme');
});
afterEach(() => {
  colorSchemeSpy.mockRestore();
});

const Probe: React.FC<{ configured: 'dark' | 'light' | 'auto' | undefined }> = ({ configured }) => {
  const resolved = useResolvedUiMode(configured);
  return <Text>{resolved}</Text>;
};

const renderedText = (configured: 'dark' | 'light' | 'auto' | undefined) => {
  const { toJSON } = render(<Probe configured={configured} />);
  return JSON.stringify(toJSON());
};

describe('useResolvedUiMode', () => {
  it('follows the OS when set to "auto" and the OS reports light', () => {
    colorSchemeSpy.mockReturnValue('light');
    expect(renderedText('auto')).toContain('light');
  });

  it('follows the OS when set to "auto" and the OS reports dark', () => {
    colorSchemeSpy.mockReturnValue('dark');
    expect(renderedText('auto')).toContain('dark');
  });

  it('falls back to dark when "auto" and the OS reports null/unknown', () => {
    colorSchemeSpy.mockReturnValue(null);
    expect(renderedText('auto')).toContain('dark');
  });

  it('treats an unset preference the same as "auto"', () => {
    colorSchemeSpy.mockReturnValue('light');
    expect(renderedText(undefined)).toContain('light');
  });

  it('pins "dark" regardless of what the OS reports', () => {
    colorSchemeSpy.mockReturnValue('light');
    expect(renderedText('dark')).toContain('dark');
  });

  it('pins "light" regardless of what the OS reports', () => {
    colorSchemeSpy.mockReturnValue('dark');
    expect(renderedText('light')).toContain('light');
  });
});
