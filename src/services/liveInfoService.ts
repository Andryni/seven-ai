import { fetchWithTimeout } from './network';
import { useSevenStore } from '../store/useSevenStore';

/**
 * Real-world information, fetched without any API key.
 *
 * Everything here is plain `fetch` over public endpoints, so it works in an
 * OTA update and costs nothing:
 *  - weather: Open-Meteo (free, no key) with the city the user set in Settings;
 *  - news: public RSS feeds (home country + international), parsed with a
 *    regex-based extractor — no XML dependency to pull in.
 *
 * All calls fail soft: an unreachable service degrades that section to a
 * neutral line instead of breaking the briefing.
 */

export interface LiveWeather {
  tempC: number;
  condition: string;
  humidity: number;
  windKmh: number;
  location: string;
  /** WMO weather code as reported by Open-Meteo (for the icon). */
  code: number;
  isDay: boolean;
}

export interface DailyForecast {
  date: string;
  minC: number;
  maxC: number;
  precipitationChance: number;
  condition: string;
  code: number;
}

export interface LiveNewsItem {
  title: string;
  source: string;
  /** ISO timestamp, when the feed provides one. */
  published?: string;
  link?: string;
}

const WEATHER_CODES: Record<number, { fr: string; en: string }> = {
  0: { fr: 'Ciel dégagé', en: 'Clear sky' },
  1: { fr: 'Plutôt dégagé', en: 'Mainly clear' },
  2: { fr: 'Partiellement nuageux', en: 'Partly cloudy' },
  3: { fr: 'Couvert', en: 'Overcast' },
  45: { fr: 'Brouillard', en: 'Fog' },
  48: { fr: 'Brouillard givrant', en: 'Freezing fog' },
  51: { fr: 'Bruine légère', en: 'Light drizzle' },
  53: { fr: 'Bruine', en: 'Drizzle' },
  55: { fr: 'Bruine dense', en: 'Dense drizzle' },
  61: { fr: 'Pluie faible', en: 'Slight rain' },
  63: { fr: 'Pluie', en: 'Rain' },
  65: { fr: 'Forte pluie', en: 'Heavy rain' },
  66: { fr: 'Pluie verglaçante', en: 'Freezing rain' },
  71: { fr: 'Neige faible', en: 'Slight snow' },
  73: { fr: 'Neige', en: 'Snow' },
  75: { fr: 'Fortes chutes de neige', en: 'Heavy snow' },
  77: { fr: 'Grains de neige', en: 'Snow grains' },
  80: { fr: 'Averses faibles', en: 'Light showers' },
  81: { fr: 'Averses', en: 'Showers' },
  82: { fr: 'Averses violentes', en: 'Violent showers' },
  85: { fr: 'Averses de neige', en: 'Snow showers' },
  86: { fr: 'Fortes averses de neige', en: 'Heavy snow showers' },
  95: { fr: 'Orage', en: 'Thunderstorm' },
  96: { fr: 'Orage et grêle', en: 'Thunderstorm with hail' },
  99: { fr: 'Orage violent et grêle', en: 'Severe thunderstorm with hail' },
};

/** City typed in Settings → Open-Meteo geocoding (top match). */
export async function resolveCity(
  city: string,
  language: 'fr' | 'en'
): Promise<{ latitude: number; longitude: number; name: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city
    )}&count=1&language=${language}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = await res.json();
    const hit = json?.results?.[0];
    if (!hit) return null;
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      // Prefer the localised name the API returns; fall back to what was typed.
      name: hit.name || city,
    };
  } catch {
    return null;
  }
}

