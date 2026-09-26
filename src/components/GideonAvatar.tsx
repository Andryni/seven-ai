import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { AssistantStatus } from '../types';
import { useTheme } from '../theme/theme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { computeGideonHue } from './gideonHue';
import { HEAD_PATH, NECK_PATH, BUST_PATH, COLUMN_PATH, SCAN_LINES, LANDMARKS } from './gideonGeometry';
import { VISEME_SHAPES, VisemeId, textToVisemes } from '../core/visemes';
import {
  AUTO_SMILE_MS,
  EXPRESSION,
  GideonMood,
  browFurrowFor,
  earnsAutoSmile,
  expressionTargets,
  smileCreaseOpacity,
  smileLiftUnits,
  smileSquintScale,
  smileWidenScale,
} from '../core/expression';

interface GideonAvatarProps {
  status?: AssistantStatus;
  size?: number;
  /** 0.0 – 1.0 audio reactivity: modulates the projected glow only. */
  amplitude?: number;
  themeColor?: string;
  /** Text currently being spoken — drives the lip-sync visemes. */
  speechText?: string;
  /** TTS rate (0.5 – 2.0) used to time the visemes. */
  speechRate?: number;
  /**
   * Transient expression layered over the status: `happy` flashes a smile
   * after an action lands, `alert` stiffens him after a failure. Left out,
   * Gideon still smiles briefly on his own when an active task settles.
   */
  mood?: GideonMood;
}

/**
 * Gideon — the holographic AI from "The Flash" / "Legends of Tomorrow".
 *
 * Unlike the earlier orb, Gideon is a *face*: a projected human head with
 * realistic anatomy (skull, jaw, cheekbones, ears, nose with alae and
 * nostrils, eyelids and irises, philtrum, lips, chin crease, neck and
 * collarbones), volume shading, and a mouth that articulates the words SEVEN
 * is actually saying (`src/core/visemes.ts`) instead of flapping on a raw
 * amplitude signal.
 *
 * All rendering is react-native-svg + Animated: no WebGL, no cloud cost.
 */
