import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSevenStore } from '../src/store/useSevenStore';
import { OrbView } from '../src/components/OrbView';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { ScreenReveal } from '../src/components/ScreenReveal';
import { TABULAR } from '../src/theme/typography';
import { useTheme, useThemeStyles } from '../src/theme/theme';
import type { Palette } from '../src/theme/theme';
import { haptics } from '../src/services/hapticsService';
import { deviceControl } from '../src/services/deviceControlService';
import { FONT } from '../src/theme/typography';
import {
  ChevronLeft,
  Battery,
  Radio,
  Cpu,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';

/**
 * Fullscreen Futuristic Cyberpunk Standby / Desk Dock HUD Mode.
 * Displays holographic live clock, hardware battery metrics, orbital reactor,
 * and live system telemetry for hands-free dock operation.
 */
export default function StandbyScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useThemeStyles(standbyStyles);

  const status = useSevenStore((s) => s.status);
  const config = useSevenStore((s) => s.config);
  const audioAmplitude = useSevenStore((s) => s.audioAmplitude);

  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [batteryText, setBatteryText] = useState('BATTERY: --%');
  const language = config.language || 'en';

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setDateStr(
        now.toLocaleDateString([], {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).toUpperCase()
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Battery telemetry, localized and refreshed periodically while docked.
    const refreshBattery = () => {
      deviceControl.getBatteryStatus().then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          const d = res.data as { level?: number; state?: string; isLowPowerMode?: boolean };
          const stateLabel =
            language === 'fr'
              ? d.state === 'charging'
                ? 'en charge'
                : d.state === 'fully charged'
                ? 'pleine'
                : d.state === 'unplugged (discharging)'
                ? 'sur batterie'
                : 'sur batterie'
              : d.state || 'on battery';
          setBatteryText(
            `BATTERY: ${d.level ?? '--'}% (${stateLabel})${d.isLowPowerMode ? (language === 'fr' ? ' [ÉCO]' : ' [SAVER]') : ''}`
          );
        } else if (res.success) {
          setBatteryText(res.message);
        }
      });
    };
    refreshBattery();
    const batteryInterval = setInterval(refreshBattery, 30000);
    return () => {
      cancelled = true;
      clearInterval(batteryInterval);
    };
  }, [language]);

  return (
    <ParticleBackground>
      <View style={styles.container}>
        {/* Top bar with back and status */}
        <ScreenReveal index={0} distance={8}>
        <View style={styles.topNav}>
          <TouchableOpacity
            style={styles.backBtn}
            accessibilityLabel={language === 'fr' ? 'Retour' : 'Back'}
            onPress={() => {
              haptics.light();
              router.back();
            }}
          >
            <ChevronLeft size={16} color={palette.accent} />
            <Text style={styles.backBtnText}>EXIT DOCK</Text>
          </TouchableOpacity>

          <View style={styles.topRightBadge}>
            <Radio size={12} color={palette.success} />
            <Text style={styles.dockTitle}>SEVEN OS // DOCK MODE ACTIVE</Text>
          </View>
        </View>
        </ScreenReveal>

        {/* Big Holographic Digital Clock */}
        <ScreenReveal index={1} delay={60}>
          <View style={styles.clockSection}>
            <Text style={styles.clockTime}>{timeStr}</Text>
            <Text style={styles.clockDate}>{dateStr}</Text>
          </View>
        </ScreenReveal>

        {/* Central Responsive Orb Reactor */}
        <ScreenReveal index={2} delay={60}>
        <View style={styles.orbCenter}>
          <OrbView
            size={280}
            status={status}
            amplitude={audioAmplitude}
            themeColor={palette.accent}
            mode="gideon"
            gyroEnabled={config.gyroEnabled ?? true}
          />
        </View>
        </ScreenReveal>

        {/* Bottom Hardware Telemetry HUD Card */}
        <ScreenReveal index={3} delay={60}>
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryRow}>
            <View style={styles.telemetryItem}>
              <Battery size={14} color={palette.accent} />
              <Text style={styles.telemetryLabel}>{batteryText}</Text>
            </View>

            <View style={styles.telemetryItem}>
              <ShieldCheck size={14} color={palette.success} />
              <Text style={styles.telemetryLabel}>SHIELDS: NOMINAL</Text>
            </View>
          </View>

          <View style={styles.telemetryRow}>
            <View style={styles.telemetryItem}>
              <Cpu size={14} color={palette.info} />
              <Text style={styles.telemetryLabel}>NEURAL CORE: 60 FPS</Text>
            </View>

            <View style={styles.telemetryItem}>
              <Zap size={14} color={palette.warning} />
              <Text style={styles.telemetryLabel}>AUDIO DSP: STANDBY</Text>
            </View>
          </View>
        </View>
        </ScreenReveal>
      </View>
    </ParticleBackground>
  );
}

const standbyStyles = (t: Palette) =>
  ({
    container: {
      flex: 1,
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 44 : 20,
      paddingBottom: 30,
    },
    topNav: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: t.bgElevated,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: t.border,
    },
    backBtnText: {
      fontFamily: FONT.mono,
      color: t.accent,
      fontSize: 10,
      fontWeight: '800',
    },
    topRightBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderRadius: 4,
      borderWidth: 1,
      borderColor: t.border,
    },
    dockTitle: {
      fontFamily: FONT.mono,
      color: t.success,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1,
    },
    clockSection: {
      alignItems: 'center',
      marginTop: 10,
    },
    clockTime: {
      // The clock is the whole point of the dock: it gets the display face and
      // fixed-width digits so the seconds do not shift the whole line.
      fontFamily: FONT.display,
      color: '#FFFFFF',
      fontSize: 46,
      fontWeight: '900',
      letterSpacing: 2,
      fontVariant: TABULAR,
      textShadowColor: t.accent,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 15,
    },
    clockDate: {
      fontFamily: FONT.uiMedium,
      color: t.accent,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 2.6,
      textTransform: 'uppercase',
      marginTop: 4,
    },
    orbCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    telemetryCard: {
      backgroundColor: 'rgba(5, 10, 18, 0.85)',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.borderStrong,
      padding: 14,
      gap: 10,
    },
    telemetryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    telemetryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    telemetryLabel: {
      fontFamily: FONT.mono,
      color: t.text,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
  } as const);
