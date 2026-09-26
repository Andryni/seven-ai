import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';
import { FONT } from '../theme/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BOOT_LINES = [
  'SEVEN_OS // KERNEL v3.3 BOOTING...',
  'NEURAL CORE ................. ONLINE',
  'ORBITAL HUD ARRAY ........... CALIBRATED',
  'AUDIO DSP MULTILANG ......... READY',
  'COGNITIVE MATRIX ............ SYNCHRONIZED',
];

interface LaunchSplashProps {
  /** Called once the intro animation has fully played and faded out. */
  onFinish: () => void;
}

/**
 * Full-screen animated boot sequence shown when the app launches. Purely
 * visual: it plays a fixed timeline (~2.9s) then fades itself out and hands
 * control back through onFinish. Deliberately free of store dependencies so
 * it can render before the app has finished restoring state.
 */
export const LaunchSplash: React.FC<LaunchSplashProps> = ({ onFinish }) => {
  const palette = useTheme();
  const styles = useThemeStyles(splashStyles);

  const containerOpacity = useMemo(() => new Animated.Value(1), []);
  const logoScale = useMemo(() => new Animated.Value(0.35), []);
  const logoOpacity = useMemo(() => new Animated.Value(0), []);
  const ringSpin = useMemo(() => new Animated.Value(0), []);
  const barFill = useMemo(() => new Animated.Value(0), []);
  const [step, setStep] = useState(0);
  const finishedRef = useRef(false);
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);
  // The boot log and progress fill communicate real state (the app is
  // loading) and always run; the continuous dual-ring spin is pure
  // flourish and is the only thing dropped here under reduce-motion.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Entrance
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous ring spin
    const spinLoop = reduceMotion
      ? null
      : Animated.loop(
          Animated.timing(ringSpin, {
            toValue: 1,
            duration: 2600,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        );
    spinLoop?.start();

    // Progress bar fill (width animation -> not native driver)
    Animated.timing(barFill, {
      toValue: 1,
      duration: 2100,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();

    // Boot log lines revealed one by one
    const stepTimer = setInterval(() => {
      setStep((s) => (s < BOOT_LINES.length ? s + 1 : s));
    }, 290);

    // Exit
    const exitTimer = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 480,
        delay: 120,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(finish);
    }, 2500);

    // Native animation completion callbacks can be dropped when Expo Go is
    // briefly backgrounded or the JS thread stalls during its first bundle.
    // This independent deadline guarantees the full-screen splash can never
    // remain above the dashboard and swallow navigation touches indefinitely.
    const hardDeadline = setTimeout(finish, 3400);

    return () => {
      clearInterval(stepTimer);
      clearTimeout(exitTimer);
      clearTimeout(hardDeadline);
      spinLoop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const rotate = ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const counterRotate = ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });
  const barWidth = barFill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[styles.container, { opacity: containerOpacity, backgroundColor: palette.bgDeep }]}
      onTouchEnd={finish}
      accessibilityLabel="SEVEN boot sequence. Tap to skip."
    >
      {/* Ambient radial glow */}
      <View style={styles.glowAbs} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="splashGlow" cx="50%" cy="45%" rx="55%" ry="45%">
              <Stop offset="0%" stopColor={palette.orbOuter} stopOpacity="0.35" />
              <Stop offset="55%" stopColor={palette.orbOuter} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={palette.bgDeep} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="45%" r="100%" fill="url(#splashGlow)" />
        </Svg>
      </View>

      {/* Rotating dual rings around the logo */}
      <Animated.View
        style={[styles.ring, styles.ringOuter, { transform: [{ rotate }] }]}
        pointerEvents="none"
      >
        <Svg width={190} height={190} viewBox="0 0 200 200">
          <Circle
            cx="100"
            cy="100"
            r="92"
            stroke={palette.accent}
            strokeWidth="1.5"
            strokeDasharray="24 8 6 8"
            fill="none"
            opacity="0.8"
          />
          <Circle cx="100" cy="8" r="4" fill={palette.accent} />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[styles.ring, styles.ringInner, { transform: [{ rotate: counterRotate }] }]}
        pointerEvents="none"
      >
        <Svg width={150} height={150} viewBox="0 0 200 200">
          <Circle
            cx="100"
            cy="100"
            r="90"
            stroke={palette.info}
            strokeWidth="1.2"
            strokeDasharray="40 12 8 12"
            fill="none"
            opacity="0.7"
          />
          <Circle cx="100" cy="190" r="3.5" fill={palette.info} />
        </Svg>
      </Animated.View>

      {/* Logo + title */}
      <Animated.View
        style={[
          styles.logoBlock,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <View style={styles.coreDotGlow} />
        <Text style={styles.titleText}>{palette.isDark ? 'S E V E N' : 'S E V E N'}</Text>
        <Text style={styles.subtitleText}>NEURAL ASSISTANT // INITIALIZING</Text>
      </Animated.View>

      {/* Boot log */}
      <View style={styles.bootBlock}>
        {BOOT_LINES.slice(0, step).map((line, i) => (
          <Text key={i} style={styles.bootLine}>
            {line}
          </Text>
        ))}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: barWidth }]} />
      </View>

      <Text style={styles.footerText}>SEVEN_OS // KERNEL v3.3</Text>
    </Animated.View>
  );
};

const splashStyles = (t: Palette) =>
  ({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glowAbs: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    ring: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringOuter: {
      top: '50%',
      left: '50%',
      marginTop: -95,
      marginLeft: -95,
    },
    ringInner: {
      top: '50%',
      left: '50%',
      marginTop: -75,
      marginLeft: -75,
    },
    logoBlock: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    coreDotGlow: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: t.accent,
      marginBottom: 18,
      shadowColor: t.accent,
      shadowOpacity: 0.9,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    titleText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: Math.min(38, SCREEN_WIDTH * 0.1),
      fontWeight: '900',
      letterSpacing: 6,
      textShadowColor: t.accent,
      textShadowRadius: 18,
    },
    subtitleText: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9,
      letterSpacing: 2,
      marginTop: 8,
    },
    bootBlock: {
      position: 'absolute',
      bottom: 96,
      left: 28,
      right: 28,
      minHeight: 90,
    },
    bootLine: {
      fontFamily: FONT.mono,
      color: t.success,
      fontSize: 10,
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    progressTrack: {
      position: 'absolute',
      bottom: 64,
      left: 28,
      right: 28,
      height: 3,
      backgroundColor: t.accentSoft,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: 3,
      backgroundColor: t.accent,
      borderRadius: 2,
    },
    footerText: {
      position: 'absolute',
      bottom: 28,
      fontFamily: FONT.mono,
      color: t.textFaint,
      fontSize: 9,
      letterSpacing: 3,
    },
  } as const);
