import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { FONT } from '../theme/typography';

interface Props {
  /** Only rendered when the user turned on "icon button labels" in Settings —
      most icon-only bars stay compact by default, this is opt-in. */
  visible?: boolean;
  label: string;
  color: string;
}

/**
 * Small caption printed under an icon-only button.
 *
 * The app relies on a lot of bare icons (chat header, history row actions)
 * that only reveal their meaning through `accessibilityLabel`, which screen
 * readers pick up but sighted users never see. This gives everyone the same
 * clarity when they opt into "ICON BUTTON LABELS" in Settings, without
 * permanently widening every touch target for people who already know the
 * icons.
 */
export const IconCaption: React.FC<Props> = ({ visible, label, color }) => {
  if (!visible) return null;
  return (
    <Text style={[styles.caption, { color }]} numberOfLines={1}>
      {label}
    </Text>
  );
};

const styles = StyleSheet.create({
  caption: {
    fontFamily: FONT.mono,
    fontSize: 6.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
