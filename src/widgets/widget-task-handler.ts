import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { useSevenStore } from '../store/useSevenStore';
import { SevenWidget } from './SevenWidget';

/** Keyed by the widget `name` given to the config plugin (app.json). */
const WIDGET_NAME = 'SevenStatus';

/**
 * Builds the current widget tree from live store state. Called both when
 * the widget is first added and on every scheduled/requested refresh, so
 * the status line and accent color always reflect what the app last knew,
 * even though the widget process is a separate short-lived JS runtime.
 */
function buildWidget() {
  const { config, status } = useSevenStore.getState();
  const assistantName = config.assistantName || 'Seven AI';
  const accentColor = config.themeColor || '#00E5FF';
  const statusLine =
    status && status !== 'idle' ? `${status.toUpperCase()}...` : 'SYSTEMS NOMINAL';
  return React.createElement(SevenWidget, { assistantName, statusLine, accentColor });
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
      props.renderWidget(buildWidget());
      break;
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
    default:
      break;
  }
}

