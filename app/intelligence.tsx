import React, { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CloudSun, Droplets, Gauge, Globe2, Newspaper, RefreshCw, Wind } from 'lucide-react-native';
import { ParticleBackground } from '../src/components/ParticleBackground';
import { BottomNav } from '../src/components/BottomNav';
import { TapScale } from '../src/components/TapScale';
import { useSevenStore } from '../src/store/useSevenStore';
import { fetchDailyForecast, fetchNews, fetchWeather, type DailyForecast, type LiveNewsItem, type LiveWeather } from '../src/services/liveInfoService';
import { useTheme, useThemeStyles, type Palette } from '../src/theme/theme';
import { FONT } from '../src/theme/typography';

export default function IntelligenceScreen() {
  const router = useRouter();
  const palette = useTheme();
  const styles = useThemeStyles(intelStyles);
  const config = useSevenStore((s) => s.config);
  const language = (config.language || 'en') === 'fr' ? 'fr' : 'en';
  const city = config.city?.trim() || 'Antananarivo';
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [news, setNews] = useState<LiveNewsItem[]>([]);
  const [forecast, setForecast] = useState<DailyForecast[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextWeather, nextNews, nextForecast] = await Promise.all([
        fetchWeather(city, language),
        fetchNews(language),
        fetchDailyForecast(city, language),
      ]);
      setWeather(nextWeather);
      setNews(nextNews);
      setForecast(nextForecast);
    } finally {
      setRefreshing(false);
    }
  }, [city, language]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  return (
    <ParticleBackground>
      <View style={styles.header}>
        <TapScale style={styles.back} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={17} color={palette.accent} />
        </TapScale>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>SEVEN // GLOBAL INTELLIGENCE ARRAY</Text>
          <Text style={styles.title}>{language === 'fr' ? 'SALLE DE RENSEIGNEMENT' : 'INTELLIGENCE ROOM'}</Text>
        </View>
        <TapScale style={styles.refresh} onPress={() => void refresh()} accessibilityLabel="Refresh intelligence">
          <RefreshCw size={15} color={palette.warning} />
        </TapScale>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.accent} />}
      >
        <View style={styles.weatherHero}>
          <View style={styles.orbitOuter}><View style={styles.orbitInner}><CloudSun size={42} color={palette.info} /></View></View>
          <View style={styles.weatherCopy}>
            <Text style={styles.sectionCode}>ENV-01 // LIVE ATMOSPHERE</Text>
            <Text style={styles.temp}>{weather ? `${weather.tempC}°C` : '—°C'}</Text>
            <Text style={styles.condition}>{weather?.condition || 'ACQUIRING TELEMETRY'}</Text>
            <Text style={styles.location}>{weather?.location || city}</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <Metric icon={<Droplets size={14} color={palette.info} />} label="HUMIDITY" value={weather ? `${weather.humidity}%` : '—'} styles={styles} />
          <Metric icon={<Wind size={14} color={palette.success} />} label="WIND" value={weather ? `${weather.windKmh} KM/H` : '—'} styles={styles} />
          <Metric icon={<Gauge size={14} color={palette.warning} />} label="WMO CODE" value={weather ? String(weather.code) : '—'} styles={styles} />
        </View>

        <Text style={styles.forecastLabel}>{language === 'fr' ? 'PRÉVISION 7 JOURS' : '7-DAY FORECAST'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastRow}>
          {forecast.map((day) => (
            <View key={day.date} style={styles.forecastCard}>
              <Text style={styles.forecastDay}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short' }).toUpperCase()}</Text>
              <CloudSun size={17} color={day.precipitationChance > 50 ? palette.info : palette.warning} />
              <Text style={styles.forecastTemp}>{day.maxC}° <Text style={styles.forecastMin}>{day.minC}°</Text></Text>
              <Text style={styles.forecastCondition} numberOfLines={1}>{day.condition}</Text>
              <Text style={styles.forecastRain}>RAIN {day.precipitationChance}%</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}><Newspaper size={15} color={palette.warning} /><Text style={styles.sectionTitle}>{language === 'fr' ? 'FLUX MONDIAL EN DIRECT' : 'LIVE GLOBAL FEED'}</Text></View>
          <Text style={styles.counter}>{news.length.toString().padStart(2, '0')} SIGNALS</Text>
        </View>

        {news.map((item, index) => (
          <TapScale
            key={`${item.source}-${item.title}`}
            style={styles.newsCard}
            scaleTo={0.985}
            onPress={() => item.link && void Linking.openURL(item.link)}
          >
            <View style={styles.newsRail}><Text style={styles.newsNumber}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.railLine} /></View>
            <View style={styles.newsBody}>
              <View style={styles.newsMeta}><Globe2 size={9} color={palette.accent} /><Text style={styles.source}>{item.source.toUpperCase()}</Text><Text style={styles.live}>● LIVE</Text></View>
              <Text style={styles.newsTitle}>{item.title}</Text>
              {!!item.published && <Text style={styles.published}>{new Date(item.published).toLocaleString()}</Text>}
            </View>
          </TapScale>
        ))}
      </ScrollView>
      <BottomNav active="dashboard" />
    </ParticleBackground>
  );
}

