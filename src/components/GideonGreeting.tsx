import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { Palette } from '../theme/theme';
import { FONT } from '../theme/typography';

/**
 * Gideon's arrival line: shown once per launch, and spoken once.
 *
 * Deliberately *not* a capability list. The module deck just below already
 * shows what he can do, and reciting it on every start made him read like a
 * spec sheet — the user asked for something more human. The dashboard picks a
 * different short, conversational line on each launch and hands it in here, so
 * this component stays a pure card that only owns its own motion.
 *
 * It is also intentionally compact: an earlier version was a tall card that sat
 * on the screen for seven seconds, and its tap target swallowed the first press
 * meant for the buttons underneath.
 */
interface Props {
  /** The exact sentence to show — and the one that will be spoken. */
  sentence: string;
  palette: Palette;
  tapToDismiss: string;
  onSpeak: (sentence: string) => void;
  onDismiss: () => void;
  /** How long the line lingers before fading on its own. */
  holdMs?: number;
}

export const GideonGreeting: React.FC<Props> = ({
  sentence,
  palette,
  tapToDismiss,
  onSpeak,
  onDismiss,
  holdMs = 5200,
}) => {
  const enter = useMemo(() => new Animated.Value(0), []);
  const pulse = useMemo(() => new Animated.Value(0), []);
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.timing(enter, {
      toValue: 0,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => onDismiss());
  }, [enter, onDismiss]);

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // The voice starts with the line rather than after a staged reveal: there
    // is nothing left to wait for now that the capability rows are gone.
    const speakTimer = setTimeout(() => onSpeak(sentence), 280);
    const closeTimer = setTimeout(dismiss, 280 + holdMs);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    loop.start();

    return () => {
      clearTimeout(speakTimer);
      clearTimeout(closeTimer);
      loop.stop();
    };
    // One-shot per launch: re-running would re-announce him mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={dismiss}
        accessibilityLabel={`${sentence}. ${tapToDismiss}`}
        style={[styles.card, { borderColor: palette.accent + '44' }]}
      >
        <Animated.View
          style={[
            styles.pulse,
            {
              backgroundColor: palette.accent,
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) },
              ],
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0.15] }),
            },
          ]}
        />
        <Text style={[styles.line, { color: palette.text }]} numberOfLines={3}>
          {sentence}
        </Text>
        <Text style={[styles.footer, { color: palette.textFaint }]}>{tapToDismiss}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    marginBottom: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    backgroundColor: 'rgba(4,10,16,0.82)',
  },
  pulse: { width: 6, height: 6, borderRadius: 3 },
  line: {
    flex: 1,
    fontFamily: FONT.ui,
    fontSize: 11.5,
    lineHeight: 16,
  },
  footer: {
    fontFamily: FONT.ui,
    fontSize: 7.5,
    letterSpacing: 1.6,
  },
});
