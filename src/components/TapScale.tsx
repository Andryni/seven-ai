import React, { useMemo } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Press feedback shared by every tappable surface.
 *
 * The app had no visual response to a touch on most controls: haptics fired,
 * the action ran, but the surface itself never moved. This wraps a control in
 * a short scale dip so a press is acknowledged even when the action takes a
 * moment to produce a visible result.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** How far the surface dips while held. 1 disables the dip. */
  scaleTo?: number;
  /** Grow slightly instead of shrinking — for primary call-to-action pills. */
  grow?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  hitSlop?: number;
  children: React.ReactNode;
}

export const TapScale: React.FC<Props> = ({
  onPress,
  onLongPress,
  style,
  disabled,
  scaleTo = 0.955,
  grow = false,
  accessibilityLabel,
  accessibilityHint,
  hitSlop,
  children,
}) => {
  const press = useMemo(() => new Animated.Value(1), []);

  const animate = (toValue: number, duration: number) => {
    Animated.timing(press, {
      toValue,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const rest = grow ? 1 : 1;
  const active = grow ? 1 + (1 - scaleTo) : scaleTo;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop}
      disabled={disabled}
      onPressIn={() => animate(active, 90)}
      onPressOut={() => animate(rest, 150)}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[style, { transform: [{ scale: press }] }, disabled ? { opacity: 0.5 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
};
