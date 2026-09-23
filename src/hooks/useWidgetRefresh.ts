import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { WIDGET_NAME, buildWidget } from '../widgets/buildSevenWidget';

/**
 * Keeps the home-screen widget's glance lines fresh on app foreground.
 *
 * Android only re-invokes `widgetTaskHandler` on its own schedule (widget
 * added, resized, or the 30-minute `updatePeriodMillis` timer — see
 * app.json). That is fine for the headless path, but it means a widget can
 * sit on the home screen showing a weather/agenda line up to half an hour
 * stale even while the app it mirrors was just used. This hook closes the
 * gap the cheap way: every time the app comes back to the foreground (and
 * once on cold start), the app process itself renders the current widget
 * tree through `requestWidgetUpdate` — the exact same `buildWidget()` the
 * headless handler runs, so there is still only one source of truth for
 * what the widget shows.
 *
 * Wrapped components may import `react-native-android-widget`, which is
 * native-module code with no web implementation, so this is a no-op on web.
 * The request is fire-and-forget: a failed refresh (no widget added, native
 * module unavailable in some build flavors) must never surface as an error
 * inside a render/effect of the app itself.
 */
export function useWidgetRefresh(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const refresh = () => {
      requestWidgetUpdate({
        widgetName: WIDGET_NAME,
        renderWidget: () => buildWidget(),
        // No widget on the home screen — nothing to update, nothing to clean up.
      }).catch(() => {
        // Best-effort by design; the OS timer still covers the widget.
      });
    };

    refresh();
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, []);
}
