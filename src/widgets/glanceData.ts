import type { LiveWeather } from '../services/liveInfoService';
import type { CalendarEventSummary } from '../services/calendarService';

/**
 * Pure formatting for the home-screen widget's two "glance" lines (weather +
 * next calendar event). Kept separate from `widget-task-handler.ts` — which
 * does the actual fetching in a headless JS context react-native-android-
 * widget spins up — so this logic is unit-testable without mocking the
 * widget library or the store at all.
 */

/** "18°C Overcast • Paris", or an honest unavailable line when the fetch
 *  failed/timed out (never a stale/fake number). */
export function formatWeatherGlance(weather: LiveWeather | null, language: 'fr' | 'en'): string {
  if (!weather) {
    return language === 'fr' ? 'Météo indisponible' : 'Weather unavailable';
  }
  return `${weather.tempC}°C ${weather.condition} • ${weather.location}`;
}

/**
 * "14:30 • Team sync", the earliest event today that hasn't ended yet.
 * `events === null` means the read itself failed (permission revoked mid
 * flight, OS calendar error) — distinct from `[]`, which means the calendar
 * was read successfully and is simply empty today.
 */
export function formatNextEventGlance(
  events: CalendarEventSummary[] | null,
  language: 'fr' | 'en',
  now: Date = new Date()
): string {
  if (events === null) {
    return language === 'fr' ? 'Agenda indisponible' : 'Agenda unavailable';
  }
  const upcoming = events
    .filter((e) => e.allDay || e.endDate.getTime() > now.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  if (!upcoming) {
    return language === 'fr' ? 'Aucun événement aujourd\u2019hui' : 'No events today';
  }
  const time = upcoming.allDay
    ? language === 'fr'
      ? 'Toute la journée'
      : 'All day'
    : upcoming.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${time} • ${upcoming.title}`;
}

/**
 * Resolves `promise` or `fallback` after `ms`, whichever comes first. The
 * widget task handler runs in a short-lived headless JS process on a
 * 30-minute refresh timer (see app.json's `updatePeriodMillis`) — a hung
 * network call must never block that cycle indefinitely, and Android will
 * kill a task that overruns its own budget anyway, so failing soft to
 * `fallback` (rather than letting the whole widget update crash/hang) is
 * strictly better than the alternative.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}
