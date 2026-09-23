import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { useSevenStore } from '../store/useSevenStore';
import { WIDGET_NAME, buildWidget } from './buildSevenWidget';

/**
 * Entry point registered from `index.js` via `registerWidgetTaskHandler`.
 * Runs in a headless JS context (no navigation, no mounted screens, and
 * critically no `app/_layout.tsx` effect to call `loadSavedConfig()` for
 * us) any time Android needs the widget's RemoteViews re-rendered: added
 * to the home screen, resized, or refreshed on its `updatePeriodMillis`
 * timer. So the handler hydrates the store from disk itself before
 * reading `config`/`status` off it — the app-process refresh path
 * (`useWidgetRefresh`) has no need to, since screens hydrate on mount.
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
