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
  // WCAG AA fix: '#55556B' measured ~2.5-2.8:1 against dark bg/bgElevated
  // across all four themes (fails the 4.5:1 body-text threshold). Lightened
  // along the same hue to clear 4.5:1 against every dark bg/bgElevated pair.
  textFaint: '#7D7D96',
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
  // WCAG AA fix: '#9A9AB0' measured ~2.4-2.8:1 against light bg/bgElevated
  // across all four themes (fails the 4.5:1 body-text threshold). Darkened
  // along the same hue to clear 4.5:1 against every light bg/bgElevated pair.
  textFaint: '#636372',
  // The four accent colors below were nudged darker (same hue) to clear the
  // WCAG AA 4.5:1 text-contrast threshold on light backgrounds; originals sat
  // at 4.2-4.5:1, right at or below the line, with near-zero safety margin.
  success: '#107334',
  warning: '#A24B08',
  error: '#C22222',
  info: '#026A9F',
  particle: '#7A7A90',
};

const sevenPalette: Record<UiMode, Palette> = {
  dark: {
    ...darkBase,
    // SEVEN's default identity is an aerospace instrument, not the familiar
    // cyan-on-navy "AI dashboard" template: warm optical amber is paired with
    // ink-black titanium and a restrained navigation blue.
    bg: '#0A0A09',
    bgElevated: '#15140F',
    bgDeep: '#040403',
    border: 'rgba(255,181,71,0.20)',
    borderStrong: 'rgba(255,181,71,0.48)',
    accent: '#FFB547',
    accentSoft: 'rgba(255,181,71,0.09)',
    accentStrong: 'rgba(255,181,71,0.44)',
    orbInner: '#FFB547',
    orbOuter: '#5267C7',
  },
  light: {
    ...lightBase,
    // Warm technical paper rather than a generic blue-white SaaS surface.
    bg: '#F3EFE5',
    bgElevated: '#FFFCF3',
    bgDeep: '#EEE7D9',
    border: 'rgba(122,70,8,0.26)',
    borderStrong: 'rgba(122,70,8,0.50)',
    accent: '#854900',
    accentSoft: 'rgba(133,73,0,0.09)',
    accentStrong: 'rgba(133,73,0,0.38)',
    orbInner: '#A75D00',
    orbOuter: '#4054A5',
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
      // WCAG AA fix: the original '#C81E4A' cleared 4.5:1 against `bg` and
      // `bgElevated` (~4.9-5.6:1) but measured 4.34:1 against `bgDeep`
      // ('#EFDEE3'). Darkened slightly along the same hue — see
      // themeContrast.test.ts, which holds every accent to all three
      // light backgrounds.
      accent: '#C01D47',
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
      // WCAG AA fix: original '#15803D' measured 4.52:1 against `bg`
      // ('#EDF5EF') and only ~4.5:1 against text-on-accentSoft badge
      // backgrounds — right at the threshold. Darkened for margin; the final
      // value clears 4.5:1 on all three light backgrounds (see
      // themeContrast.test.ts).
      accent: '#147739',
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
