/**
 * Gideon's ambient loops (idle bob/halo/sway, HUD ring spin, hologram
 * sweep, projector flicker) are the single biggest animation surface in the
 * app — 21 effects, most of them infinite `Animated.loop`s. Under
 * reduce-motion none of them should ever start; blinking/saccades and
 * lip-sync (driven by `setTimeout`, not `Animated.loop`) must be untouched,
 * since they carry real information rather than pure atmosphere.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { GideonAvatar } from '../src/components/GideonAvatar';
import { useReducedMotion } from '../src/hooks/useReducedMotion';
import type { AssistantStatus } from '../src/types';

jest.mock('../src/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(),
}));

describe('GideonAvatar under reduce-motion', () => {
  let loopSpy: jest.SpyInstance;

  beforeEach(() => {
    loopSpy = jest.spyOn(Animated, 'loop');
  });

  afterEach(() => {
    loopSpy.mockRestore();
  });

  it('starts its ambient Animated.loop animations when motion is not reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
    render(<GideonAvatar status="idle" size={270} />);
    // bob, halo, sway, spinA, spinB, sweep, sweepEcho, flicker.
    expect(loopSpy).toHaveBeenCalledTimes(8);
  });

  it('starts none of its ambient loops when motion is reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(<GideonAvatar status="idle" size={270} />);
    expect(loopSpy).not.toHaveBeenCalled();
  });

  it('still renders the viseme-driven lips (functional, not ambient) under reduce-motion', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const { toJSON } = render(<GideonAvatar status="speaking" speechText="bonjour" size={270} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('gideonUpperLip');
    expect(tree).toContain('gideonLowerLip');
  });

  it('still loops the projector ring pulse while speaking even under reduce-motion (feedback, not atmosphere)', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(<GideonAvatar status="speaking" size={270} />);
    // Exactly the ring-pulse loop should have started — none of the 8 ambient ones.
    expect(loopSpy).toHaveBeenCalledTimes(1);
  });

  it('renders every status without throwing under reduce-motion', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const statuses: AssistantStatus[] = [
      'idle',
      'listening',
      'thinking',
      'speaking',
      'building',
      'organizing',
      'healing',
    ];
    statuses.forEach((status) => {
      expect(() => render(<GideonAvatar status={status} size={270} />)).not.toThrow();
    });
  });
});
