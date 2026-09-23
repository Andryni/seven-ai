import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { useSevenStore } from '../store/useSevenStore';
import { fetchWeather } from '../services/liveInfoService';
import { calendarService } from '../services/calendarService';
import { SevenWidget } from './SevenWidget';
import { formatWeatherGlance, formatNextEventGlance, withTimeout } from './glanceData';

/** Keyed by the widget `name` given to the config plugin (app.json). */
const WIDGET_NAME = 'SevenStatus';

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
 * Called both when the widget is first added and on every scheduled/
 * requested refresh, so what it shows always reflects what the app/device
 * last knew, even though the widget process is a separate short-lived JS
 * runtime with no mounted screens.
 */
async function buildWidget() {
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
  });
}

/**
 * Entry point registered from `index.js` via `registerWidgetTaskHandler`.
 * Runs in a headless JS context (no navigation, no mounted screens, and
 * critically no `app/_layout.tsx` effect to call `loadSavedConfig()` for
 * us) any time Android needs the widget's RemoteViews re-rendered: added
 * to the home screen, resized, or refreshed on its `updatePeriodMillis`
 * timer. So the handler hydrates the store from disk itself before
 * reading `config`/`status` off it.
 *
 * Deliberately minimal otherwise: every actionable tap uses the
 * `OPEN_URI` / `OPEN_APP` special click actions handled natively by the
 * library, so `WIDGET_CLICK` never needs custom logic here — the deep
 * link (`seven://organizer`, `seven://dave`, ...) is resolved by Expo
 * Router once the app launches.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await useSevenStore.getState().loadSavedConfig();
      props.renderWidget(await buildWidget());
      break;
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
    default:
      break;
  }
}
