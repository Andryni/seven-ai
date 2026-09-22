import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';

// ------------------------------------------------------------------ Types

export type ThemeName = 'seven' | 'ultron' | 'crimson' | 'matrix';
export type UiMode = 'dark' | 'light';

export interface Palette {
  bg: string;            // screen background
  bgElevated: string;    // cards / panels
  bgDeep: string;        // deepest wells (terminal, inputs)
  border: string;        // subtle borders
  borderStrong: string;  // emphasized borders
  accent: string;        // signature accent (gold/crimson/green)
  accentSoft: string;    // accent at low opacity backgrounds
  accentStrong: string;  // accent at high opacity
  text: string;
  textDim: string;
  textFaint: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  particle: string;
  orbInner: string;
  orbOuter: string;
  isDark: boolean;
}

// --------------------------------------------------------------- Palettes

const darkBase = {
  isDark: true,
  text: '#EDEDF2',
  textDim: '#8E8EA3',
  textFaint: '#55556B',
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#FF3366',
  info: '#38BDF8',
  particle: '#FFFFFF',
};

const lightBase = {
  isDark: false,
  text: '#1A1A26',
  textDim: '#5A5A72',
  textFaint: '#9A9AB0',
  success: '#16A34A',
  warning: '#B45309',
  error: '#DC2626',
  info: '#0284C7',
  particle: '#7A7A90',
};

const sevenPalette: Record<UiMode, Palette> = {
  dark: {
    ...darkBase,
    bg: '#07090E',
    bgElevated: '#0F141F',
    bgDeep: '#030508',
    border: 'rgba(0,229,255,0.22)',
    borderStrong: 'rgba(0,229,255,0.45)',
    accent: '#00E5FF',
    accentSoft: 'rgba(0,229,255,0.1)',
    accentStrong: 'rgba(0,229,255,0.45)',
    orbInner: '#00E5FF',
    orbOuter: '#0070F3',
  },
  light: {
    ...lightBase,
    bg: '#EBF4F8',
    bgElevated: '#FFFFFF',
    bgDeep: '#DCE8EE',
    border: 'rgba(0,140,180,0.3)',
    borderStrong: 'rgba(0,140,180,0.5)',
    accent: '#0070F3',
    accentSoft: 'rgba(0,112,243,0.1)',
    accentStrong: 'rgba(0,112,243,0.4)',
    orbInner: '#0070F3',
    orbOuter: '#00E5FF',
  },
};

export const PALETTES: Record<ThemeName, Record<UiMode, Palette>> = {
  seven: sevenPalette,
  ultron: sevenPalette,
  crimson: {
    dark: {
      ...darkBase,
      bg: '#0D0508',
      bgElevated: '#1A0B10',
      bgDeep: '#070203',
      border: 'rgba(255,51,102,0.22)',
      borderStrong: 'rgba(255,51,102,0.4)',
      accent: '#FF3366',
      accentSoft: 'rgba(255,51,102,0.08)',
      accentStrong: 'rgba(255,51,102,0.42)',
      orbInner: '#FF3366',
      orbOuter: '#C81E4A',
    },
    light: {
      ...lightBase,
      bg: '#F8EDEF',
      bgElevated: '#FFFFFF',
      bgDeep: '#EFDEE3',
      border: 'rgba(200,30,74,0.3)',
      borderStrong: 'rgba(200,30,74,0.5)',
      accent: '#C81E4A',
      accentSoft: 'rgba(200,30,74,0.08)',
      accentStrong: 'rgba(200,30,74,0.4)',
      orbInner: '#E11D48',
      orbOuter: '#9F1239',
    },
  },
  matrix: {
    dark: {
      ...darkBase,
      bg: '#030A05',
      bgElevated: '#08140C',
      bgDeep: '#020503',
      border: 'rgba(74,222,128,0.22)',
      borderStrong: 'rgba(74,222,128,0.4)',
      accent: '#4ADE80',
      accentSoft: 'rgba(74,222,128,0.08)',
      accentStrong: 'rgba(74,222,128,0.4)',
      orbInner: '#4ADE80',
      orbOuter: '#16A34A',
    },
    light: {
      ...lightBase,
      bg: '#EDF5EF',
      bgElevated: '#FFFFFF',
      bgDeep: '#DCEDE1',
      border: 'rgba(22,163,74,0.3)',
      borderStrong: 'rgba(22,163,74,0.5)',
      accent: '#15803D',
      accentSoft: 'rgba(22,163,74,0.08)',
      accentStrong: 'rgba(22,163,74,0.4)',
      orbInner: '#22C55E',
      orbOuter: '#166534',
    },
  },
};

// ---------------------------------------------------------------- Context

interface ThemeContextValue {
  themeName: ThemeName;
  uiMode: UiMode;
  palette: Palette;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: 'ultron',
  uiMode: 'dark',
  palette: PALETTES.ultron.dark,
});

export const ThemeProvider: React.FC<{
  themeName: ThemeName;
  uiMode: UiMode;
  children: React.ReactNode;
}> = ({ themeName, uiMode, children }) => {
  const value = useMemo<ThemeContextValue>(
    () => ({ themeName, uiMode, palette: PALETTES[themeName][uiMode] }),
    [themeName, uiMode]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): Palette => useContext(ThemeContext).palette;

// --------------------------------------------------------- Style factory

/**
 * Memoized StyleSheet factory driven by the active palette:
 *   const styles = useThemeStyles((t) => ({ card: { backgroundColor: t.bgElevated } }));
 * Replace module-level `StyleSheet.create` with this so light mode and the
 * selectable accent themes re-render correctly.
 */
export function useThemeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (t: Palette) => T
): T {
  const t = useTheme();
  return useMemo(() => StyleSheet.create(factory(t)), [factory, t]);
}
