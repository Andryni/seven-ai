import React, { useEffect, useMemo } from 'react';
import { Animated, Easing } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Entrance animation shared by every screen.
 *
 * The screens used to appear fully formed, which read as a page swap rather
 * than a system coming online. One reveal per block, staggered by `index`,
 * gives each screen the same "instrument panel booting" cadence without every
 * page inventing its own timing.
 */
interface Props {
  children: React.ReactNode;
  /** Position in the stagger; each step is 90 ms after the previous one. */
  index?: number;
  /** Base delay, for screens that arrive after their header. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
  /** Distance travelled, in pixels. Larger blocks want a touch more. */
  distance?: number;
}

export const ScreenReveal: React.FC<Props> = ({
  children,
  index = 0,
  delay = 0,
  style,
  distance = 14,
}) => {
  const progress = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay: delay + index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, delay, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};
