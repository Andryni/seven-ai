import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Path, G, Defs, RadialGradient, Stop, LinearGradient } from 'react-native-svg';
import { Accelerometer } from 'expo-sensors';
import { AssistantStatus } from '../types';
import { OrbShaderView } from './OrbShaderView';
import { GideonAvatar } from './GideonAvatar';

interface OrbViewProps {
  status?: AssistantStatus;
  size?: number;
  amplitude?: number; // 0.0 to 1.0 audio reactivity
  themeColor?: string;
  mode?: 'gideon' | 'vector' | 'shader';
  gyroEnabled?: boolean;
  /** Text being spoken right now — Gideon's mouth articulates it. */
  speechText?: string;
  /** TTS rate, used to time the visemes. */
  speechRate?: number;
  speechPositionMs?: number;
  speechDurationMs?: number;
  /** Transient expression: a smile after a successful action, a stiffening
      after a failure. Only Gideon has a face to wear it on. */
  mood?: 'happy' | 'alert' | null;
}

/**
 * Top-level avatar switch. Gideon (the holographic head) is the default and
 * the one wired everywhere in the UI; 'vector' and 'shader' are kept as
 * legacy engines for anyone whose saved config still points at them.
 *
 * This wrapper deliberately holds NO hooks so the engine can be swapped
 * between renders without ever violating the Rules of Hooks (previously the
 * early return sat above the useRef calls, which crashed when avatarStyle
 * changed while mounted).
 */
export const OrbView: React.FC<OrbViewProps> = ({ mode = 'gideon', mood, ...rest }) => {
  if (mode === 'shader') {
    return <OrbShaderView {...rest} />;
  }
  if (mode === 'vector') {
    return <VectorOrb {...rest} />;
  }
  return <GideonAvatar {...rest} mood={mood} />;
};

interface VectorOrbProps {
  status?: AssistantStatus;
  size?: number;
  amplitude?: number;
  themeColor?: string;
  gyroEnabled?: boolean;
}

