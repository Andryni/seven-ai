import React, { useEffect, useMemo, useState } from 'react';
import { View, Dimensions, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';

const WINDOW = Dimensions.get('window');

interface Particle {
  id: number;
  x: number;
  y: number;
  r: number;
  opacity: number;
  color: string;
}

/**
 * One layer of drifting dust.
 *
 * The field is periodic: particles live in a single viewport-height band, and
 * the layer renders that band **twice**, stacked. Translating the pair by
 * exactly one band height and repeating is then visually seamless — there is
 * no reset to catch. Deterministic pseudo-random placement (LCG) keeps the
 * field stable across re-renders, which React Compiler requires.
 */
const DustLayer: React.FC<{
  height: number;
  count: number;
  seed: number;
  minRadius: number;
  maxRadius: number;
  opacityScale: number;
  colors: string[];
}> = ({ height, count, seed, minRadius, maxRadius, opacityScale, colors }) => {
  const particles = useMemo<Particle[]>(() => {
    let state = seed;
    const rand = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    const list: Particle[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        id: i,
        x: rand() * (WINDOW.width || 400),
        y: rand() * height,
        r: rand() * (maxRadius - minRadius) + minRadius,
        opacity: (rand() * 0.6 + 0.2) * opacityScale,
        color: colors[Math.floor(rand() * colors.length)],
      });
    }
    return list;
  }, [height, count, seed, minRadius, maxRadius, opacityScale, colors]);

  const band = (
    <Svg width="100%" height={height}>
      {particles.map((p) => (
        <Circle
          key={p.id}
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill={p.color}
          opacity={p.opacity}
        />
      ))}
    </Svg>
  );

  return (
    <Animated.View style={{ position: 'absolute', top: -height, left: 0, right: 0 }}>
      {band}
      {band}
    </Animated.View>
  );
};

export const ParticleBackground: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const palette = useTheme();
  const styles = useThemeStyles(particleStyles);
  const [height, setHeight] = useState(WINDOW.height || 800);

  const driftFar = useMemo(() => new Animated.Value(0), []);
  const driftNear = useMemo(() => new Animated.Value(0), []);
  const breathe = useMemo(() => new Animated.Value(0), []);

  // Dust rises slowly, forever, at two speeds for a parallax read.
  useEffect(() => {
    const far = Animated.loop(
      Animated.timing(driftFar, {
        toValue: 1,
        duration: 96000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const near = Animated.loop(
      Animated.timing(driftNear, {
        toValue: 1,
        duration: 54000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    far.start();
    near.start();
    return () => {
      far.stop();
      near.stop();
    };
  }, [driftFar, driftNear]);

  // The core glow breathes, so the backdrop is never perfectly still.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const farColors = useMemo(
    () => [palette.orbOuter, palette.orbInner, palette.info],
    [palette.orbOuter, palette.orbInner, palette.info]
  );
  const nearColors = useMemo(
    () => [palette.accent, palette.accentStrong, palette.warning],
    [palette.accent, palette.accentStrong, palette.warning]
  );

  const farY = driftFar.interpolate({ inputRange: [0, 1], outputRange: [0, -height] });
  const nearY = driftNear.interpolate({ inputRange: [0, 1], outputRange: [0, -height] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] });

  return (
    <View style={styles.container} onLayout={(e) => setHeight(e.nativeEvent.layout.height || height)}>
      {/* Deep Space / Cyber Sci-fi background */}
      <View style={styles.absoluteCover} pointerEvents="none">
        <Animated.View style={[styles.absoluteCover, { opacity: glowOpacity }]}>
          <Svg width="100%" height="100%" style={styles.absoluteCover}>
            <Defs>
              <RadialGradient id="bgGlow" cx="50%" cy="35%" rx="60%" ry="50%">
                <Stop
                  offset="0%"
                  stopColor={palette.orbOuter}
                  stopOpacity={palette.isDark ? '0.18' : '0.08'}
                />
                <Stop offset="50%" stopColor={palette.bgElevated} stopOpacity="0.95" />
                <Stop offset="100%" stopColor={palette.bg} stopOpacity="1" />
              </RadialGradient>
            </Defs>
            <Circle cx="50%" cy="35%" r="100%" fill="url(#bgGlow)" />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.absoluteCover, { transform: [{ translateY: farY }] }]}>
          <DustLayer
            height={height}
            count={26}
            seed={1337}
            minRadius={0.8}
            maxRadius={2.4}
            opacityScale={0.5}
            colors={farColors}
          />
        </Animated.View>

        <Animated.View style={[styles.absoluteCover, { transform: [{ translateY: nearY }] }]}>
          <DustLayer
            height={height}
            count={18}
            seed={90210}
            minRadius={1.1}
            maxRadius={3}
            opacityScale={0.75}
            colors={nearColors}
          />
        </Animated.View>

        {/* Subtle grid lines for HUD effect */}
        <View style={styles.gridOverlay} />
      </View>

      {children}
    </View>
  );
};

const particleStyles = (t: Palette) =>
  ({
    container: {
      flex: 1,
      backgroundColor: t.bg,
    },
    gridOverlay: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.03,
      borderWidth: 1,
      borderColor: t.accent,
    },
    absoluteCover: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
  } as const);