function Metric({ icon, label, value, styles }: { icon: React.ReactNode; label: string; value: string; styles: ReturnType<typeof intelStyles> }) {
  return <View style={styles.metric}><View style={styles.metricHead}>{icon}<Text style={styles.metricLabel}>{label}</Text></View><Text style={styles.metricValue}>{value}</Text></View>;
}

const intelStyles = (t: Palette) => ({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: t.borderStrong, backgroundColor: 'rgba(3,8,16,.96)' },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 5 },
  refresh: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 18 },
  headerCopy: { flex: 1, marginHorizontal: 10 },
  kicker: { color: t.accent, fontFamily: FONT.mono, fontSize: 7.5, letterSpacing: 1.4 },
  title: { color: t.text, fontFamily: FONT.display, fontSize: 17, letterSpacing: 1.1, marginTop: 2 },
  scroll: { flex: 1 }, content: { padding: 14, paddingBottom: 30 },
  weatherHero: { minHeight: 190, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.borderStrong, borderRadius: 12, backgroundColor: 'rgba(5,15,27,.92)', padding: 18, overflow: 'hidden' },
  orbitOuter: { width: 122, height: 122, borderRadius: 61, borderWidth: 1, borderColor: t.accentStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  orbitInner: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: t.info, backgroundColor: 'rgba(56,189,248,.08)', alignItems: 'center', justifyContent: 'center' },
  weatherCopy: { flex: 1, marginLeft: 18 }, sectionCode: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 7.5, letterSpacing: 1 },
  temp: { color: t.text, fontFamily: FONT.display, fontSize: 38, lineHeight: 44 }, condition: { color: t.info, fontFamily: FONT.uiMedium, fontSize: 11, fontWeight: '800' }, location: { color: t.textDim, fontFamily: FONT.mono, fontSize: 9, marginTop: 4 },
  metricRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  forecastLabel: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 8, letterSpacing: 1.3, marginTop: 15, marginBottom: 7 },
  forecastRow: { gap: 7 },
  forecastCard: { width: 92, minHeight: 105, alignItems: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 7, backgroundColor: 'rgba(6,12,22,.92)', padding: 8 },
  forecastDay: { color: t.accent, fontFamily: FONT.mono, fontSize: 7, fontWeight: '900', marginBottom: 7 },
  forecastTemp: { color: t.text, fontFamily: FONT.display, fontSize: 12, marginTop: 6 },
  forecastMin: { color: t.textFaint, fontSize: 9 },
  forecastCondition: { color: t.textDim, fontFamily: FONT.ui, fontSize: 7, marginTop: 4 },
  forecastRain: { color: t.info, fontFamily: FONT.mono, fontSize: 6, marginTop: 4 },
  metric: { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 7, padding: 9, backgroundColor: t.accentSoft }, metricHead: { flexDirection: 'row', alignItems: 'center', gap: 4 }, metricLabel: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 6.5 }, metricValue: { color: t.text, fontFamily: FONT.display, fontSize: 13, marginTop: 7 },
  sectionHeader: { marginTop: 18, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, sectionTitle: { color: t.text, fontFamily: FONT.display, fontSize: 11, letterSpacing: 1 }, counter: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 7 },
  newsCard: { minHeight: 96, flexDirection: 'row', borderWidth: 1, borderColor: t.border, backgroundColor: 'rgba(6,12,22,.9)', borderRadius: 8, marginBottom: 7, padding: 10 }, newsRail: { width: 28, alignItems: 'center' }, newsNumber: { color: t.warning, fontFamily: FONT.display, fontSize: 11 }, railLine: { flex: 1, width: 1, backgroundColor: t.border, marginTop: 5 }, newsBody: { flex: 1 }, newsMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 }, source: { color: t.accent, fontFamily: FONT.mono, fontSize: 7, flex: 1 }, live: { color: t.success, fontFamily: FONT.mono, fontSize: 6.5 }, newsTitle: { color: t.text, fontFamily: FONT.uiMedium, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 7 }, published: { color: t.textFaint, fontFamily: FONT.mono, fontSize: 7, marginTop: 5 },
} as const);