export const GideonAvatar: React.FC<GideonAvatarProps> = ({
  status = 'idle',
  size = 270,
  amplitude = 0,
  themeColor = '#00E5FF',
  speechText = '',
  speechRate = 1,
  mood = null,
}) => {
  /** viewBox unit (0–200) → device pixels. */
  const px = (units: number) => (units * size) / 200;
  const palette = useTheme();

  // NOTE: an earlier WebGL head experiment was built and wired here for a
  // while. Side by side the vector face read as the more realistic one, so
  // Gideon stayed the SVG face and the WebGL scene was removed from the tree.

  // ------------------------------------------------------------ Hologram hue
  // The hologram is made of the same light as the screen it stands on: shadows
  // and the fading silhouette come from the theme's own background family and
  // only the emission carries the status colour. Saturated shadow tones made
  // the head read as a sticker pasted over the scene instead of lit in it.
  const hue = useMemo(
    () => computeGideonHue(status, themeColor, palette),
    [status, themeColor, palette]
  );

  // Only the ambient, purely decorative loops below (idle bob/sway, halo
  // breathing, projector ring spin, hologram rebuild sweep, flicker) are
  // gated by this — blinking, saccades, expressions and lip-sync all keep
  // running since they carry real information (attention, mood, speech).
  const reduceMotion = useReducedMotion();

  // ------------------------------------------------------------- Animated set
  const boot = useMemo(() => new Animated.Value(0), []);
  const bob = useMemo(() => new Animated.Value(0), []);
  const sway = useMemo(() => new Animated.Value(0), []);
  const halo = useMemo(() => new Animated.Value(0), []);
  const spinA = useMemo(() => new Animated.Value(0), []);
  const spinB = useMemo(() => new Animated.Value(0), []);
  const sweep = useMemo(() => new Animated.Value(0), []);
  const sweepEcho = useMemo(() => new Animated.Value(0), []);
  const flicker = useMemo(() => new Animated.Value(1), []);
  const blink = useMemo(() => new Animated.Value(1), []);
  const irisDrift = useMemo(() => new Animated.Value(0), []);
  const ringPulse = useMemo(() => new Animated.Value(0), []);

  // Micro-expressions: a brow furrow while he reasons, a smile when something
  // lands, and saccades that keep the gaze from freezing open.
  const knit = useMemo(() => new Animated.Value(0), []);
  const smile = useMemo(() => new Animated.Value(0), []);
  const alertness = useMemo(() => new Animated.Value(0), []);
  const irisLookY = useMemo(() => new Animated.Value(0), []);

  // Mouth (viseme driven).
  const mouthOpen = useMemo(() => new Animated.Value(VISEME_SHAPES.rest.open), []);
  const mouthWidth = useMemo(() => new Animated.Value(VISEME_SHAPES.rest.width), []);
  const lipFull = useMemo(() => new Animated.Value(VISEME_SHAPES.rest.full), []);

  // Materialization on mount.
  useEffect(() => {
    Animated.timing(boot, {
      toValue: 1,
      duration: 760,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [boot]);

  // Floating bob + halo breathing + idle head sway.
  useEffect(() => {
    if (reduceMotion) {
      bob.setValue(0);
      halo.setValue(0);
      sway.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 3200 / hue.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 3200 / hue.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1,
          duration: 1500 / hue.speed,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(halo, {
          toValue: 0,
          duration: 1500 / hue.speed,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    // A hologram that never moves reads as a texture; a slow sway reads as a
    // person. It speeds up slightly while Gideon talks.
    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 4200 / hue.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 4200 / hue.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    bobLoop.start();
    haloLoop.start();
    swayLoop.start();
    return () => {
      bobLoop.stop();
      haloLoop.stop();
      swayLoop.stop();
    };
  }, [bob, halo, sway, hue.speed, reduceMotion]);

  // HUD projector rings — slow counter-rotation.
  useEffect(() => {
    if (reduceMotion) {
      spinA.setValue(0);
      spinB.setValue(0);
      return;
    }
    const loopA = Animated.loop(
      Animated.timing(spinA, {
        toValue: 1,
        duration: 16000 / hue.speed,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const loopB = Animated.loop(
      Animated.timing(spinB, {
        toValue: 1,
        duration: 11000 / hue.speed,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [spinA, spinB, hue.speed, reduceMotion]);

  // Vertical hologram sweep (head rebuild pass).
  useEffect(() => {
    if (reduceMotion) {
      sweep.setValue(0);
      sweepEcho.setValue(0);
      return;
    }
    const makeSweep = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(duration * 0.35),
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    const loop = makeSweep(sweep, 2300 / hue.speed);
    const echo = makeSweep(sweepEcho, 3100 / hue.speed);
    loop.start();
    echo.start();
    return () => {
      loop.stop();
      echo.stop();
    };
  }, [sweep, sweepEcho, hue.speed, reduceMotion]);

  // Projection flicker — subtle, never epileptic. Purely atmospheric, so it
  // is one of the first things to go under reduce-motion.
  useEffect(() => {
    if (reduceMotion) {
      flicker.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 0.9, duration: 70, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.94, duration: 55, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 1, duration: 340, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [flicker, reduceMotion]);

  // Blinking and looking. A metronome blink over a sine-wave gaze is exactly
  // what makes a rendered face read as a mannequin: real eyes blink at uneven
  // intervals and jump to a new fixation (saccade) instead of gliding.
  useEffect(() => {
    let alive = true;
    let blinkTimer: ReturnType<typeof setTimeout>;
    let lookTimer: ReturnType<typeof setTimeout>;

    const doBlink = () => {
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 70, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
      ]).start(() => {
        if (!alive) return;
        blinkTimer = setTimeout(doBlink, 1800 + Math.random() * 3800);
      });
    };

    const doLook = () => {
      Animated.parallel([
        Animated.timing(irisDrift, {
          toValue: Math.random() * 2 - 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(irisLookY, {
          toValue: (Math.random() * 2 - 1) * 0.7,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!alive) return;
        lookTimer = setTimeout(doLook, 1100 + Math.random() * 3600);
      });
    };

    blinkTimer = setTimeout(doBlink, 1200 + Math.random() * 2200);
    lookTimer = setTimeout(doLook, 800 + Math.random() * 1500);
    return () => {
      alive = false;
      clearTimeout(blinkTimer);
      clearTimeout(lookTimer);
    };
  }, [blink, irisDrift, irisLookY]);

  // The furrow follows his state day-to-day (reasoning, building).
  useEffect(() => {
    Animated.timing(knit, {
      toValue: browFurrowFor(status),
      duration: 300,
      easing: Easing.out(Easing.cubic),
      // `knit` ultimately drives SVG layout attributes (including eyebrow
      // geometry). React Native's native driver only supports opacity and
      // transforms; marking this native produced a runtime validation error
      // and could drop the animation on device.
      useNativeDriver: false,
    }).start();
  }, [knit, status]);

  // A task that settles on its own (any working state falling back to idle)
  // earns the same brief smile as an explicitly reported success.
  const prevStatus = useRef<AssistantStatus>(status);
  const smileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSmile, setAutoSmile] = useState(false);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (earnsAutoSmile(was, status)) {
      setAutoSmile(true);
      if (smileTimer.current) clearTimeout(smileTimer.current);
      smileTimer.current = setTimeout(() => setAutoSmile(false), AUTO_SMILE_MS);
    }
  }, [status]);
  useEffect(
    () => () => {
      if (smileTimer.current) clearTimeout(smileTimer.current);
    },
    []
  );

  useEffect(() => {
    const { smile: happy } = expressionTargets({ status, mood, autoSmile });
    Animated.timing(smile, {
      toValue: happy,
      duration: happy ? 260 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [smile, status, mood, autoSmile]);

  // A failure stiffens him: the brows snap up and the eyes open wider.
  useEffect(() => {
    const { alertness: alarmed } = expressionTargets({ status, mood, autoSmile });
    Animated.timing(alertness, {
      toValue: alarmed,
      duration: alarmed ? 170 : 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [alertness, status, mood, autoSmile]);

  // Sound rings from the projector base while Gideon talks or listens.
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (status === 'speaking' || status === 'listening') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(ringPulse, {
            toValue: 1,
            duration: 1500 / hue.speed,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ringPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
      loop.start();
    } else {
      ringPulse.setValue(0);
    }
    return () => loop?.stop();
  }, [status, ringPulse, hue.speed]);

  // ---------------------------------------------------------------- Lip sync
  // Every viseme frame animates the three mouth parameters over exactly its
  // own duration, so the lips land on the right shape at the right time.
  useEffect(() => {
    const animateTo = (viseme: VisemeId, durationMs: number) => {
      const shape = VISEME_SHAPES[viseme];
      const duration = Math.max(45, Math.min(durationMs, 420));
      const easing = Easing.inOut(Easing.quad);
      Animated.parallel([
        Animated.timing(mouthOpen, { toValue: shape.open, duration, easing, useNativeDriver: false }),
        Animated.timing(mouthWidth, { toValue: shape.width, duration, easing, useNativeDriver: false }),
        Animated.timing(lipFull, { toValue: shape.full, duration, easing, useNativeDriver: false }),
      ]).start();
    };
    // Either not speaking, or the utterance is still being synthesized (the
    // voice engine has not reported playback start, so there is no text yet).
    // Articulating an empty transcript is exactly what made the lips flap in
    // silence for a second or two before the answer became audible.
    if (status !== 'speaking' || !speechText.trim()) {
      animateTo('rest', 260);
      return;
    }

    const frames = textToVisemes(speechText, { rate: speechRate });
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let tail: ReturnType<typeof setInterval> | null = null;

    let elapsed = 0;
    frames.forEach((frame) => {
      const at = elapsed;
      timeouts.push(
        setTimeout(() => {
          if (!cancelled) animateTo(frame.viseme, frame.durationMs);
        }, at)
      );
      elapsed += frame.durationMs;
    });

    // If the real TTS outlasts the estimated timeline (or there is no text at
    // all, e.g. demo mode), keep articulating instead of freezing mid-word.
    const tailShapes: VisemeId[] = ['A', 'E', 'O', 'I', 'U', 'L', 'T', 'MBP'];
    if (elapsed > 0) {
      timeouts.push(
        setTimeout(() => {
          if (cancelled) return;
          let index = 0;
          tail = setInterval(() => {
            if (cancelled) return;
            const viseme = tailShapes[index % tailShapes.length];
            index += 1;
            animateTo(viseme, 150);
          }, 155);
        }, elapsed)
      );
    }

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
      if (tail) clearInterval(tail);
    };
  }, [status, speechText, speechRate, mouthOpen, mouthWidth, lipFull]);

  // Do not start a JS-driven closing animation during unmount: there is no
  // frame left to display and its timer would outlive the component/test.
  useEffect(
    () => () => {
      mouthOpen.stopAnimation();
      mouthWidth.stopAnimation();
      lipFull.stopAnimation();
    },
    [mouthOpen, mouthWidth, lipFull]
  );

  // ----------------------------------------------------------- Interpolations
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.025] });
  const swayRotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-0.9deg', '0.9deg'] });
  const bootOpacity = boot;
  const bootScaleY = boot.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const bootY = boot.interpolate({ inputRange: [0, 1], outputRange: [size * 0.05, 0] });

  const amp = Math.max(0, Math.min(amplitude, 1));
  const auraOpacity = halo.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1 + amp * 0.25],
  });
  const auraScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.05] });
  const ringA = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringB = spinB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  // Head runs from y≈22 (crown) to y≈149 (chin) in the 200-unit viewBox.
  const sweepY = sweep.interpolate({ inputRange: [0, 1], outputRange: [size * 0.11, size * 0.72] });
  const sweepScaleX = sweep.interpolate({
    inputRange: [0, 0.2, 0.35, 0.55, 0.8, 1],
    outputRange: [0.26, 0.82, 1, 1, 0.7, 0.26],
  });
  const sweepOpacity = sweep.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 0.34, 0.28, 0],
  });
  const sweepEchoY = sweepEcho.interpolate({
    inputRange: [0, 1],
    outputRange: [size * 0.13, size * 0.7],
  });
  const sweepEchoOpacity = sweepEcho.interpolate({
    inputRange: [0, 0.15, 0.8, 1],
    outputRange: [0, 0.14, 0.1, 0],
  });

  const eyeScaleY = blink.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] });
  const eyeOpacity = blink.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const irisShiftX = irisDrift.interpolate({
    inputRange: [-1, 1],
    outputRange: [-px(1), px(1)],
  });
  const irisShiftY = irisLookY.interpolate({
    inputRange: [-1, 1],
    outputRange: [-px(0.6), px(0.6)],
  });

  // A smile is in the eyes as much as in the mouth (a Duchenne smile squints);
  // alarm does the opposite and opens them.
  const squint = smile.interpolate({
    inputRange: [0, 1],
    outputRange: [1, smileSquintScale(1)],
  });
  const alertWide = alertness.interpolate({
    inputRange: [0, 1],
    outputRange: [1, EXPRESSION.alarm.eyeWide],
  });
  const eyeScaleWithMood = Animated.multiply(Animated.multiply(eyeScaleY, squint), alertWide);


  // Brow furrow: the inner ends drop and travel towards each other.
  const browDrop = knit.interpolate({
    inputRange: [0, 1],
    outputRange: [0, px(EXPRESSION.furrow.drop)],
  });
  const browInwardL = knit.interpolate({
    inputRange: [0, 1],
    outputRange: [0, px(EXPRESSION.furrow.inward)],
  });
  const browInwardR = knit.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -px(EXPRESSION.furrow.inward)],
  });
  const browAngleL = knit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${EXPRESSION.furrow.angle}deg`],
  });
  const browAngleR = knit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `-${EXPRESSION.furrow.angle}deg`],
  });
  // Alarm lifts them instead of lowering them.
  const alertBrowUp = alertness.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -px(EXPRESSION.alarm.browUp)],
  });
  const browDropWithMood = Animated.add(browDrop, alertBrowUp);
  // At chip sizes a 1.1-unit brow stroke lands below a fifth of a pixel.
  const browOpacity = size >= 64 ? 1 : 0;

  // Smile: the lips lift and widen, and the creases outside the corners deepen.
  const smileLift = smile.interpolate({
    inputRange: [0, 1],
    outputRange: [0, px(smileLiftUnits(1))],
  });
  const smileWiden = smile.interpolate({
    inputRange: [0, 1],
    outputRange: [1, smileWidenScale(1)],
  });
  const smileCreases = smile.interpolate({
    inputRange: [0, 1],
    outputRange: [0, smileCreaseOpacity(1)],
  });
  const smileCreaseAngleL = smile.interpolate({
    inputRange: [0, 1],
    outputRange: ['-5deg', `-${EXPRESSION.smile.creaseAngle}deg`],
  });
  const smileCreaseAngleR = smile.interpolate({
    inputRange: [0, 1],
    outputRange: ['5deg', `${EXPRESSION.smile.creaseAngle}deg`],
  });

  // Mouth geometry, in device pixels.
  const mouthMaxGap = px(13);
  const mouthShift = mouthOpen.interpolate({
    inputRange: [0, 1],
    outputRange: [0, mouthMaxGap / 2],
  });
  const mouthShiftUp = mouthOpen.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -mouthMaxGap / 2],
  });
  const mouthGap = mouthOpen.interpolate({ inputRange: [0, 1], outputRange: [0, mouthMaxGap] });
  const mouthGapShift = mouthOpen.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -mouthMaxGap / 2],
  });
  const teethHeight = mouthOpen.interpolate({
    inputRange: [0, 1],
    outputRange: [0, mouthMaxGap * 0.38],
  });
  const teethOpacity = mouthOpen.interpolate({
    inputRange: [0, 0.18, 0.5],
    outputRange: [0, 0.15, 0.85],
  });
  const lipSeamOpacity = mouthOpen.interpolate({
    inputRange: [0, 0.22],
    outputRange: [0.6, 0],
  });

  const voiceRingScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.7] });
  const voiceRingOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  // --------------------------------------------------------------- Geometry
  // Below ~64 px the mesh and shading collapse into noise, so tiny renderings
  // (chat header chip) fall back to the silhouette + face only.
  const detailed = size >= 64;

  const headPath = HEAD_PATH;
  const neckPath = NECK_PATH;
  const bustPath = BUST_PATH;
  const columnPath = COLUMN_PATH;
  const scanLines = SCAN_LINES;
  const landmarks = LANDMARKS;

  // Face overlay geometry (eyes).
  const eyeW = px(18.8);
  const eyeH = px(10.4);
  const eyeTop = px(80.8);
  const eyeLefts = [px(72.2), px(109)];
  const irisD = eyeH * 1.15;
  const pupilD = irisD * 0.44;
  const catchD = irisD * 0.24;

  // Mouth overlay geometry.
  const mouthBoxW = px(44);
  const mouthBoxH = px(26);
  const lipW = px(26);
  const lipLeft = (mouthBoxW - lipW) / 2;
  const upperLipH = px(3.4);
  const lowerLipH = px(4.8);

  return (
    <Animated.View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          transform: [{ translateY: bobY }],
        },
      ]}
    >
      {/* Projector aura */}
      <Animated.View style={[styles.layer, { opacity: auraOpacity, transform: [{ scale: auraScale }] }]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <RadialGradient id="gideonAura" cx="50%" cy="42%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={hue.glow} stopOpacity="0.2" />
              <Stop offset="45%" stopColor={hue.glow} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={hue.glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="100" cy="84" r="97" fill="url(#gideonAura)" />
        </Svg>
      </Animated.View>

      {/* HUD projector rings */}
      <Animated.View style={[styles.layer, { transform: [{ rotate: ringA }] }]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Circle
            cx="100"
            cy="84"
            r="76"
            stroke={hue.glow}
            strokeOpacity="0.3"
            strokeWidth="0.8"
            strokeDasharray="18 6 3 6"
            fill="none"
          />
          <Circle cx="100" cy="8" r="2.2" fill={hue.core} opacity="0.85" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.layer, { transform: [{ rotate: ringB }] }]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Circle
            cx="100"
            cy="84"
            r="66"
            stroke={hue.glow}
            strokeOpacity="0.2"
            strokeWidth="0.7"
            strokeDasharray="42 10 6 10"
            fill="none"
          />
          <Circle cx="166" cy="84" r="1.6" fill={hue.core} opacity="0.6" />
        </Svg>
      </Animated.View>

      {/* Sound rings from the projector base */}
      {status === 'speaking' || status === 'listening' ? (
        <Animated.View
          style={[
            styles.voiceRing,
            {
              width: size * 0.5,
              height: size * 0.5,
              borderRadius: size * 0.25,
              borderColor: hue.glow,
              marginLeft: -size * 0.25,
              marginTop: -size * 0.25,
              top: size * 0.79,
              left: '50%',
              opacity: voiceRingOpacity,
              transform: [{ scale: voiceRingScale }],
            },
          ]}
        />
      ) : null}

      {/* The head: the vector face (see the note at the top of this file). */}
      {/* The hologram itself */}
      <Animated.View
        style={[
          styles.layer,
          {
            opacity: Animated.multiply(bootOpacity, flicker),
            transform: [{ translateY: bootY }, { scaleY: bootScaleY }, { rotate: swayRotate }],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            {/* Volume shading: key light from the upper left, as on a
                scanned head, so the face reads as 3D rather than flat. */}
            {/* The silhouette dissolves into the screen's own background colour
                instead of ending on a saturated rim. */}
            <RadialGradient id="gideonSkin" cx="42%" cy="30%" rx="80%" ry="86%">
              <Stop offset="0%" stopColor={hue.core} stopOpacity="0.22" />
              <Stop offset="40%" stopColor={hue.glow} stopOpacity="0.11" />
              <Stop offset="78%" stopColor={hue.glow} stopOpacity="0.06" />
              <Stop offset="100%" stopColor={hue.edge} stopOpacity="0.5" />
            </RadialGradient>
            <RadialGradient id="gideonHighlight" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.1" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
            {/* Hair mass: dense at the crown, dissolving into the forehead so
                the hairline is a soft transition rather than a headband. */}
            <LinearGradient id="gideonHair" x1="50%" y1="0%" x2="50%" y2="100%">
              <Stop offset="0%" stopColor={hue.deep} stopOpacity="0.5" />
              <Stop offset="62%" stopColor={hue.deep} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={hue.deep} stopOpacity="0.04" />
            </LinearGradient>
            <RadialGradient id="gideonSocket" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={hue.deep} stopOpacity="0.62" />
              <Stop offset="100%" stopColor={hue.deep} stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id="gideonColumn" x1="50%" y1="0%" x2="50%" y2="100%">
              <Stop offset="0%" stopColor={hue.glow} stopOpacity="0.2" />
              <Stop offset="72%" stopColor={hue.glow} stopOpacity="0.05" />
              <Stop offset="100%" stopColor={hue.glow} stopOpacity="0" />
            </LinearGradient>
            <RadialGradient id="gideonBase" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={hue.core} stopOpacity="0.5" />
              <Stop offset="60%" stopColor={hue.glow} stopOpacity="0.18" />
              <Stop offset="100%" stopColor={hue.glow} stopOpacity="0" />
            </RadialGradient>
            <ClipPath id="gideonHeadClip">
              <Path d={headPath} />
            </ClipPath>
          </Defs>

          {/* Projection column + base emission */}
          <Path d={columnPath} fill="url(#gideonColumn)" />
          <Ellipse cx="100" cy="197" rx="62" ry="9" fill="url(#gideonBase)" />

          {/* Ears: not two outlines but a shell — helix rim, antihelix Y, concha
              bowl, tragus and lobe. The right ear is the left one mirrored. */}
          {[false, true].map((mirror) => (
            <G
              key={`ear-${mirror ? 'r' : 'l'}`}
              transform={mirror ? 'translate(200,0) scale(-1,1)' : undefined}
            >
              <Path
                d="M 59 78 C 53 73.5 47 73.5 44 79.5 C 40.5 86 41 96 43.2 104 C 45.4 112 50.5 118.5 55.5 119.5 C 58.6 120 60.4 117.5 60.2 113.5 C 60 108 58.6 103 57.6 98 C 56.4 91.5 56.6 84 59 78 Z"
                fill="url(#gideonSkin)"
                fillOpacity="0.6"
                stroke={hue.glow}
                strokeOpacity="0.4"
                strokeWidth="0.85"
              />
              {/* Helix — the folded outer rim catches the light. */}
              <Path
                d="M 58.5 79.5 C 53.5 75.5 48.5 75.5 45.5 80.5 C 42.5 85.5 43 94 45 101"
                fill="none"
                stroke={hue.core}
                strokeOpacity="0.36"
                strokeWidth="1"
              />
              {/* Antihelix — the Y inside the shell. */}
              <Path
                d="M 51.5 101 C 48.5 97 47.5 90 49.5 84.5"
                fill="none"
                stroke={hue.glow}
                strokeOpacity="0.42"
                strokeWidth="0.8"
              />
              <Path
                d="M 51.5 101 C 54 99 55.5 96 55.5 92"
                fill="none"
                stroke={hue.glow}
                strokeOpacity="0.3"
                strokeWidth="0.7"
              />
              {/* Concha — the dark well that makes an ear read as an ear. */}
              <Ellipse
                cx="52"
                cy="101"
                rx="4.6"
                ry="7.4"
                fill={hue.deep}
                fillOpacity="0.34"
                transform="rotate(-12 52 101)"
              />
              {/* Tragus, in front of the canal. */}
              <Path
                d="M 56.5 95.5 C 58.6 97.5 58.8 101.5 56.8 103.8"
                fill="none"
                stroke={hue.glow}
                strokeOpacity="0.5"
                strokeWidth="0.9"
              />
              {/* Lobe. */}
              <Ellipse
                cx="55"
                cy="114.5"
                rx="4.6"
                ry="4.2"
                fill={hue.glow}
                fillOpacity="0.2"
                stroke={hue.glow}
                strokeOpacity="0.4"
                strokeWidth="0.6"
              />
              {/* Shadow where the shell meets the skull. */}
              <Path
                d="M 58.5 79 C 61 88 61 100 59.5 111"
                fill="none"
                stroke={hue.deep}
                strokeOpacity="0.24"
                strokeWidth="1.6"
              />
            </G>
          ))}

          {/* Neck + bust — soft strokes: a hard line under the chin reads as a
              seam rather than as a neck. */}
          <Path d={neckPath} fill={hue.glow} fillOpacity="0.09" stroke={hue.glow} strokeOpacity="0.2" strokeWidth="0.7" />
          <Path d={bustPath} fill={hue.glow} fillOpacity="0.06" stroke={hue.glow} strokeOpacity="0.2" strokeWidth="0.85" />

          {/* Head volume */}
          <Path d={headPath} fill="url(#gideonSkin)" />

          {/* Hair + forehead key light. The silhouette is the skull; the hair
              is a mass inside it, with a natural hairline: receding at the
              temples and dipping slightly at the centre. */}
          <Path
            d="M 63 46 C 68 32 82 24 100 22 C 118 24 132 32 137 42 C 137 52 136.5 57 135.5 60 C 130 51.5 124 47.5 118 46.5 C 112 45.5 106 47 100 51 C 94 47 88 45.5 82 46.5 C 76 47.5 70 51.5 64.5 60 C 63.5 57 63 52 63 46 Z"
            fill="url(#gideonHair)"
          />
          <Ellipse cx="96" cy="56" rx="30" ry="22" fill="url(#gideonHighlight)" />

          {/* Eye sockets, cheek hollows, temples, jaw shading */}
          <Ellipse cx="81.6" cy="87" rx="14.5" ry="9.5" fill="url(#gideonSocket)" />
          <Ellipse cx="118.4" cy="87" rx="14.5" ry="9.5" fill="url(#gideonSocket)" />
          <Ellipse cx="58" cy="68" rx="9" ry="17" fill={hue.deep} fillOpacity="0.22" />
          <Ellipse cx="142" cy="68" rx="9" ry="17" fill={hue.deep} fillOpacity="0.22" />
          <Ellipse cx="66" cy="110" rx="10" ry="15" fill={hue.deep} fillOpacity="0.22" />
          <Ellipse cx="134" cy="110" rx="10" ry="15" fill={hue.deep} fillOpacity="0.22" />
          {/* Jaw + forehead-to-temple shading gives the skull its roundness */}
          <Ellipse cx="100" cy="145" rx="34" ry="9" fill={hue.deep} fillOpacity="0.22" />
          <Ellipse cx="54" cy="82" rx="6" ry="14" fill={hue.deep} fillOpacity="0.18" />
          <Ellipse cx="146" cy="82" rx="6" ry="14" fill={hue.deep} fillOpacity="0.18" />
          {/* Cheekbones: the highlight sits just under the socket, and the
              hollow below it is what makes a mid-face read as bone. */}
          <Ellipse cx="73.5" cy="97" rx="10.5" ry="5" fill="#FFFFFF" fillOpacity="0.075" />
          <Ellipse cx="126.5" cy="97" rx="10.5" ry="5" fill="#FFFFFF" fillOpacity="0.05" />
          <Ellipse cx="70" cy="107" rx="8.5" ry="4.5" fill={hue.deep} fillOpacity="0.13" />
          <Ellipse cx="130" cy="107" rx="8.5" ry="4.5" fill={hue.deep} fillOpacity="0.17" />
          {/* Nose — built from planes, not from an outline. The left flank takes
              the key light, the right one falls away, the dorsum keeps a narrow
              highlight, and the tip sits over its own shadow. */}
          <Path
            d="M 92.5 76.5 C 88.5 86 87.5 97 90.5 106.5 C 93 109 96 110 100 110 C 96 107 94 99 93.5 88 C 93 83 93 79 94.5 76 Z"
            fill={hue.deep}
            fillOpacity="0.32"
          />
          <Path
            d="M 107.5 76.5 C 111.5 86 113 97 110.5 106.5 C 108 108.5 105 109.5 100 110 C 104.5 107 106.5 99 107 88 C 107.2 83 107 79 105.5 76 Z"
            fill={hue.deep}
            fillOpacity="0.45"
          />
          {/* Bridge: a soft light down the dorsum — a ridge, not a rod, so the
              highlight stays wide and low contrast. */}
          <Ellipse cx="99" cy="92" rx="4.6" ry="15" fill="#FFFFFF" fillOpacity="0.075" />
          <Path
            d="M 95 77 C 92.5 85 92 95 94 104 C 95.5 107 98 108.5 100 108.5"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.14"
            strokeWidth="1.3"
          />
          {/* Alae: the rounded wings framing the nostrils. Without them a nose
              is a rod over two holes; with them it reads as a form. */}
          <Ellipse cx="91.4" cy="111.6" rx="3.6" ry="2.9" fill="#FFFFFF" fillOpacity="0.13" />
          <Ellipse cx="108.6" cy="111.6" rx="3.6" ry="2.9" fill="#FFFFFF" fillOpacity="0.09" />
          {/* Bulb of the nose, with the tip light and the shadow it casts. */}
          <Ellipse cx="100" cy="109.5" rx="8.6" ry="6.2" fill={hue.glow} fillOpacity="0.16" />
          <Ellipse cx="97.6" cy="107.4" rx="3" ry="2.2" fill="#FFFFFF" fillOpacity="0.22" />
          <Path d="M 91 118 C 95 121.6 105 121.6 109 118 C 105 120.6 95 120.6 91 118 Z" fill={hue.deep} fillOpacity="0.48" />
          {/* Nostrils: comma shaped, wider at the wing than at the sill, and
              small — big dark openings read as piercings, not as a nose. */}
          <G transform="translate(100 115.6) scale(0.72) translate(-100 -115.6)">
            <Path
              d="M 92.2 113.4 C 90.2 114.6 90.4 117.4 92.8 117.8 C 95 118.2 96.6 116.6 96.2 115.2 C 95.6 114.4 93.6 113.6 92.2 113.4 Z"
              fill={hue.deep}
              fillOpacity="0.66"
            />
            <Path
              d="M 107.8 113.4 C 109.8 114.6 109.6 117.4 107.2 117.8 C 105 118.2 103.4 116.6 103.8 115.2 C 104.4 114.4 106.4 113.6 107.8 113.4 Z"
              fill={hue.deep}
              fillOpacity="0.66"
            />
          </G>
          {/* Mouth surround + chin */}
          {/* Just enough shadow to seat the lips — a large one turns the mouth
              into a hole in the middle of the face. */}
          <Ellipse cx="100" cy="131" rx="14.5" ry="7.5" fill={hue.deep} fillOpacity="0.14" />
          {/* Cupid's bow shadow, philtrum ridges and the commissures: the three
              details that make the mouth belong to the face. */}
          <Path d="M 91 126.5 C 94.5 130 105.5 130 109 126.5 C 105 128 95 128 91 126.5 Z" fill={hue.deep} fillOpacity="0.34" />
          {/* One philtrum groove, not a set of ribs: three vertical lines under
              the nose read as a barcode. */}
          <Path d="M 100 119.5 L 100 125.5" stroke={hue.glow} strokeOpacity="0.14" strokeWidth="1.1" />
          <Ellipse cx="86.2" cy="130.4" rx="1.7" ry="2.1" fill={hue.deep} fillOpacity="0.55" />
          <Ellipse cx="113.8" cy="130.4" rx="1.7" ry="2.1" fill={hue.deep} fillOpacity="0.55" />
          <Ellipse cx="100" cy="145" rx="9" ry="5" fill="#FFFFFF" fillOpacity="0.1" />
          <Ellipse cx="100" cy="152.5" rx="22" ry="7" fill={hue.deep} fillOpacity="0.3" />

          {/* Anatomical line work: lids, nose, lips, chin. The brows are NOT
              here — they are drawn in the animated overlay so they can knit. */}
          <G stroke={hue.glow} strokeOpacity="0.32" strokeWidth="0.7" fill="none">
            {/* upper eyelid creases */}
            <Path d="M 66.5 80 C 73.5 75.5 84 75.5 91.5 80" />
            <Path d="M 133.5 80 C 126.5 75.5 116 75.5 108.5 80" />
            {/* lower lids */}
            <Path d="M 70 92.5 C 76 95.6 86 95.6 92.5 91.5" strokeOpacity="0.26" />
            <Path d="M 130 92.5 C 124 95.6 114 95.6 107.5 91.5" strokeOpacity="0.26" />
            {/* alar crease — the groove that hooks from the wing towards the
                inner eye, and the columella between the nostrils */}
            <Path d="M 91 106 C 86 109 84.5 113.5 87 116.6" strokeOpacity="0.42" strokeWidth="1" />
            <Path d="M 109 106 C 114 109 115.5 113.5 113 116.6" strokeOpacity="0.42" strokeWidth="1" />
            <Path d="M 100 112.5 L 100 116.5" strokeOpacity="0.22" strokeWidth="0.8" />
            {/* nasolabial folds */}
            <Path d="M 86.5 108 C 83 116 84 125 89 131" strokeOpacity="0.16" />
            <Path d="M 113.5 108 C 117 116 116 125 111 131" strokeOpacity="0.16" />
            {/* chin crease, jaw line */}
            <Path d="M 92 141.5 C 96 144.5 104 144.5 108 141.5" strokeOpacity="0.22" />
            <Path d="M 61 118 C 68 128 79 137.5 91 144" strokeOpacity="0.18" />
            <Path d="M 139 118 C 132 128 121 137.5 109 144" strokeOpacity="0.18" />
            {/* neck sternocleidomastoid + collarbone */}
            <Path d="M 79 149 L 75 167" strokeOpacity="0.22" />
            <Path d="M 121 149 L 125 167" strokeOpacity="0.22" />
            <Path d="M 62 180 C 78 188 122 188 138 180" strokeOpacity="0.2" />
          </G>

          {/* Hologram scan grid, clipped to the face */}
          {detailed ? (
            <G clipPath="url(#gideonHeadClip)">
              <G stroke={hue.glow} strokeOpacity="0.07" strokeWidth="0.5">
                {scanLines.map((y) => (
                  <Path key={`scan-${y}`} d={`M 52 ${y} L 148 ${y}`} />
                ))}
              </G>
              <G stroke={hue.glow} strokeOpacity="0.06" strokeWidth="0.5">
                <Path d="M 84 20 L 80 152" />
                <Path d="M 100 20 L 100 152" />
                <Path d="M 116 20 L 120 152" />
              </G>
            </G>
          ) : null}

          {/* Facial landmark dots — the "face tracking" read-out */}
          {detailed ? (
            <G fill={hue.core} fillOpacity="0.32">
              {landmarks.map(([cx, cy], i) => (
                <Circle key={`lm-${i}`} cx={cx} cy={cy} r="0.7" />
              ))}
            </G>
          ) : null}

          {/* Silhouette edge */}
          <Path d={headPath} fill="none" stroke={hue.glow} strokeOpacity="0.7" strokeWidth="1.25" />
        </Svg>
      </Animated.View>

      {/* Vertical sweep scans (detailed sizes only) */}
      {detailed ? (
        <>
          <Animated.View
            style={[
              styles.layer,
              {
                opacity: Animated.multiply(bootOpacity, sweepOpacity),
                transform: [{ translateY: sweepY }],
              },
            ]}
          >
            <Animated.View
              style={{
                position: 'absolute',
                left: size * 0.3,
                width: size * 0.4,
                height: 2,
                borderRadius: 2,
                backgroundColor: hue.core,
                // Widening/narrowing with the skull silhouette keeps the sweep
                // inside Gideon's head instead of cutting across empty space.
                transform: [{ scaleX: sweepScaleX }],
              }}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.layer,
              { opacity: sweepEchoOpacity, transform: [{ translateY: sweepEchoY }] },
            ]}
          >
            <View
              style={{
                position: 'absolute',
                left: size * 0.33,
                width: size * 0.34,
                height: 1,
                borderRadius: 1,
                backgroundColor: hue.glow,
              }}
            />
          </Animated.View>
        </>
      ) : null}

      {/* Face overlay: eyes and mouth, gated on the projection boot/flicker */}
      <Animated.View
        style={[styles.layer, { opacity: Animated.multiply(bootOpacity, flicker) }]}
      >
        {/* Eyes: almond aperture, iris, pupil, catch light, lid shadow. */}
        {eyeLefts.map((left, i) => (
          <Animated.View
            key={`eye-${i}`}
            style={{
              position: 'absolute',
              left,
              top: eyeTop,
              width: eyeW,
              height: eyeH,
              borderRadius: eyeH / 2,
              overflow: 'hidden',
              backgroundColor: 'rgba(206,240,250,0.46)',
              opacity: eyeOpacity,
              transform: [
                { rotate: i === 0 ? '-3deg' : '3deg' },
                { scaleY: eyeScaleWithMood },
              ],
              shadowColor: hue.glow,
              shadowOpacity: 0.9,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                left: (eyeW - irisD) / 2,
                top: (eyeH - irisD) / 2,
                width: irisD,
                height: irisD,
                borderRadius: irisD / 2,
                backgroundColor: hue.iris,
                borderWidth: 0.7,
                borderColor: hue.core,
                transform: [{ translateX: irisShiftX }, { translateY: irisShiftY }],
              }}
            />
            <Animated.View
              style={{
                position: 'absolute',
                left: (eyeW - pupilD) / 2,
                top: (eyeH - pupilD) / 2,
                width: pupilD,
                height: pupilD,
                borderRadius: pupilD / 2,
                backgroundColor: '#04121A',
                transform: [{ translateX: irisShiftX }, { translateY: irisShiftY }],
              }}
            />
            <Animated.View
              style={{
                position: 'absolute',
                left: (eyeW - irisD) / 2 + irisD * 0.2,
                top: (eyeH - irisD) / 2 + irisD * 0.16,
                width: catchD,
                height: catchD,
                borderRadius: catchD / 2,
                backgroundColor: '#FFFFFF',
                opacity: 0.95,
                transform: [{ translateX: irisShiftX }, { translateY: irisShiftY }],
              }}
            />
            {/* Upper lid shadow + lash line + lower lid */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: eyeH * 0.34,
                backgroundColor: 'rgba(4,24,34,0.4)',
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1.4,
                backgroundColor: hue.core,
                opacity: 0.85,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: hue.core,
                opacity: 0.3,
              }}
            />
          </Animated.View>
        ))}

        {/* Brows — animated, so he can furrow them while reasoning. */}
        {[
          {
            box: '64.5 64.5 27 9',
            path: 'M 66 73 C 72 67.5 82 66.5 90.5 70',
            left: px(64.5),
            inward: browInwardL,
            angle: browAngleL,
          },
          {
            box: '108.5 64.5 27 9',
            path: 'M 134 73 C 128 67.5 118 66.5 109.5 70',
            left: px(108.5),
            inward: browInwardR,
            angle: browAngleR,
          },
        ].map((brow, i) => (
          <Animated.View
            key={`brow-${i}`}
            style={{
              position: 'absolute',
              left: brow.left,
              top: px(64.5),
              width: px(27),
              height: px(9),
              opacity: browOpacity,
              transform: [
                { translateY: browDropWithMood },
                { translateX: brow.inward },
                { rotate: brow.angle },
              ],
            }}
          >
            <Svg width={px(27)} height={px(9)} viewBox={brow.box}>
              <Path
                d={brow.path}
                fill="none"
                stroke={hue.glow}
                strokeOpacity="0.42"
                strokeWidth="1.1"
              />
            </Svg>
          </Animated.View>
        ))}

        {/* Smile creases: the folds outside the mouth corners deepen when he
            smiles — without them the lifted lips alone read as a grimace. */}
        {[
          { box: '80 121 10 12', path: 'M 88 123.5 C 83.5 125 81.5 128.5 82.5 133', left: px(80), angle: smileCreaseAngleL },
          {
            box: '110 121 10 12',
            path: 'M 112 123.5 C 116.5 125 118.5 128.5 117.5 133',
            left: px(110),
            angle: smileCreaseAngleR,
          },
        ].map((crease, i) => (
          <Animated.View
            key={`smile-${i}`}
            style={{
              position: 'absolute',
              left: crease.left,
              top: px(121),
              width: px(10),
              height: px(12),
              opacity: smileCreases,
              transform: [{ rotate: crease.angle }],
            }}
          >
            <Svg width={px(10)} height={px(12)} viewBox={crease.box}>
              <Path
                d={crease.path}
                fill="none"
                stroke={hue.glow}
                strokeOpacity="0.9"
                strokeWidth="1.2"
              />
            </Svg>
          </Animated.View>
        ))}

        {/* Mouth: lips, cavity, teeth — all driven by the viseme timeline. */}
        <View
          style={{
            position: 'absolute',
            left: px(78),
            top: px(116),
            width: mouthBoxW,
            height: mouthBoxH,
          }}
        >
          {/* Cavity (shows through the lip opening) */}
          <Animated.View
            style={{
              position: 'absolute',
              left: lipLeft + px(1.5),
              width: lipW - px(3),
              top: '50%',
              height: mouthGap,
              borderRadius: px(1.6),
              backgroundColor: '#03131C',
              transform: [{ translateY: mouthGapShift }],
            }}
          />
          {/* Upper teeth */}
          <Animated.View
            style={{
              position: 'absolute',
              left: lipLeft + px(2.6),
              width: lipW - px(5.2),
              top: '50%',
              height: teethHeight,
              borderBottomLeftRadius: px(1.4),
              borderBottomRightRadius: px(1.4),
              backgroundColor: 'rgba(240,255,255,0.92)',
              opacity: teethOpacity,
              transform: [{ translateY: mouthGapShift }],
            }}
          />
          {/* Upper lip — a real vermilion border: two peaks, the tubercle dip
              between them, tapering into the commissures. */}
          <Animated.View
            style={{
              position: 'absolute',
              left: lipLeft,
              width: lipW,
              top: '50%',
              marginTop: -upperLipH,
              height: upperLipH,
              opacity: 0.92,
              transform: [
                { translateY: Animated.add(mouthShiftUp, smileLift) },
                { scaleX: Animated.multiply(mouthWidth, smileWiden) },
                { scaleY: lipFull },
              ],
            }}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 26">
              <Defs>
                <LinearGradient id="gideonUpperLip" x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor={hue.lip} stopOpacity="0.95" />
                  <Stop offset="72%" stopColor={hue.deep} stopOpacity="0.92" />
                  <Stop offset="100%" stopColor={hue.deep} stopOpacity="0.96" />
                </LinearGradient>
              </Defs>
              <Path
                d="M 2 23 C 7 13 16 7 26 8.2 C 34 9.2 42 14 50 14 C 58 14 66 9.2 74 8.2 C 84 7 93 13 98 23 C 90 25.6 62 26 50 26 C 38 26 10 25.6 2 23 Z"
                fill="url(#gideonUpperLip)"
              />
              {/* Light on the left peak, the tubercle catches a little too. */}
              <Path d="M 20 9.5 C 26 11.5 34 15 42 16" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="1.3" fill="none" />
              <Path d="M 80 9.5 C 74 11.5 66 15 58 16" stroke="#FFFFFF" strokeOpacity="0.09" strokeWidth="1.3" fill="none" />
            </Svg>
          </Animated.View>
          {/* Lower lip — fuller, with the shadow of the upper lip across its top
              and a light catch in the middle. */}
          <Animated.View
            style={{
              position: 'absolute',
              left: lipLeft,
              width: lipW,
              top: '50%',
              height: lowerLipH,
              opacity: 0.92,
              transform: [
                { translateY: Animated.add(mouthShift, smileLift) },
                { scaleX: Animated.multiply(mouthWidth, smileWiden) },
                { scaleY: lipFull },
              ],
            }}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 26">
              <Defs>
                <LinearGradient id="gideonLowerLip" x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor={hue.deep} stopOpacity="0.9" />
                  <Stop offset="42%" stopColor={hue.lip} stopOpacity="0.95" />
                  <Stop offset="100%" stopColor={hue.lip} stopOpacity="0.72" />
                </LinearGradient>
              </Defs>
              <Path
                d="M 2 2 C 12 0.2 30 -0.5 50 -0.5 C 70 -0.5 88 0.2 98 2 C 95 17 76 25 50 25 C 24 25 5 17 2 2 Z"
                fill="url(#gideonLowerLip)"
              />
              <Ellipse cx="46" cy="15" rx="14" ry="5" fill="#FFFFFF" fillOpacity="0.12" />
            </Svg>
          </Animated.View>
          {/* Lip seam: keeps closed lips readable as two lips. */}
          <Animated.View
            style={{
              position: 'absolute',
              left: lipLeft + px(1),
              width: lipW - px(2),
              top: '50%',
              height: 1,
              borderRadius: 1,
              backgroundColor: '#04141C',
              opacity: lipSeamOpacity,
            }}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // RN 0.86 deprecated the pointerEvents prop — keep it in the style.
    pointerEvents: 'none',
  },
  voiceRing: {
    position: 'absolute',
    borderWidth: 1,
    pointerEvents: 'none',
  },
});
