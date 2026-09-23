import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

/**
 * Shared "SEVEN is working" motifs.
 *
 * Originally private to ChatBubble, these were the only place in the app
 * with a live, animated "in progress" cue — Organizer, Dave and Research
 * each showed a static "ORGANIZING…" / "BUILDING…" / "COMPILING…" label with
 * a dimmed button and nothing else moving. Centralizing them here lets every
 * screen reuse the same visual language ("one OS", not "several screens
 * stitched together") instead of re-inventing its own loading state.
 */

/** Three pulsing dots. Isolated component so its hooks never depend on the
 * parent's render order. */
export const TypingDots: React.FC<{ color?: string; size?: number }> = ({
  color = '#FFD700',
  size = 5,
}) => {
  const dots = useMemo(
    () => [new Animated.Value(0.25), new Animated.Value(0.25), new Animated.Value(0.25)],
    []
  );

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 170),
          Animated.timing(d, { toValue: 1, duration: 300, easing: Easing.quad, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.25, duration: 300, easing: Easing.quad, useNativeDriver: true }),
          Animated.delay((2 - i) * 170),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={loadingStyles.dotsRow}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            loadingStyles.dot,
            { width: size, height: size, borderRadius: size / 2, opacity: d, backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
};

/** Indeterminate scanning bar shown while a tool/action is running, so the
 * user sees live motion rather than static text. */
export const ScanBar: React.FC<{ color?: string }> = ({ color = '#00E5FF' }) => {
  const x = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-120, 240] });

  return (
    <View style={loadingStyles.scanTrack}>
      <Animated.View
        style={[loadingStyles.scanBar, { backgroundColor: color, transform: [{ translateX }] }]}
      />
    </View>
  );
};

const loadingStyles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  scanTrack: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: 4,
  },
  scanBar: {
    width: 80,
    height: 2,
    borderRadius: 1,
  },
});
