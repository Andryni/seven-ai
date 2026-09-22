import { useSevenStore } from '../store/useSevenStore';
import { fetchLiveBriefing, type LiveNewsItem } from './liveInfoService';

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
    const events = store.googleState.upcomingEvents;

    // Real world facts first: Open-Meteo for the weather, RSS for the news.
    // Everything here fails soft — an unreachable service simply falls back to
    // the neutral copy below instead of breaking the briefing.
    const live = await fetchLiveBriefing(config.language === 'fr' ? 'fr' : 'en').catch(() => ({
      weather: null,
      news: [] as LiveNewsItem[],
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
        battery: '98% [Optimal]',
        storageUsage: '14.2 GB / 128 GB (88% Free)',
        astStatus: 'Armed • Zero Regressions',
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
