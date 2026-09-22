import React from 'react';
import { render } from '@testing-library/react-native';
import { GideonAvatar } from '../src/components/GideonAvatar';
import {
  browFurrowFor,
  earnsAutoSmile,
  expressionTargets,
  smileCreaseOpacity,
  smileSquintScale,
} from '../src/core/expression';
import type { AssistantStatus } from '../src/types';

const STATUSES: AssistantStatus[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'building',
  'organizing',
  'healing',
];

/** Serialized render tree as one string — enough to count drawn geometry. */
const serialize = (node: unknown): string => JSON.stringify(node);

const draw = (ui: React.ReactElement) => serialize(render(ui).toJSON());

describe('GideonAvatar', () => {
  it('renders every status at both the head and the chip size', () => {
    STATUSES.forEach((status) => {
      expect(() => render(<GideonAvatar status={status} size={270} />)).not.toThrow();
      expect(() => render(<GideonAvatar status={status} size={36} />)).not.toThrow();
    });
  });

  it('renders the transient moods without throwing', () => {
    expect(() => render(<GideonAvatar status="idle" mood="happy" size={270} />)).not.toThrow();
    expect(() => render(<GideonAvatar status="idle" mood="alert" size={270} />)).not.toThrow();
  });

  /**
   * The brows exist exactly once, in the animated overlay. When they were also
   * drawn in the base SVG, the face rendered two pairs — and only the overlay
   * pair can knit, so the static pair sat frozen under the moving one.
   */
  it('draws each brow exactly once, in the animated overlay', () => {
    const tree = draw(<GideonAvatar status="idle" size={270} />);
    expect(tree.split('M 66 73 C 72 67.5 82 66.5 90.5 70').length - 1).toBe(1);
    expect(tree.split('M 134 73 C 128 67.5 118 66.5 109.5 70').length - 1).toBe(1);
    // Each brow is drawn inside its own local coordinate window (react-native-svg
    // serializes a viewBox into minX/minY/vbWidth/vbHeight).
    expect(tree).toContain('"minX":64.5,"minY":64.5,"vbWidth":27,"vbHeight":9');
    expect(tree).toContain('"minX":108.5,"minY":64.5,"vbWidth":27,"vbHeight":9');
  });

  it('ships the smile creases hidden, so a neutral face shows no frown lines', () => {
    const tree = draw(<GideonAvatar status="idle" size={270} />);
    expect(tree.split('M 88 123.5 C 83.5 125 81.5 128.5 82.5 133').length - 1).toBe(1);
    expect(tree.split('M 112 123.5 C 116.5 125 118.5 128.5 117.5 133').length - 1).toBe(1);
    // Both crease wrappers start at zero opacity.
    expect(tree).toContain('"opacity":0');
  });

  it('renders the viseme-driven lips so the mouth layer stays wired', () => {
    const tree = draw(<GideonAvatar status="speaking" speechText="bonjour" size={270} />);
    expect(tree).toContain('gideonUpperLip');
    expect(tree).toContain('gideonLowerLip');
  });
});

/**
 * The expressions themselves live in a pure module, because an Animated value
 * cannot be read back: it is native-driven, so nothing lands in the render tree
 * to assert on. What the face means is checked here; the component only owns
 * the timing.
 */
describe('Gideon micro-expressions', () => {
  const at = (over: Partial<Parameters<typeof expressionTargets>[0]> = {}) =>
    expressionTargets({ status: 'idle', mood: null, autoSmile: false, ...over });

  it('knits the brows while he reasons, and relaxes when the answer lands', () => {
    expect(at({ status: 'thinking' }).knit).toBeGreaterThan(0.5);
    expect(at({ status: 'building' }).knit).toBeGreaterThan(0);
    // Talking with a scowl reads as anger, not focus.
    expect(at({ status: 'speaking' }).knit).toBe(0);
    expect(at({ status: 'listening' }).knit).toBe(0);
    expect(at({ status: 'idle' }).knit).toBe(0);
  });

  it('smiles on a reported success and keeps the creases visible once it does', () => {
    expect(at({ mood: 'happy' }).smile).toBe(1);
    // A smile with no crease and no squint is a rictus, so both must move too.
    expect(smileCreaseOpacity(at({ mood: 'happy' }).smile)).toBeGreaterThan(0.3);
    expect(smileSquintScale(at({ mood: 'happy' }).smile)).toBeLessThan(1);
  });

  it('never smiles at a failure, and answers one by opening the eyes wide', () => {
    expect(at({ mood: 'alert' }).smile).toBe(0);
    // Alarm outranks a stale success rather than being layered under it.
    expect(at({ mood: 'alert', autoSmile: true }).smile).toBe(0);
    expect(at({ mood: 'alert' }).alertness).toBe(1);
    expect(at({ mood: 'alert' }).knit).toBe(0);
  });

  it('rests a neutral face at zero on every channel', () => {
    expect(at()).toEqual({ knit: 0, smile: 0, alertness: 0 });
    expect(smileCreaseOpacity(0)).toBe(0);
  });

  it('earns the self-triggered smile only when a task settles', () => {
    expect(earnsAutoSmile('building', 'idle')).toBe(true);
    expect(earnsAutoSmile('thinking', 'idle')).toBe(true);
    // An answer ending is not an achievement.
    expect(earnsAutoSmile('speaking', 'idle')).toBe(false);
    expect(earnsAutoSmile('listening', 'idle')).toBe(false);
    expect(earnsAutoSmile('idle', 'idle')).toBe(false);
    // And a task that starts is not one that landed.
    expect(earnsAutoSmile('idle', 'building')).toBe(false);
  });

  it('furrows deepest for reasoning, and never for nothing', () => {
    const statuses: AssistantStatus[] = [
      'idle',
      'listening',
      'thinking',
      'speaking',
      'building',
      'organizing',
      'healing',
    ];
    const deepest = statuses.reduce((a, b) => (browFurrowFor(a) >= browFurrowFor(b) ? a : b));
    expect(deepest).toBe('thinking');
    statuses.forEach((status) => {
      const furrow = browFurrowFor(status);
      expect(furrow).toBeGreaterThanOrEqual(0);
      expect(furrow).toBeLessThanOrEqual(1);
    });
  });
});
