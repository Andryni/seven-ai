/**
 * Beyond Gideon (covered in gideonAvatar.reducedMotion.test.tsx), two more
 * surfaces run continuous or purely decorative `Animated.loop`/`Animated.
 * timing` flourishes that should stop under reduce-motion: the app-wide
 * background dust (rendered behind every screen) and the dashboard's
 * ARRANGE-mode drag wobble + staggered tile entrance.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { CanvasWidget, defaultWidgetLayout, CANVAS_HEIGHT } from '../src/components/WidgetCanvas';
import { useTheme } from '../src/theme/theme';
import { useReducedMotion } from '../src/hooks/useReducedMotion';

// lucide-react-native ships as ESM only, which the default jest-expo transform
// (correctly) doesn't try to parse from node_modules; every existing test that
// touches an icon-bearing component mocks it out instead of widening the
// transform for the whole suite.
jest.mock('lucide-react-native', () => ({ EyeOff: 'EyeOff' }));

jest.mock('../src/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(),
}));

const getPalette = () => {
  let captured: ReturnType<typeof useTheme> | null = null;
  const Capture = () => {
    captured = useTheme();
    return null;
  };
  render(<Capture />);
  return captured!;
};

describe('ParticleBackground under reduce-motion', () => {
  let loopSpy: jest.SpyInstance;

  beforeEach(() => {
    loopSpy = jest.spyOn(Animated, 'loop');
  });

  afterEach(() => {
    loopSpy.mockRestore();
  });

  it('starts its drift + breathe loops when motion is not reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
    render(<ParticleBackground />);
    // driftFar, driftNear, breathe.
    expect(loopSpy).toHaveBeenCalledTimes(3);
  });

  it('starts none of its loops when motion is reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(<ParticleBackground />);
    expect(loopSpy).not.toHaveBeenCalled();
  });

  it('still renders without throwing under reduce-motion', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    expect(() => render(<ParticleBackground />)).not.toThrow();
  });
});

describe('WidgetCanvas / CanvasWidget under reduce-motion', () => {
  let loopSpy: jest.SpyInstance;
  const palette = getPalette();
  const layout = defaultWidgetLayout(['w1']);

  const spec = {
    id: 'w1',
    title: 'Widget',
    desc: 'desc',
    icon: null,
    borderColor: '#fff',
    onPress: () => {},
  };

  beforeEach(() => {
    loopSpy = jest.spyOn(Animated, 'loop');
  });

  afterEach(() => {
    loopSpy.mockRestore();
  });

  it('jiggles (loops) in ARRANGE/editing mode when motion is not reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
    render(
      <CanvasWidget
        spec={spec}
        index={0}
        position={layout.w1}
        width={100}
        height={76}
        canvasWidth={300}
        editing
        palette={palette}
        onMove={() => {}}
      />
    );
    expect(loopSpy).toHaveBeenCalledTimes(1);
  });

  it('does not jiggle in ARRANGE/editing mode when motion is reduced', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    render(
      <CanvasWidget
        spec={spec}
        index={0}
        position={layout.w1}
        width={100}
        height={76}
        canvasWidth={300}
        editing
        palette={palette}
        onMove={() => {}}
      />
    );
    expect(loopSpy).not.toHaveBeenCalled();
  });

  it('renders without throwing in normal (non-editing) mode under reduce-motion', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    expect(() =>
      render(
        <CanvasWidget
          spec={spec}
          index={0}
          position={layout.w1}
          width={100}
          height={76}
          canvasWidth={300}
          editing={false}
          palette={palette}
          onMove={() => {}}
        />
      )
    ).not.toThrow();
    expect(CANVAS_HEIGHT).toBeGreaterThan(0);
  });
});
