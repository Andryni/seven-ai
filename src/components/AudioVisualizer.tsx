import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface AudioVisualizerProps {
  isActive: boolean;
  barCount?: number;
  color?: string;
  maxHeight?: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isActive,
  barCount = 18,
  color = '#00E5FF',
  maxHeight = 28,
}) => {
  // useMemo keeps the Animated.Value instances stable and avoids reading
  // `useRef(...).current` during render (react-hooks/refs).
  const animatedValues = useMemo(
    () => Array.from({ length: barCount }, () => new Animated.Value(0.15)),
    // barCount is expected to stay constant for a mounted instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    let isMounted = true;

    if (isActive) {
      const animateBars = () => {
        const animations = animatedValues.map((val) => {
          const randomHeight = Math.random() * 0.85 + 0.15;
          const randomDuration = Math.random() * 140 + 80;
          return Animated.sequence([
            Animated.timing(val, {
              toValue: randomHeight,
              duration: randomDuration,
              useNativeDriver: false,
            }),
            Animated.timing(val, {
              toValue: 0.15,
              duration: randomDuration,
              useNativeDriver: false,
            }),
          ]);
        });

        Animated.parallel(animations).start(() => {
          if (isMounted && isActive) {
            animateBars();
          }
        });
      };

      animateBars();
    } else {
      animatedValues.forEach((val) => {
        Animated.timing(val, {
          toValue: 0.1,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      isMounted = false;
    };
  }, [isActive, animatedValues]);

  return (
    <View style={styles.container}>
      {animatedValues.map((val, idx) => {
        const heightInterpolated = val.interpolate({
          inputRange: [0, 1],
          outputRange: [3, maxHeight],
        });

        return (
          <Animated.View
            key={idx}
            style={[
              styles.bar,
              {
                height: heightInterpolated,
                backgroundColor: color,
                opacity: isActive ? 0.9 : 0.3,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 32,
    paddingHorizontal: 8,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
});
