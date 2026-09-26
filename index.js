import { Buffer } from 'buffer';
import Constants from 'expo-constants';

if (typeof global !== 'undefined' && !global.Buffer) {
  global.Buffer = Buffer;
}

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  String(Constants.executionEnvironment) === 'storeClient';

// Native home-screen widgets are not bundled in Expo Go. Keeping registration
// behind a runtime require lets the same JavaScript bundle open in Expo Go,
// while development/production clients still register the headless handler.
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { widgetTaskHandler } = require('./src/widgets/widget-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // Native widget module absent from this client flavor.
  }
}

require('expo-router/entry');
