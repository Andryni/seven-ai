import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSevenStore } from '../store/useSevenStore';
import { useTelemetry } from '../hooks/useTelemetry';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';
import { Shield, Cpu, Wifi, BatteryCharging, Zap } from 'lucide-react-native';
import { FONT, TABULAR } from '../theme/typography';

interface HudHeaderProps {
  onPressStatus?: () => void;
}

export const HudHeader: React.FC<HudHeaderProps> = ({ onPressStatus }) => {
  const config = useSevenStore((s) => s.config);
  const status = useSevenStore((s) => s.status);
  const telemetry = useTelemetry();

  const palette = useTheme();
  const styles = useThemeStyles(hudStyles);

  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');

  useEffect(() => {
    // The month name follows the interface language instead of a hardcoded
    // English list: a French user should not read "SEPTEMBER".
    const locale = config.language === 'fr' ? 'fr-FR' : 'en-GB';
    const dateFormat = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const updateTime = () => {
      const now = new Date();
      setDateStr(`${dateFormat.format(now).replace(/\.$/, '')}.`);
      setTimeStr(now.toLocaleTimeString(locale, { hour12: false }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [config.language]);

  // Format assistant name spaced out e.g. "S E V E N"
  const formattedName = (config.assistantName || 'SEVEN')
    .toUpperCase()
    .split('')
    .join(' ');

  const getStatusColor = () => {
    switch (status) {
      case 'healing':
        return palette.error;
      case 'building':
        return palette.info;
      case 'organizing':
        return palette.success;
      case 'listening':
        return palette.accent;
      case 'speaking':
        return palette.warning;
      case 'thinking':
        return palette.info;
      case 'idle':
      default:
        return palette.accent;
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Banner: "F R I D A   10 SEPTEMBER, 2026. - 458 -" */}
      <View style={styles.topRow}>
        <View style={styles.hudDecoLeft} />
        <Text style={styles.titleText}>
          {formattedName} &nbsp; {dateStr} &nbsp; - 458 -
        </Text>
        <View style={styles.hudDecoRight} />
      </View>

      {/* Telemetry bar */}
      <View style={styles.telemetryRow}>
        <View style={styles.leftPills}>
          <TouchableOpacity
            onPress={onPressStatus}
            style={[styles.statusBadge, { borderColor: getStatusColor() }]}
          >
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {status.toUpperCase()}
            </Text>
          </TouchableOpacity>

          <View style={styles.telemetryPill}>
            <Cpu size={11} color={palette.accent} />
            <Text style={styles.telemetryText}>{telemetry.cpuLoad}% CPU</Text>
          </View>

          <View style={styles.telemetryPill}>
            <Shield size={11} color={palette.success} />
            <Text style={styles.telemetryText}>{telemetry.fps} FPS</Text>
          </View>
        </View>

        <View style={styles.rightPills}>
          <View style={styles.telemetryPill}>
            <Wifi
              size={11}
              color={telemetry.networkConnected ? palette.info : palette.error}
            />
            <Text style={styles.telemetryText}>
              {telemetry.networkConnected
                ? `${telemetry.networkType.toUpperCase()}${telemetry.networkSimulated ? ' [SIM]' : ''}`
                : `OFFLINE${telemetry.networkSimulated ? ' [SIM]' : ''}`}
            </Text>
          </View>

          <View style={styles.telemetryPill}>
            <BatteryCharging
              size={11}
              color={
                telemetry.isCharging
                  ? palette.success
                  : telemetry.batteryLevel <= 20
                  ? palette.error
                  : palette.accent
              }
            />
            <Text style={styles.telemetryText}>
              {telemetry.batteryLevel}%{telemetry.isCharging ? ' ⚡' : ''}
              {telemetry.batterySimulated ? ' [SIM]' : ''}
            </Text>
          </View>

          <View style={styles.telemetryPill}>
            <Zap size={11} color={palette.accent} />
            <Text style={styles.clockText}>{timeStr}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const hudStyles = (t: Palette) =>
  ({
    container: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      backgroundColor: t.bgDeep,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    hudDecoLeft: {
      height: 1,
      flex: 1,
      backgroundColor: t.borderStrong,
      marginRight: 10,
    },
    hudDecoRight: {
      height: 1,
      flex: 1,
      backgroundColor: t.borderStrong,
      marginLeft: 10,
    },
    titleText: {
      // Orbitron: the brand line is the one element allowed to be decorative.
      fontFamily: FONT.display,
      color: t.accent,
      fontSize: 11,
      letterSpacing: 2.5,
      fontWeight: '700',
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    telemetryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    leftPills: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rightPills: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      backgroundColor: t.bgElevated,
      gap: 5,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontFamily: FONT.uiMedium,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    telemetryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: t.accentSoft,
      borderRadius: 3,
      borderWidth: 1,
      borderColor: t.border,
      gap: 4,
    },
    telemetryText: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9,
      // Fixed-width digits: the readouts tick every second and must not jitter.
      fontVariant: TABULAR,
    },
    clockText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
      fontVariant: TABULAR,
    },
  } as const);
