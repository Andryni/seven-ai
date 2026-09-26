import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export type PerformanceTier = 'performance' | 'balanced' | 'high';

/** Runtime-only frame budget governor. It never rewrites the user's preferred
 * quality; it lowers or restores the effective tier with hysteresis. */
export function useAdaptivePerformance(preferred: PerformanceTier, enabled = true): {
  tier: PerformanceTier;
  fps: number | null;
} {
  const [sample, setSample] = useState<{ tier: PerformanceTier; fps: number | null }>({ tier: preferred, fps: null });

  useEffect(() => {
    if (!enabled || typeof requestAnimationFrame === 'undefined') {
      const timer = setTimeout(() => setSample({ tier: preferred, fps: null }), 0);
      return () => clearTimeout(timer);
    }
    let active = true;
    let frame = 0;
    let started = 0;
    let raf = 0;
    let currentTier = preferred;
    const rank = { performance: 0, balanced: 1, high: 2 } as const;

    const measure = (time: number) => {
      if (!active) return;
      if (!started) started = time;
      frame += 1;
      const elapsed = time - started;
      if (elapsed >= 5000 && AppState.currentState === 'active') {
        const fps = Math.round((frame * 1000) / elapsed);
        const measured: PerformanceTier = fps < 38 ? 'performance' : fps < 52 ? 'balanced' : 'high';
        // Adaptive mode may reduce quality, never exceed the user's preference.
        const nextTier = rank[measured] < rank[preferred] ? measured : preferred;
        if (nextTier !== currentTier || frame > 0) {
          currentTier = nextTier;
          setSample({ tier: nextTier, fps });
        }
        frame = 0;
        started = time;
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [enabled, preferred]);

  return sample;
}
