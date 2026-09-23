import { AssistantStatus } from '../types';
import type { Palette } from '../theme/theme';

export interface GideonHue {
  core: string;
  glow: string;
  deep: string;
  edge: string;
  iris: string;
  lip: string;
  speed: number;
}

/**
 * Maps the assistant status to the hologram's light palette, split out of
 * `GideonAvatar.tsx` (which had grown past 1400 lines). Pure function of
 * (status, themeColor, palette) — no component state involved — so it can
 * live outside the component and still be wrapped in `useMemo` by the
 * caller with the exact same dependency array as before.
 *
 * The hologram is made of the same light as the screen it stands on:
 * shadows and the fading silhouette come from the theme's own background
 * family and only the emission carries the status colour. Saturated
 * shadow tones made the head read as a sticker pasted over the scene
 * instead of lit in it.
 */
export function computeGideonHue(
  status: AssistantStatus,
  themeColor: string | undefined,
  palette: Palette
): GideonHue {
  // Mid-dark: dark enough to sit in the background, tinted enough to model
  // the face (a pure background tone flattens every shadow).
  const deep = palette.isDark ? '#0E2836' : '#CFE2ED';
  const edge = palette.isDark ? palette.bg : '#E9F3F8';
  switch (status) {
    case 'thinking':
      return { core: '#F0D5FF', glow: '#BD00FF', deep, edge, iris: '#7A2AB8', lip: '#8C3FC4', speed: 2.0 };
    case 'speaking':
      return { core: '#D9FAFF', glow: '#22D3EE', deep, edge, iris: '#0A7B92', lip: '#1E9FC2', speed: 1.7 };
    case 'listening':
      return { core: '#CFFFE9', glow: '#00FFA3', deep, edge, iris: '#0F8A63', lip: '#16A87C', speed: 1.4 };
    case 'organizing':
      return { core: '#CFFFE9', glow: '#00FFA3', deep, edge, iris: '#0F8A63', lip: '#16A87C', speed: 1.5 };
    case 'building':
      return { core: '#D6F1FF', glow: '#00B4FF', deep, edge, iris: '#0A6A9E', lip: '#1D8FC4', speed: 1.8 };
    case 'healing':
      return { core: '#FFD3DE', glow: '#FF3366', deep, edge, iris: '#A6123C', lip: '#C0395C', speed: 2.4 };
    case 'idle':
    default:
      return {
        core: '#E8FCFF',
        glow: themeColor || palette.orbInner || '#00E5FF',
        deep,
        edge,
        iris: '#0C6E86',
        lip: '#1E9FC2',
        speed: 1.0,
      };
  }
}
