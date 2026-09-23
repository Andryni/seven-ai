import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useSevenStore } from '../store/useSevenStore';
import { appLockService } from '../services/appLockService';

/**
 * Drives the app-wide biometric lock screen.
 *
 * Locked the instant the feature is on and the app cold-starts, and again
 * every time the app comes back from the background — going to the
 * background is exactly the moment someone else could pick the phone up,
 * so a grace period would defeat the point. Backgrounding itself needs no
 * extra work: the lock screen simply stays mounted underneath whatever the
 * OS shows in the app switcher, so there is nothing to un-draw.
 *
 * Web has no biometric concept and is never gated, matching
 * `appLockService.authenticate`'s own web short-circuit.
 */
export function useAppLock() {
  const enabled = useSevenStore((s) => s.config.appLockEnabled ?? false);
  const [locked, setLocked] = useState(enabled);
  // Turning the feature off in Settings should never leave a stale lock
  // screen up; turning it on locks immediately rather than waiting for the
  // next backgrounding. Adjusted during render — React's documented pattern
  // for "reset state when a prop changes" (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // — so it takes effect the same frame the toggle flips instead of one
  // effect-tick later.
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    setLocked(enabled);
  }

  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (next) => {
      const wasBackground = /inactive|background/.test(String(appState.current));
      if (wasBackground && next === 'active') {
        setLocked(true);
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, [enabled]);

  const unlock = useCallback(
    async (promptMessage: string, cancelLabel: string) => {
      const success = await appLockService.authenticate(promptMessage, cancelLabel);
      if (success) setLocked(false);
      return success;
    },
    []
  );

  return { locked: enabled && locked, unlock };
}
