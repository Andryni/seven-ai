import { Platform } from 'react-native';
import { isExpoGo } from './notificationsAdapter';

export async function refreshAndroidWidget(): Promise<void> {
  if (Platform.OS !== 'android' || isExpoGo) return;
  try {
    // Keep both the native module and widget JSX graph outside Expo Go's route
    // evaluation; neither module exists in the stock client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requestWidgetUpdate } = require('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WIDGET_NAME, buildWidget } = require('../widgets/buildSevenWidget');
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => buildWidget() });
  } catch {
    // Development client not rebuilt with the widget module, or no widget host.
  }
}
