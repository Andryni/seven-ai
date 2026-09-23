import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSevenStore } from '../store/useSevenStore';
import { useTelemetry } from '../hooks/useTelemetry';
import { useTheme, useThemeStyles } from '../theme/theme';
import type { Palette } from '../theme/theme';
import { t } from '../theme/i18n';
import { openRouterService } from '../services/openRouterService';
import { buildBrainReadout } from '../core/brainTelemetry';
import { Shield, Cpu, Wifi, BatteryCharging, Zap, BrainCircuit } from 'lucide-react-native';
import { FONT, TABULAR } from '../theme/typography';

interface HudHeaderProps {
  onPressStatus?: () => void;
}

export const HudHeader: React.FC<HudHeaderProps> = ({ onPressStatus }) => {
  const config = useSevenStore((s) => s.config);
  const status = useSevenStore((s) => s.status);
  const brainTelemetry = useSevenStore((s) => s.brainTelemetry);
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

  /**
   * Which brain will / did answer — permanently visible, per the HUD's role as
   * a status instrument: the Gemini / OpenRouter / local switch used to be
   * visible only in Settings and in the terminal log after the fact.
   */
  const lang = config.language === 'fr' ? 'fr' : 'en';
  const brain = buildBrainReadout({
    // Same readiness checks the agent uses before choosing a brain, so the pill
    // never claims a provider the next message would not actually use.
    geminiReady: (config.geminiApiKey || '').trim().length > 5,
    openRouterReady: openRouterService.isConfigured(config.openRouterKey),
    telemetry: brainTelemetry,
  });

  const brainColor =
    brain.provider === 'gemini'
      ? palette.accent
      : brain.provider === 'openrouter'
      ? palette.warning
      : palette.error;

  const brainLabel =
    (brain.measured ? t('hud.brain.active', lang) : t('hud.brain.pending', lang)).replace(
      '{brain}',
      [brain.providerLabel, brain.modelLabel].filter(Boolean).join(' ')
    ) +
    (brain.latencyLabel
      ? `, ${t('hud.brain.latency', lang).replace('{value}', brain.latencyLabel)}`
      : '') +
    (brain.tokenLabel ? `, ${t('hud.brain.tokens', lang).replace('{value}', brain.tokenLabel)}` : '');

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
            accessibilityLabel={`System status: ${status}`}
            style={[styles.statusBadge, { borderColor: getStatusColor() }]}
          >
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {status.toUpperCase()}
            </Text>
          </TouchableOpacity>

          <View style={styles.telemetryPill}>
            <Cpu size={11} color={palette.accent} />
            <Text style={styles.telemetryText}>
              {telemetry.cpuLoad}% CPU{telemetry.systemSimulated ? ' [SIM]' : ''}
            </Text>
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

      {/* Brain readout: colour encodes the engine, the numbers are measured */}
      <View style={styles.brainRow}>
        <View
          style={[styles.brainPill, { borderColor: brainColor }]}
          accessibilityLabel={brainLabel}
          accessibilityRole="text"
          testID="hud-brain-readout"
        >
          <BrainCircuit size={11} color={brainColor} />
          <Text
            style={[styles.brainProvider, { color: brainColor }]}
            numberOfLines={1}
          >
            {brain.providerLabel}
          </Text>
          {brain.modelLabel ? (
            <Text style={styles.brainDetail} numberOfLines={1}>
              {brain.modelLabel}
            </Text>
          ) : null}
          {brain.latencyLabel ? (
            <Text style={styles.brainDetail} numberOfLines={1}>
              · {brain.latencyLabel}
            </Text>
          ) : null}
          {brain.tokenLabel ? (
            <Text style={styles.brainDetail} numberOfLines={1}>
              · {brain.tokenLabel} TOK
            </Text>
          ) : null}
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
    brainRow: {
      flexDirection: 'row',
      marginTop: 6,
    },
    brainPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      backgroundColor: t.bgElevated,
      gap: 5,
      // The pill can carry provider + model + latency + tokens: let it shrink
      // inside the header instead of pushing the row off-screen.
      flexShrink: 1,
    },
    brainProvider: {
      fontFamily: FONT.uiMedium,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    brainDetail: {
      fontFamily: FONT.mono,
      color: t.textDim,
      fontSize: 9,
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
