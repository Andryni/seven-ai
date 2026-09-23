import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as FileSystem from 'expo-file-system/legacy';
import { useSevenStore } from '../store/useSevenStore';
import { fetchLiveBriefing, type LiveNewsItem } from './liveInfoService';
import { calendarService } from './calendarService';

export interface MorningBriefingData {
  greeting: string;
  weather: {
    temp: string;
    condition: string;
    humidity: string;
    location: string;
  };
  unreadEmailsSummary: string;
  agendaItems: { time: string; title: string }[];
  deviceHealth: {
    battery: string;
    storageUsage: string;
    astStatus: string;
    /** True when battery/storage came from real device APIs, not a placeholder. */
    isLive: boolean;
  };
  techHighlight: string;
  /** Real headlines when the feeds answered; empty otherwise. */
  headlines: LiveNewsItem[];
  /** True when the weather comes from the live Open-Meteo call. */
  weatherIsLive: boolean;
  spokenScript: string;
}

class MorningBriefingService {
  private static instance: MorningBriefingService;

  private constructor() {}

  public static getInstance(): MorningBriefingService {
    if (!MorningBriefingService.instance) {
      MorningBriefingService.instance = new MorningBriefingService();
    }
    return MorningBriefingService.instance;
  }

  /**
   * Real device health: battery via expo-battery, disk space via
   * expo-file-system/legacy. Both were hardcoded placeholders
   * ("98% [Optimal]", "14.2 GB / 128 GB") — the briefing looked like a demo
   * because those numbers never moved. Fails soft to the honest placeholder
   * on web / when the native API is unavailable.
   */
  private async readDeviceHealth(): Promise<{ battery: string; storageUsage: string; isLive: boolean }> {
    if (Platform.OS === 'web') {
      return { battery: '—', storageUsage: '—', isLive: false };
    }
    try {
      const [level, state, free, total] = await Promise.all([
        Battery.getBatteryLevelAsync(),
        Battery.getBatteryStateAsync(),
        FileSystem.getFreeDiskStorageAsync(),
        FileSystem.getTotalDiskCapacityAsync(),
      ]);

      const pct = Math.round(level * 100);
      const charging =
        state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
      const battery = `${pct}%${charging ? ' [Charging]' : pct > 20 ? ' [Optimal]' : ' [Low]'}`;

      const GB = 1024 ** 3;
      const freeGb = free / GB;
      const totalGb = total / GB;
      const freePct = totalGb > 0 ? Math.round((freeGb / totalGb) * 100) : 0;
      const storageUsage = `${freeGb.toFixed(1)} GB / ${totalGb.toFixed(1)} GB (${freePct}% Free)`;

      return { battery, storageUsage, isLive: true };
    } catch {
      return { battery: '—', storageUsage: '—', isLive: false };
    }
  }

  public async generateBriefing(): Promise<MorningBriefingData> {
    const store = useSevenStore.getState();
    const config = store.config;
    const userName = config.userName || 'Commander';
    const assistantName = config.assistantName || 'Seven AI';

    const hour = new Date().getHours();
    const isFr = config.language === 'fr';
    const timeOfDay = isFr
      ? (hour < 18 ? 'Bonjour' : 'Bonsoir')
      : (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

    const emails = store.googleState.recentEmails;

    // Real world facts first: Open-Meteo for the weather, RSS for the news,
    // and — when calendar permission was already granted — the actual
    // device agenda for today. This used to always read `googleState.
    // upcomingEvents`, a field nothing in the app ever populated, so the
    // briefing's "agenda" was permanently empty; it now reflects the real
    // calendar. Permission is never requested here (a background/greeting
    // flow is the wrong moment to prompt) — an ungranted calendar simply
    // yields an empty agenda, matching the previous behavior exactly.
    const [live, deviceHealth, calendarGranted] = await Promise.all([
      fetchLiveBriefing(config.language === 'fr' ? 'fr' : 'en').catch(() => ({
        weather: null,
        news: [] as LiveNewsItem[],
      })),
      this.readDeviceHealth(),
      calendarService.hasPermission().catch(() => false),
    ]);

    const calendarEvents = calendarGranted
      ? await calendarService.getTodayEvents().catch(() => null)
      : null;

    const events = (calendarEvents || []).map((e) => ({
      id: e.id,
      title: e.title,
      time: e.allDay
        ? isFr
          ? 'Toute la journée'
          : 'All day'
        : e.startDate.toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
      location: e.location || undefined,
    }));

    const weatherLine = live.weather
      ? isFr
        ? `${live.weather.tempC}°C à ${live.weather.location}, ${live.weather.condition.toLowerCase()}`
        : `${live.weather.tempC}°C in ${live.weather.location}, ${live.weather.condition.toLowerCase()}`
      : null;

    const data: MorningBriefingData = {
      greeting: isFr
        ? `${timeOfDay}, ${userName}. ${assistantName} au rapport.`
        : `${timeOfDay}, ${userName}. ${assistantName} reporting.`,
      weather: {
        temp: live.weather ? `${live.weather.tempC}°C` : isFr ? '—' : '—',
        condition: live.weather
          ? live.weather.condition
          : isFr
            ? 'Données indisponibles'
            : 'Data unavailable',
        humidity: live.weather ? `${live.weather.humidity}%` : '—',
        location: live.weather ? live.weather.location : (config.city || '—'),
      },
      unreadEmailsSummary: isFr
        ? `Vous avez ${emails.length} transmission(s) prioritaire(s) dans votre file Gmail.`
        : `You have ${emails.length} priority transmissions in your Gmail queue. Security audit and architecture reviews are cleared.`,
      agendaItems: events.map((e) => ({ time: e.time, title: e.title })),
      deviceHealth: {
        ...deviceHealth,
        astStatus:
          store.patchLogs.length > 0
            ? isFr
              ? `Armé • ${store.patchLogs.length} correctif(s) enregistré(s)`
              : `Armed • ${store.patchLogs.length} patch(es) logged`
            : isFr
              ? 'Armé • Aucune anomalie'
              : 'Armed • Zero Regressions',
      },
      techHighlight:
        'Seven AI neural core operating at 60 FPS. Dave Agent is ready for autonomous multi-file web deployment.',
      headlines: live.news,
      weatherIsLive: !!live.weather,
      spokenScript: (() => {
        const parts: string[] = [
          isFr
            ? `${timeOfDay}, ${userName}. Ici ${assistantName}.`
            : `${timeOfDay}, ${userName}. This is ${assistantName}.`,
        ];
        if (weatherLine) {
          parts.push(isFr ? `Il fait ${weatherLine}.` : `It is ${weatherLine}.`);
        }
        if (live.news.length) {
          const top = live.news
            .slice(0, 3)
            .map((n) => n.title)
            .join('. ');
          parts.push(
            isFr ? `À la une : ${top}.` : `Headlines: ${top}.`
          );
        }
        parts.push(
          isFr
            ? `Vous avez ${emails.length} e-mail(s) et ${events.length} événement(s) prévus aujourd'hui. Je suis à vos ordres.`
            : `You have ${emails.length} unread emails and ${events.length} events scheduled today. Standing by for your orders.`
        );
        return parts.join(' ');
      })(),
    };

    return data;
  }
}

export const morningBriefingService = MorningBriefingService.getInstance();
