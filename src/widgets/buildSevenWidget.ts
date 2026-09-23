import React from 'react';
import { useSevenStore } from '../store/useSevenStore';
import { fetchWeather } from '../services/liveInfoService';
import { calendarService } from '../services/calendarService';
import { SevenWidget } from './SevenWidget';
import { formatWeatherGlance, formatNextEventGlance, withTimeout } from './glanceData';

/** Keyed by the widget `name` given to the config plugin (app.json). */
export const WIDGET_NAME = 'SevenStatus';

/**
 * A hung network/OS call must never stall the whole widget refresh cycle —
 * Android already gives a widget update broadcast a tight execution budget,
 * so each live fact gets its own generous-but-bounded timeout and fails
 * soft to an honest "unavailable" line instead of leaving the widget
 * showing yesterday's numbers indefinitely or crashing the update.
 */
const GLANCE_TIMEOUT_MS = 8000;

/**
 * Builds the current widget tree from live store state plus two "glance"
 * facts — today's weather and the next calendar event — so the home-screen
 * widget is actually informative at a glance instead of a static shortcut
 * pad. Both facts reuse the exact same services the in-app morning
 * briefing already relies on (Open-Meteo, on-device calendar), so there is
 * no second, divergent data source to keep in sync.
 *
 * Called from two independent runtimes:
 *  - the headless JS context (`widget-task-handler.ts`) when Android re-renders
 *    the widget itself (added, resized, `updatePeriodMillis` timer), and
 *  - the normal app process (`useWidgetRefresh`) when the user comes back to
 *    the foreground — the 30-minute OS timer alone leaves a 30-minute-stale
 *    weather/agenda line, which is not what "glanceable" should mean.
 * In the headless runtime there are no mounted screens and no
 * `app/_layout.tsx` effect to call `loadSavedConfig()`, so callers there
 * must hydrate the store from disk first; the app process has already
 * hydrated by the time any screen mounts.
 */
export async function buildWidget() {
  const { config, status } = useSevenStore.getState();
  const assistantName = config.assistantName || 'Seven AI';
  const accentColor = config.themeColor || '#00E5FF';
  const statusLine =
    status && status !== 'idle' ? `${status.toUpperCase()}...` : 'SYSTEMS NOMINAL';
  const language: 'fr' | 'en' = config.language === 'fr' ? 'fr' : 'en';

  const city = config.city?.trim() || (language === 'fr' ? 'Paris' : 'London');

  const [weather, calendarGranted] = await Promise.all([
    withTimeout(fetchWeather(city, language).catch(() => null), GLANCE_TIMEOUT_MS, null),
    withTimeout(calendarService.hasPermission().catch(() => false), GLANCE_TIMEOUT_MS, false),
  ]);
  const events = calendarGranted
    ? await withTimeout(calendarService.getTodayEvents().catch(() => null), GLANCE_TIMEOUT_MS, null)
    : null;

  return React.createElement(SevenWidget, {
    assistantName,
    statusLine,
    accentColor,
    weatherLine: formatWeatherGlance(weather, language),
    nextEventLine: formatNextEventGlance(events, language),
    language,
  });
}
