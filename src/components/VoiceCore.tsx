import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Mic, Square, Waves } from 'lucide-react-native';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';

export type VoiceCoreState = 'idle' | 'listening' | 'speaking' | 'busy';

interface VoiceCoreProps {
  state: VoiceCoreState;
  /** 0.0 – 1.0 live microphone / voice amplitude. */
  amplitude: number;
  /** Accent colour of the active theme (used for the idle state). */
  accentColor?: string;
  onPress: () => void;
  /** Fired when the user taps while SEVEN is speaking (stop). */
  onStop: () => void;
  /** 24 ticks around the core by default. */
  tickCount?: number;
  size?: number;
  /** Accessibility labels (localised by the caller). */
  talkLabel?: string;
  stopLabel?: string;
}

const TICK_COUNT = 24;

/**
 * The voice-mode control: not a flat circle but a small instrument.
 *
 * - a graduated tick ring that lights up in a travelling wave while listening,
 * - an amplitude ring that expands with the live voice level,
 * - rotating calibration rings,
 * - a shockwave on press,
 * - and a mic ⇄ stop glyph that cross-fades with a spring.
 */
export const VoiceCore: React.FC<VoiceCoreProps> = ({
  state,
  amplitude,
  accentColor,
  onPress,
  onStop,
  tickCount = TICK_COUNT,
  size = 168,
  talkLabel,
  stopLabel,
}) => {
  const palette = useTheme();
  const styles = useThemeStyles(coreStyles);

  const accent =
    state === 'listening' ? palette.error : state === 'speaking' ? palette.success : accentColor || palette.accent;

  const spin = useMemo(() => new Animated.Value(0), []);
  const spinReverse = useMemo(() => new Animated.Value(0), []);
  const breathe = useMemo(() => new Animated.Value(0), []);
  const tickWave = useMemo(() => new Animated.Value(0), []);
  const press = useMemo(() => new Animated.Value(0), []);
  const shock = useMemo(() => new Animated.Value(0), []);
  const amp = useMemo(() => new Animated.Value(0), []);
  const rings = useMemo(() => new Animated.Value(0), []);
  const ringsEcho = useMemo(() => new Animated.Value(0), []);
  const glyph = useMemo(() => new Animated.Value(1), []);
  const wasSpeaking = useRef(false);

  const amplitudeValue = Math.max(0, Math.min(amplitude, 1));
  const hasSignal = amplitudeValue > 0.02;

  // Live amplitude → visual scale (no per-frame bridge traffic: the SVG ring
  // just follows the smoothed value we already have in the store).
  useEffect(() => {
    Animated.timing(amp, {
      toValue: state === 'listening' && hasSignal ? amplitudeValue : 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [amp, amplitudeValue, hasSignal, state]);

  // Calibration rings + halo breathing.
  useEffect(() => {
    const loopOuter = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const loopInner = Animated.loop(
      Animated.timing(spinReverse, {
        toValue: 1,
        duration: 11000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const loopBreathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: state === 'listening' ? 620 : state === 'speaking' ? 520 : 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: state === 'listening' ? 620 : state === 'speaking' ? 520 : 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loopOuter.start();
    loopInner.start();
    loopBreathe.start();
    return () => {
      loopOuter.stop();
      loopInner.stop();
      loopBreathe.stop();
    };
  }, [spin, spinReverse, breathe, state]);

  // Travelling wave over the tick ring while listening.
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (state === 'listening') {
      tickWave.setValue(0);
      loop = Animated.loop(
        Animated.timing(tickWave, {
          toValue: 1,
          duration: 1900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
    }
    return () => {
      loop?.stop();
      tickWave.setValue(0);
    };
  }, [state, tickWave]);

  // Expanding rings while transmitting.
  useEffect(() => {
    if (state !== 'speaking') {
      rings.setValue(0);
      ringsEcho.setValue(0);
      return;
    }
    // Two ripples half a cycle apart read as one continuous transmission.
    const makeRipple = (value: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const first = makeRipple(rings);
    const second = makeRipple(ringsEcho);
    first.start();
    const offset = setTimeout(() => second.start(), 750);
    return () => {
      clearTimeout(offset);
      first.stop();
      second.stop();
    };
  }, [state, rings, ringsEcho]);

  // Glyph swap: mic ⇄ stop when SEVEN starts/stops talking.
  useEffect(() => {
    const speaking = state === 'speaking';
    if (speaking !== wasSpeaking.current) {
      wasSpeaking.current = speaking;
      Animated.spring(glyph, {
        toValue: speaking ? 0 : 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }).start();
    }
  }, [state, glyph]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(press, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.spring(press, { toValue: 0, friction: 5, tension: 140, useNativeDriver: true }),
    ]).start();

    shock.setValue(0);
    Animated.timing(shock, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    if (state === 'speaking') onStop();
    else onPress();
  };

  const rotateOuter = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateInner = spinReverse.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.98, state === 'idle' ? 1.02 : 1.06] });
  // Soft emitter glow only: a bright fill would swallow the tick ring.
  const breatheOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: state === 'idle' ? [0.06, 0.12] : [0.12, 0.26],
  });
  const buttonScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const shockScale = shock.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.75] });
  const shockOpacity = shock.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
  const ampScale = amp.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.3] });
  const ampOpacity = amp.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] });
  const ringScale = rings.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.55] });
  const ringOpacity = rings.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] });
  const ringEchoScale = ringsEcho.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.55] });
  const ringEchoOpacity = ringsEcho.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] });
  const glyphIn = glyph.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const stopIn = glyph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const glyphScaleIn = glyph.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const stopScaleIn = glyph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });

  const ringSize = size * 0.62;
  const buttonSize = size * 0.46;
  const tickInset = size * 0.07;

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      {/* Outer halo */}
      <Animated.View
        style={[
          styles.halo,
          {
            width: size * 0.92,
            height: size * 0.92,
            borderRadius: size * 0.46,
            backgroundColor: accent,
            opacity: breatheOpacity,
            transform: [{ scale: breatheScale }],
          },
        ]}
      />

      {/* Aperture ring around the button */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 0.58,
          height: size * 0.58,
          borderRadius: size * 0.29,
          borderWidth: 1,
          borderColor: accent,
          opacity: 0.35,
        }}
      />

      {/* Press shockwave */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.9,
            height: size * 0.9,
            borderRadius: size * 0.45,
            borderColor: accent,
            opacity: shockOpacity,
            transform: [{ scale: shockScale }],
          },
        ]}
      />

      {/* Transmit ripples */}
      {state === 'speaking' ? (
        <>
          <Animated.View
            style={[
              styles.ring,
              {
                width: size * 0.8,
                height: size * 0.8,
                borderRadius: size * 0.4,
                borderColor: accent,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                width: size * 0.8,
                height: size * 0.8,
                borderRadius: size * 0.4,
                borderColor: accent,
                opacity: ringEchoOpacity,
                transform: [{ scale: ringEchoScale }],
              },
            ]}
          />
        </>
      ) : null}

      {/* Amplitude ring — grows with the live voice level */}
      <Animated.View
        style={[
          styles.ampRing,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: accent,
            opacity: ampOpacity,
            transform: [{ scale: ampScale }],
          },
        ]}
      />

      {/* Rotating calibration rings */}
      <Animated.View style={[styles.layer, { transform: [{ rotate: rotateOuter }] }]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Circle
            cx="100"
            cy="100"
            r="86"
            stroke={accent}
            strokeOpacity="0.45"
            strokeWidth="0.8"
            strokeDasharray="16 6 3 6"
            fill="none"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.layer, { transform: [{ rotate: rotateInner }] }]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Circle
            cx="100"
            cy="100"
            r="72"
            stroke={accent}
            strokeOpacity="0.28"
            strokeWidth="0.6"
            strokeDasharray="2 8"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Graduated ticks: a travelling light runs through them while listening */}
      {Array.from({ length: tickCount }).map((_, i) => {
        const phase = i / tickCount;
        const lit = Animated.add(
          Animated.modulo(Animated.add(tickWave, phase), 1),
          0
        ).interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 0.12, 1],
        });
        return (
          <View
            key={`tick-${i}`}
            pointerEvents="none"
            style={[
              styles.tickSlot,
              {
                width: size,
                height: size,
                paddingTop: tickInset,
                transform: [{ rotate: `${(360 / tickCount) * i}deg` }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.tick,
                {
                  height: i % 4 === 0 ? size * 0.05 : size * 0.028,
                  width: i % 4 === 0 ? 2 : 1.4,
                  backgroundColor: accent,
                  opacity: state === 'listening' ? lit : 0.5,
                },
              ]}
            />
          </View>
        );
      })}

      {/* The button */}
      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={state === 'speaking' ? stopLabel : talkLabel}
          style={[
            styles.button,
            {
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
              borderColor: accent,
              backgroundColor: 'rgba(3,12,18,0.72)',
            },
          ]}
        >
          {/* Inner emitter glow — lit, but never a flooded cyan disc. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: buttonSize * 0.78,
              height: buttonSize * 0.78,
              borderRadius: buttonSize * 0.39,
              backgroundColor: accent,
              opacity: 0.14,
            }}
          />
          {state === 'busy' ? (
            <Waves size={buttonSize * 0.42} color={accent} />
          ) : (
            <>
              <Animated.View
                style={[
                  styles.glyph,
                  { opacity: glyphIn, transform: [{ scale: glyphScaleIn }] },
                ]}
              >
                <Mic size={buttonSize * 0.42} color={accent} />
              </Animated.View>
              <Animated.View
                style={[
                  styles.glyph,
                  { opacity: stopIn, transform: [{ scale: stopScaleIn }] },
                ]}
              >
                <Square size={buttonSize * 0.3} color={accent} fill={accent} />
              </Animated.View>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const coreStyles = (t: Palette) =>
  ({
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
      pointerEvents: 'none',
    },
    halo: {
      position: 'absolute',
      opacity: 0.4,
    },
    ring: {
      position: 'absolute',
      borderWidth: 1,
    },
    ampRing: {
      position: 'absolute',
      borderWidth: 1.5,
    },
    tickSlot: {
      position: 'absolute',
      top: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'flex-start',
      pointerEvents: 'none',
    },
    tick: {
      width: 1.5,
      borderRadius: 1,
      marginTop: 2,
    },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    glyph: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
  } as const);
