import type { AssistantStatus } from '../types';

/**
 * Gideon's micro-expressions, as pure arithmetic.
 *
 * The face is animated by `Animated.Value`s, which cannot be read back from a
 * test (and which use the native driver, so nothing lands in the render tree
 * either). What a face *means* is therefore kept here, away from the renderer:
 * the component owns the timing, this module owns the intent. That makes the
 * expressions testable instead of merely plausible.
 */

/** Transient expression layered over the status. `happy` follows a success,
 *  `alert` a failure. */
export type GideonMood = 'happy' | 'alert' | null;

export interface ExpressionTargets {
  /** 0–1 brow furrow: thought, made visible. */
  knit: number;
  /** 0–1 smile. */
  smile: number;
  /** 0–1 alarm: brows up, eyes wide. */
  alertness: number;
}

/** Tasks in flight. Leaving one of these for `idle` means it settled. */
const WORKING: AssistantStatus[] = ['thinking', 'building', 'organizing', 'healing'];

/**
 * The furrow follows what he is doing: reasoning is the deepest, and a task
 * actually in progress costs a shallower concentration frown. Idle, listening
 * and speaking are open-faced — a narrator who scowls while talking reads as
 * angry, not focused.
 */
export const browFurrowFor = (status: AssistantStatus): number => {
  switch (status) {
    case 'thinking':
      return 1;
    case 'building':
      return 0.55;
    case 'organizing':
      return 0.45;
    case 'healing':
      return 0.4;
    default:
      return 0;
  }
};

/** Alarm wins over happiness: a failure must never be answered with a smile. */
export const smileFor = (mood: GideonMood, autoSmile: boolean): number =>
  mood === 'alert' ? 0 : mood === 'happy' || autoSmile ? 1 : 0;

export const alertnessFor = (mood: GideonMood): number => (mood === 'alert' ? 1 : 0);

/** Everything the face needs to know, resolved to animation targets. */
export const expressionTargets = ({
  status,
  mood,
  autoSmile,
}: {
  status: AssistantStatus;
  mood: GideonMood;
  autoSmile: boolean;
}): ExpressionTargets => ({
  knit: browFurrowFor(status),
  smile: smileFor(mood, autoSmile),
  alertness: alertnessFor(mood),
});

/**
 * A task that settles on its own earns the same brief smile as an explicitly
 * reported success. Speaking and listening are excluded: an answer ending is
 * not an achievement, and grinning every time he stops talking would be creepy.
 */
export const earnsAutoSmile = (was: AssistantStatus, now: AssistantStatus): boolean =>
  now === 'idle' && WORKING.includes(was);

/** How long the self-triggered smile lasts, in ms. */
export const AUTO_SMILE_MS = 2200;

/**
 * Expression geometry, in viewBox units (0–200) so the component only has to
 * scale it. Kept together because these numbers are what a face reads as: a
 * wider smile with no squint and no creases looks like a rictus, not joy.
 */
export const EXPRESSION = {
  /** Creases outside the mouth corners. */
  smile: { lift: 1.5, widen: 0.05, creaseOpacity: 0.42, creaseAngle: 16, squint: 0.87 },
  /** Inner brow ends drop and travel towards each other. */
  furrow: { drop: 1.8, inward: 0.9, angle: 9 },
  /** Alarm lifts the brows and opens the eyes instead. */
  alarm: { eyeWide: 1.07, browUp: 0.9 },
} as const;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** At rest the folds are invisible; they arrive with the smile. */
export const smileCreaseOpacity = (smile: number): number =>
  clamp01(smile) * EXPRESSION.smile.creaseOpacity;

/** Negative: the lips rise. */
export const smileLiftUnits = (smile: number): number => -clamp01(smile) * EXPRESSION.smile.lift;
export const smileWidenScale = (smile: number): number =>
  1 + clamp01(smile) * EXPRESSION.smile.widen;
/** A Duchenne smile squints: the eye closes slightly as the cheek lifts. */
export const smileSquintScale = (smile: number): number =>
  1 + clamp01(smile) * (EXPRESSION.smile.squint - 1);
