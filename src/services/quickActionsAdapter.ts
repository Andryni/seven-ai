import { isExpoGo } from './notificationsAdapter';

export interface QuickActionPayload { id: string; params?: Record<string, string>; }
let nativeHook: ((callback: (action: QuickActionPayload) => void) => void) | null = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeHook = require('expo-quick-actions/hooks').useQuickActionCallback;
  } catch { nativeHook = null; }
}

// A module-selected hook keeps hook ordering stable for the process lifetime.
export const useQuickActionCallback: (callback: (action: QuickActionPayload) => void) => void =
  nativeHook || (() => {});
