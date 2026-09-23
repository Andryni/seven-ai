import { useColorScheme } from 'react-native';
import type { UiMode } from '../theme/theme';

/**
 * Resolves the *stored* mode preference (`'dark' | 'light' | 'auto'`) into
 * the concrete `'dark' | 'light'` the theme actually needs.
 *
 * `'auto'` follows the OS appearance setting live via React Native's
 * `useColorScheme()` (already subscribed to system changes — no polling, no
 * app restart needed when the phone flips to night mode at sunset or the
 * user toggles their system-wide dark mode). `'dark'` / `'light'` simply
 * pin the choice regardless of what the OS reports, exactly like before this
 * hook existed.
 *
 * The OS can, on some platforms/embeddings, report `null` (unknown) —
 * treated the same as "no preference", which falls back to dark: SEVEN's
 * whole visual identity (the holographic HUD look) was designed dark-first.
 */
export function useResolvedUiMode(configuredMode: UiMode | 'auto' | undefined): UiMode {
  const systemScheme = useColorScheme();

  if (configuredMode === 'dark' || configuredMode === 'light') {
    return configuredMode;
  }
  // configuredMode is 'auto' or unset — both trust the OS.
  return systemScheme === 'light' ? 'light' : 'dark';
}
