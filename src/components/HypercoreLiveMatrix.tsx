import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { CloudSun, Newspaper, Activity, Cpu, Radio, ChevronRight } from 'lucide-react-native';
import type { AssistantStatus } from '../types';
import type { LiveNewsItem, LiveWeather } from '../services/liveInfoService';
import { useTheme, useThemeStyles, type Palette } from '../theme/theme';
import { FONT } from '../theme/typography';
import { TapScale } from './TapScale';

interface Props {
  weather: LiveWeather | null;
  news: LiveNewsItem[];
  status: AssistantStatus;
  isOffline: boolean;
  operationCount: number;
  language: 'fr' | 'en';
  onOpenIntel: () => void;
  onOpenOperations: () => void;
}

const statusSteps: AssistantStatus[] = ['listening', 'thinking', 'building', 'organizing', 'speaking'];

/**
 * Maximalist command telemetry between Gideon and the module canvas. It keeps
 * the live facts glanceable while exposing the system pipeline instead of
 * hiding every operation behind a spinner.
 */
export const HypercoreLiveMatrix: React.FC<Props> = ({
  weather,
  news,
  status,
  isOffline,
  operationCount,
  language,
  onOpenIntel,
  onOpenOperations,
}) => {
  const palette = useTheme();
  const styles = useThemeStyles(matrixStyles);
  const sweep = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 5200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-260, 520] });
  const activeStep = Math.max(0, statusSteps.indexOf(status));
  const topNews = news.slice(0, 3);

  return (
    <View style={styles.shell}>
      <Animated.View
        pointerEvents="none"
        style={[styles.scan, { backgroundColor: palette.accent, transform: [{ translateX }] }]}
      />

      <View style={styles.eyebrowRow}>
        <View style={styles.titleGroup}>
          <Cpu size={13} color={palette.accent} />
          <Text style={styles.eyebrow}>GIDEON HYPERCORE // LIVE MATRIX</Text>
        </View>
        <View style={[styles.networkPill, isOffline && styles.networkPillOffline]}>
          <Radio size={9} color={isOffline ? palette.error : palette.success} />
          <Text style={[styles.networkText, { color: isOffline ? palette.error : palette.success }]}> 
            {isOffline ? 'OFFLINE' : 'UPLINK LIVE'}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <TapScale style={[styles.cell, styles.weatherCell]} onPress={onOpenIntel} scaleTo={0.97}>
          <View style={styles.cellHeading}>
            <CloudSun size={14} color={palette.info} />
            <Text style={styles.cellLabel}>{language === 'fr' ? 'ENVIRONNEMENT' : 'ENVIRONMENT'}</Text>
          </View>
          <Text style={styles.weatherTemp}>{weather ? `${weather.tempC}°` : '—°'}</Text>
          <Text style={styles.primaryLine} numberOfLines={1}>
            {weather?.location || (language === 'fr' ? 'LIAISON MÉTÉO' : 'WEATHER LINK')}
          </Text>
          <Text style={styles.secondaryLine} numberOfLines={2}>
            {weather
              ? `${weather.condition} · H ${weather.humidity}% · W ${weather.windKmh} km/h`
              : language === 'fr'
                ? 'Synchronisation des capteurs…'
                : 'Synchronizing sensors…'}
          </Text>
          <ChevronRight size={12} color={palette.textFaint} style={styles.chevron} />
        </TapScale>

        <TapScale style={[styles.cell, styles.newsCell]} onPress={onOpenIntel} scaleTo={0.97}>
          <View style={styles.cellHeading}>
            <Newspaper size={14} color={palette.warning} />
            <Text style={styles.cellLabel}>{language === 'fr' ? 'RENSEIGNEMENT' : 'INTELLIGENCE'}</Text>
          </View>
          {topNews.length ? (
            topNews.map((item, index) => (
              <View key={`${item.source}-${item.title}`} style={styles.newsLine}>
                <Text style={styles.newsIndex}>0{index + 1}</Text>
                <View style={styles.newsCopy}>
                  <Text style={styles.newsTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.newsSource}>{item.source.toUpperCase()}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.secondaryLine}>
              {language === 'fr' ? 'Acquisition des flux mondiaux…' : 'Acquiring global feeds…'}
            </Text>
          )}
        </TapScale>
      </View>

      <TapScale style={styles.pipeline} onPress={onOpenOperations} scaleTo={0.985}>
        <View style={styles.pipelineHeader}>
          <View style={styles.titleGroup}>
            <Activity size={12} color={palette.success} />
            <Text style={styles.pipelineTitle}>{language === 'fr' ? 'PIPELINE OPÉRATIONNEL' : 'OPERATION PIPELINE'}</Text>
          </View>
          <Text style={styles.operationCount}>{operationCount.toString().padStart(2, '0')} EVENTS</Text>
        </View>
        <View style={styles.steps}>
          {statusSteps.map((step, index) => {
            const active = step === status;
            const passed = status !== 'idle' && index <= activeStep;
            return (
              <React.Fragment key={step}>
                {index > 0 && <View style={[styles.connector, passed && styles.connectorActive]} />}
                <View style={styles.step}>
                  <View style={[styles.stepNode, passed && styles.stepNodePassed, active && styles.stepNodeActive]} />
                  <Text style={[styles.stepText, active && styles.stepTextActive]}>{step.slice(0, 4).toUpperCase()}</Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      </TapScale>
    </View>
  );
};

const matrixStyles = (t: Palette) => ({
  shell: { marginTop: 12, overflow: 'hidden', borderWidth: 1, borderColor: t.borderStrong, borderRadius: 10, backgroundColor: 'rgba(4,10,19,0.94)', padding: 10 },
  scan: { position: 'absolute', top: 0, bottom: 0, width: 34, opacity: 0.045 },
  eyebrowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: t.accent, fontFamily: FONT.display, fontSize: 9, letterSpacing: 1.5 },
  networkPill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(74,222,128,.35)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3 },
  networkPillOffline: { borderColor: 'rgba(255,51,102,.38)' },
  networkText: { fontFamily: FONT.mono, fontSize: 7.5, fontWeight: '800', letterSpacing: .8 },
  grid: { flexDirection: 'row', gap: 8 },
  cell: { minHeight: 132, borderWidth: 1, borderColor: t.border, borderRadius: 8, backgroundColor: t.accentSoft, padding: 9 },
  weatherCell: { flex: .85 },
  newsCell: { flex: 1.55 },
  cellHeading: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 7 },
  cellLabel: { color: t.textDim, fontFamily: FONT.mono, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1 },
  weatherTemp: { color: t.text, fontFamily: FONT.display, fontSize: 32, lineHeight: 36 },
  primaryLine: { color: t.accent, fontFamily: FONT.uiMedium, fontSize: 9, fontWeight: '800' },
  secondaryLine: { color: t.textDim, fontFamily: FONT.ui, fontSize: 8.5, lineHeight: 12, marginTop: 3 },
  chevron: { position: 'absolute', right: 7, bottom: 7 },
  newsLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  newsIndex: { color: t.warning, fontFamily: FONT.mono, fontSize: 8, fontWeight: '900' },
  newsCopy: { flex: 1 },
  newsTitle: { color: t.text, fontFamily: FONT.uiMedium, fontSize: 8.5, fontWeight: '700' },
  newsSource: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 6.5, letterSpacing: .7 },
  pipeline: { marginTop: 8, borderWidth: 1, borderColor: t.border, borderRadius: 7, backgroundColor: 'rgba(0,0,0,.32)', padding: 8 },
  pipelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pipelineTitle: { color: t.textDim, fontFamily: FONT.mono, fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  operationCount: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 7 },
  steps: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
  step: { alignItems: 'center', width: 38 },
  stepNode: { width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: t.textFaint, backgroundColor: t.bgDeep },
  stepNodePassed: { borderColor: t.accent, backgroundColor: t.accentSoft },
  stepNodeActive: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.accent, shadowColor: t.accent, shadowOpacity: .9, shadowRadius: 7 },
  stepText: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 6.5, marginTop: 3 },
  stepTextActive: { color: t.accent },
  connector: { flex: 1, height: 1, marginTop: 3, backgroundColor: t.border },
  connectorActive: { backgroundColor: t.accentStrong },
} as const);