const VectorOrb: React.FC<VectorOrbProps> = ({
  status = 'idle',
  size = 260,
  amplitude = 0,
  themeColor = '#00E5FF',
  gyroEnabled = true,
}) => {
  // Rotations & Oscillations — useMemo keeps these stable across renders and
  // avoids the react-hooks/refs violation of reading `useRef(...).current`
  // during render (values ARE needed for rendering).
  const spin1 = useMemo(() => new Animated.Value(0), []);
  const spin2 = useMemo(() => new Animated.Value(0), []);
  const spin3 = useMemo(() => new Animated.Value(0), []);
  const pulseAnim = useMemo(() => new Animated.Value(1), []);
  const glowAnim = useMemo(() => new Animated.Value(0.7), []);
  const shockwave1 = useMemo(() => new Animated.Value(0.8), []);
  const shockwave2 = useMemo(() => new Animated.Value(0.6), []);

  // Gyroscope tilt
  const tiltX = useMemo(() => new Animated.Value(0), []);
  const tiltY = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!gyroEnabled) return;
    let subscription: any = null;
    try {
      Accelerometer.setUpdateInterval(60);
      subscription = Accelerometer.addListener((data) => {
        Animated.spring(tiltX, {
          toValue: Math.max(-18, Math.min(18, data.x * 20)),
          friction: 6,
          useNativeDriver: true,
        }).start();
        Animated.spring(tiltY, {
          toValue: Math.max(-18, Math.min(18, -data.y * 20)),
          friction: 6,
          useNativeDriver: true,
        }).start();
      });
    } catch {
      // Accelerometer might be unavailable on web or emulator
    }
    return () => {
      subscription?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyroEnabled]);

  // Reactivity multiplier according to status
  const getSpeedMultiplier = () => {
    switch (status) {
      case 'thinking':
        return 3.5;
      case 'listening':
        return 2.0;
      case 'speaking':
        return 2.5;
      case 'organizing':
      case 'building':
        return 2.8;
      case 'healing':
        return 4.0;
      case 'idle':
      default:
        return 1.0;
    }
  };

  useEffect(() => {
    const speed = getSpeedMultiplier();

    const loop1 = Animated.loop(
      Animated.timing(spin1, {
        toValue: 1,
        duration: 10000 / speed,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const loop2 = Animated.loop(
      Animated.timing(spin2, {
        toValue: 1,
        duration: 7000 / speed,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const loop3 = Animated.loop(
      Animated.timing(spin3, {
        toValue: 1,
        duration: 4500 / speed,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const pulseDuration = status === 'listening' || status === 'speaking' ? 700 : 2000;
    const loopPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: status === 'speaking' ? 1.2 : status === 'listening' ? 1.15 : 1.06,
          duration: pulseDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.94,
          duration: pulseDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const loopGlow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1.0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const loopShockwaves = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(shockwave1, {
            toValue: 1.45,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(shockwave1, {
            toValue: 0.8,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(shockwave2, {
            toValue: 1.3,
            duration: 2200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(shockwave2, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    loop1.start();
    loop2.start();
    loop3.start();
    loopPulse.start();
    loopGlow.start();
    loopShockwaves.start();

    return () => {
      loop1.stop();
      loop2.stop();
      loop3.stop();
      loopPulse.stop();
      loopGlow.stop();
      loopShockwaves.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const rotate1 = spin1.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const rotate2 = spin2.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const rotate3 = spin3.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Futuristic Palette depending on Assistant Status
  const primaryColor =
    status === 'healing'
      ? '#FF3366'
      : status === 'building'
      ? '#00E5FF'
      : status === 'organizing'
      ? '#00FFA3'
      : status === 'thinking'
      ? '#BD00FF'
      : themeColor || '#00E5FF';

  const secondaryColor =
    status === 'healing'
      ? '#FF80A0'
      : status === 'building'
      ? '#7000FF'
      : status === 'organizing'
      ? '#00E5FF'
      : status === 'thinking'
      ? '#00E5FF'
      : '#0070F3';

  // Audio-reactive scale booster
  const centerScale = 0.52 + Math.min(amplitude * 0.28, 0.35);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [{ translateX: tiltX }, { translateY: tiltY }],
        },
      ]}
    >
      {/* Background radial plasma aura */}
      <Animated.View
        style={[
          styles.glowLayer,
          {
            width: size * 1.35,
            height: size * 1.35,
            opacity: glowAnim,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Svg width={size * 1.35} height={size * 1.35} viewBox="0 0 200 200">
          <Defs>
            <RadialGradient id="ambientGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={primaryColor} stopOpacity="0.45" />
              <Stop offset="35%" stopColor={secondaryColor} stopOpacity="0.22" />
              <Stop offset="75%" stopColor={primaryColor} stopOpacity="0.05" />
              <Stop offset="100%" stopColor="#030508" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="100" cy="100" r="98" fill="url(#ambientGlow)" />
        </Svg>
      </Animated.View>

      {/* Shockwave Rings for Speaking / Listening */}
      {(status === 'speaking' || status === 'listening') && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sonicWave,
              {
                width: size * 0.95,
                height: size * 0.95,
                borderColor: primaryColor,
                opacity: shockwave1.interpolate({
                  inputRange: [0.8, 1.45],
                  outputRange: [0.8, 0],
                }),
                transform: [{ scale: shockwave1 }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sonicWave,
              {
                width: size * 0.85,
                height: size * 0.85,
                borderColor: secondaryColor,
                opacity: shockwave2.interpolate({
                  inputRange: [0.6, 1.3],
                  outputRange: [0.6, 0],
                }),
                transform: [{ scale: shockwave2 }],
              },
            ]}
          />
        </>
      )}

      {/* Ring 1 - Quantum Orbital Vector at 60deg */}
      <Animated.View
        style={[
          styles.ringContainer,
          {
            width: size,
            height: size,
            transform: [{ rotateZ: '60deg' }, { rotateY: '68deg' }, { rotateZ: rotate1 }],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <LinearGradient id="ringGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={primaryColor} stopOpacity="1" />
              <Stop offset="50%" stopColor={secondaryColor} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={primaryColor} stopOpacity="0.9" />
            </LinearGradient>
          </Defs>
          <Circle
            cx="100"
            cy="100"
            r="88"
            stroke="url(#ringGrad1)"
            strokeWidth="2.5"
            strokeDasharray="22 5 8 5"
            fill="none"
          />
          <Circle cx="100" cy="12" r="5" fill="#FFFFFF" />
          <Circle cx="100" cy="12" r="9" fill={primaryColor} opacity="0.6" />
          <Circle cx="100" cy="188" r="3.5" fill={secondaryColor} />
        </Svg>
      </Animated.View>

      {/* Ring 2 - Counter Orbital Vector at -60deg */}
      <Animated.View
        style={[
          styles.ringContainer,
          {
            width: size,
            height: size,
            transform: [{ rotateZ: '-60deg' }, { rotateY: '68deg' }, { rotateZ: rotate2 }],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <LinearGradient id="ringGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={secondaryColor} stopOpacity="1" />
              <Stop offset="50%" stopColor={primaryColor} stopOpacity="0.2" />
              <Stop offset="100%" stopColor={secondaryColor} stopOpacity="0.95" />
            </LinearGradient>
          </Defs>
          <Circle
            cx="100"
            cy="100"
            r="84"
            stroke="url(#ringGrad2)"
            strokeWidth="2.2"
            strokeDasharray="30 7 12 4"
            fill="none"
          />
          <Circle cx="16" cy="100" r="4.5" fill={secondaryColor} />
          <Circle cx="16" cy="100" r="8" fill={primaryColor} opacity="0.4" />
          <Circle cx="184" cy="100" r="3.5" fill="#FFFFFF" />
        </Svg>
      </Animated.View>

      {/* Ring 3 - Equatorial Horizon Vector */}
      <Animated.View
        style={[
          styles.ringContainer,
          {
            width: size,
            height: size,
            transform: [{ rotateX: '75deg' }, { rotateZ: rotate3 }],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <LinearGradient id="ringGrad3" x1="0%" y1="50%" x2="100%" y2="50%">
              <Stop offset="0%" stopColor={primaryColor} stopOpacity="0.95" />
              <Stop offset="50%" stopColor={secondaryColor} stopOpacity="0.1" />
              <Stop offset="100%" stopColor={primaryColor} stopOpacity="0.95" />
            </LinearGradient>
          </Defs>
          <Circle
            cx="100"
            cy="100"
            r="80"
            stroke="url(#ringGrad3)"
            strokeWidth="2"
            strokeDasharray="45 10 10 10"
            fill="none"
          />
          <Circle cx="100" cy="20" r="4" fill="#FFFFFF" />
          <Circle cx="100" cy="20" r="8" fill={primaryColor} opacity="0.6" />
        </Svg>
      </Animated.View>

      {/* Center Seven AI Neural Singularity + Wireframe Geodesic Globe */}
      <Animated.View
        style={[
          styles.coreContainer,
          {
            width: size * centerScale,
            height: size * centerScale,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Defs>
            <RadialGradient id="coreGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="25%" stopColor={primaryColor} stopOpacity="0.95" />
              <Stop offset="65%" stopColor={secondaryColor} stopOpacity="0.85" />
              <Stop offset="88%" stopColor={primaryColor} stopOpacity="0.35" />
              <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Intense Core Sphere */}
          <Circle cx="60" cy="60" r="36" fill="url(#coreGlow)" />

          {/* Holographic Wireframe Grid */}
          <G stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="1" fill="none">
            <Path d="M 28 60 A 32 32 0 0 1 92 60 A 32 32 0 0 1 28 60" strokeDasharray="3 2" />
            <Path d="M 34 45 A 30 14 0 0 1 86 45" opacity="0.75" />
            <Path d="M 34 75 A 30 14 0 0 1 86 75" opacity="0.75" />
            <Path d="M 60 28 A 12 32 0 0 1 60 92 A 12 32 0 0 1 60 28" strokeDasharray="2 2" />
            <Path d="M 60 28 A 24 32 0 0 1 60 92 A 24 32 0 0 1 60 28" opacity="0.6" strokeDasharray="4 2" />
          </G>

          {/* Quantum Center Singularity */}
          <Circle cx="60" cy="60" r="10" fill="#FFFFFF" />
          <Circle cx="60" cy="60" r="16" fill={primaryColor} opacity="0.6" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  glowLayer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  ringContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coreContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  sonicWave: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1.5,
    borderStyle: 'solid',
    zIndex: 5,
  },
});
