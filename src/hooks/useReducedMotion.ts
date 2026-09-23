import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSevenStore } from '../store/useSevenStore';

/**
 * Whether ambient/decorative motion should be suppressed right now.
 *
 * Two independent sources feed this, and either one being "on" wins:
 *  - the OS-level "reduce motion" accessibility setting (real, read via
 *    `AccessibilityInfo`, and re-checked live if the user flips it while
 *    the app is open — no restart needed);
 *  - the in-app override in Settings (`config.reduceMotion`), for anyone
 *    who wants calmer visuals without touching a system-wide OS setting,
 *    or who wants to force animations back on even if the OS reports
 *    reduce-motion (some launchers report it by mistake on certain
 *    Android skins).
 *
 * `config.reduceMotion` defaults to `'auto'`, meaning "trust the OS". Only
 * `'on'` / `'off'` override it either way.
 *
 * This is deliberately scoped to *ambient* motion (particle drift, the
 * idle avatar sway/halo/hologram sweep, the dashboard's drag wobble,
 * screen-entrance slides) — never to feedback that carries information,
 * such as loading spinners, the voice waveform, or Gideon's blinks/
 * expressions/lip-sync, which must keep running regardless.
 */
export function useReducedMotion(): boolean {
  const override = useSevenStore((s) => s.config.reduceMotion ?? 'auto');
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setSystemReduceMotion(!!enabled);
      })
      .catch(() => {
        // No such API on this platform/runtime — stay with the default (false).
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
      setSystemReduceMotion(!!enabled);
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  if (override === 'on') return true;
  if (override === 'off') return false;
  return systemReduceMotion;
}
