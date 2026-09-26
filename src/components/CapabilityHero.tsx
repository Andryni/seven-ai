import React, { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { FONT } from '../theme/typography';
import { useTheme, useThemeStyles, type Palette } from '../theme/theme';

type ChipTone = 'accent' | 'success' | 'warning' | 'neutral';

interface CapabilityHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  chips?: { label: string; tone?: ChipTone }[];
  metric?: { value: string; label: string };
}

/**
 * Shared visual entry point for feature-heavy screens. It deliberately uses
 * only palette tokens, so the same hierarchy remains legible in every accent
 * and in light mode.
 */
export function CapabilityHero({
  eyebrow,
  title,
  description,
  icon,
  chips = [],
  metric,
}: CapabilityHeroProps) {
  const palette = useTheme();
  const styles = useThemeStyles(heroStyles);

  const toneColor = (tone?: ChipTone) => {
    if (tone === 'success') return palette.success;
    if (tone === 'warning') return palette.warning;
    if (tone === 'neutral') return palette.textDim;
    return palette.accent;
  };

  return (
    <View style={styles.shell} accessible accessibilityRole="summary">
      <View style={styles.glowRail} />
      <View style={styles.topRow}>
        <View style={styles.iconWell}>{icon}</View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        {metric && (
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{metric.value}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </View>
        )}
      </View>

      <Text style={styles.description}>{description}</Text>

      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((chip) => {
            const color = toneColor(chip.tone);
            return (
              <View key={chip.label} style={[styles.chip, { borderColor: color }]}>
                <View style={[styles.chipDot, { backgroundColor: color }]} />
                <Text style={[styles.chipText, { color }]}>{chip.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const heroStyles = (p: Palette) =>
  ({
    shell: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: p.bgElevated,
      borderWidth: 1,
      borderColor: p.borderStrong,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
    },
    glowRail: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      backgroundColor: p.accent,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconWell: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accentSoft,
      borderWidth: 1,
      borderColor: p.borderStrong,
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      color: p.accent,
      fontFamily: FONT.mono,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.6,
      marginBottom: 3,
    },
    title: {
      color: p.text,
      fontFamily: FONT.display,
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    description: {
      color: p.textDim,
      fontFamily: FONT.ui,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 12,
    },
    metric: {
      minWidth: 56,
      alignItems: 'flex-end',
    },
    metricValue: {
      color: p.accent,
      fontFamily: FONT.mono,
      fontSize: 20,
      fontWeight: '900',
    },
    metricLabel: {
      color: p.textFaint,
      fontFamily: FONT.mono,
      fontSize: 8,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      marginTop: 13,
    },
    chip: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: p.bgDeep,
    },
    chipDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    chipText: {
      fontFamily: FONT.mono,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  } as const);