export async function fetchWeather(
  city: string,
  language: 'fr' | 'en'
): Promise<LiveWeather | null> {
  const place = await resolveCity(city, language);
  if (!place) return null;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,is_day,weather_code,wind_speed_10m&wind_speed_unit=kmh`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = await res.json();
    const cur = json?.current;
    if (!cur) return null;
    const codes = WEATHER_CODES[cur.weather_code] ?? {
      fr: 'Conditions variables',
      en: 'Variable conditions',
    };
    return {
      tempC: Math.round(cur.temperature_2m),
      condition: language === 'fr' ? codes.fr : codes.en,
      humidity: Math.round(cur.relative_humidity_2m),
      windKmh: Math.round(cur.wind_speed_10m ?? 0),
      location: place.name,
      code: cur.weather_code,
      isDay: cur.is_day === 1,
    };
  } catch {
    return null;
  }
}

export async function fetchDailyForecast(
  city: string,
  language: 'fr' | 'en'
): Promise<DailyForecast[]> {
  const place = await resolveCity(city, language);
  if (!place) return [];
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7';
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const daily = (await res.json())?.daily;
    if (!daily?.time) return [];
    return daily.time.map((date: string, index: number) => {
      const code = Number(daily.weather_code?.[index] ?? 0);
      const condition = WEATHER_CODES[code] ?? { fr: 'Conditions variables', en: 'Variable conditions' };
      return {
        date,
        minC: Math.round(daily.temperature_2m_min?.[index] ?? 0),
        maxC: Math.round(daily.temperature_2m_max?.[index] ?? 0),
        precipitationChance: Math.round(daily.precipitation_probability_max?.[index] ?? 0),
        condition: language === 'fr' ? condition.fr : condition.en,
        code,
      };
    });
  } catch {
    return [];
  }
}

/** RSS feeds, per UI language: home/region first, then international. */
const NEWS_FEEDS: Record<'fr' | 'en', { url: string; source: string; world: boolean }[]> = {
  fr: [
    { url: 'https://www.lemonde.fr/rss/une.xml', source: 'Le Monde', world: false },
    { url: 'https://www.rfi.fr/fr/rss', source: 'RFI', world: false },
    { url: 'https://www.france24.com/fr/rss', source: 'France 24', world: true },
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', world: true },
  ],
  en: [
    { url: 'https://feeds.bbci.co.uk/news/rss.xml', source: 'BBC', world: false },
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', world: true },
    { url: 'https://www.reuters.com/world/rss', source: 'Reuters', world: true },
  ],
};

/** Minimal RSS/Atom item extraction without an XML parser dependency.
 *  Exported for tests: this regex parser is the fragile part of the service. */
export const parseFeed = (xml: string, source: string): LiveNewsItem[] => {
  const items: LiveNewsItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) ?? [];
  for (const block of blocks.slice(0, 12)) {
    const title =
      stripTags(firstTag(block, 'title')) ||
      '';
    if (!title) continue;
    const link = firstTag(block, 'link') || attrValue(block, 'href');
    items.push({
      title,
      source,
      published: firstTag(block, 'pubDate') || firstTag(block, 'updated') || undefined,
      link: link || undefined,
    });
  }
  return items;
};

const firstTag = (block: string, tag: string): string => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
};

const attrValue = (block: string, attr: string): string => {
  const m = block.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
};

const stripTags = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

/**
 * Headlines: the home feed first (a couple of items), then world news, so the
 * briefing reads like "here, then the world". Anything unreachable is skipped.
 */
export async function fetchNews(
  language: 'fr' | 'en',
  perFeed = 2
): Promise<LiveNewsItem[]> {
  const feeds = NEWS_FEEDS[language] ?? NEWS_FEEDS.en;
  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await fetchWithTimeout(feed.url, {
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
          // Some publishers (BBC…) answer an empty body to unknown clients.
          'User-Agent': 'SevenAI/3.3 (Android)',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseFeed(await res.text(), feed.source);
    })
  );
  const home: LiveNewsItem[] = [];
  const world: LiveNewsItem[] = [];
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    (feeds[i].world ? world : home).push(...r.value.slice(0, perFeed));
  });
  return [...home.slice(0, perFeed), ...world.slice(0, perFeed)];
}

/** Both facts at once, in one call from the greeting/briefing. */
export async function fetchLiveBriefing(
  language: 'fr' | 'en'
): Promise<{ weather: LiveWeather | null; news: LiveNewsItem[] }> {
  const { config } = useSevenStore.getState();
  const city = (config as { city?: string }).city?.trim() || (language === 'fr' ? 'Paris' : 'London');
  const [weather, news] = await Promise.all([fetchWeather(city, language), fetchNews(language)]);
  return { weather, news };
}
