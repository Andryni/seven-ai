import { Buffer } from 'buffer';
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/widget-task-handler';

if (typeof global !== 'undefined' && !global.Buffer) {
  global.Buffer = Buffer;
}

// Runs the SevenStatus home-screen widget's render/update lifecycle in the
// headless JS context Android spins up for widget events. Safe to register
// unconditionally: on iOS/web this is a same-process no-op registration
// that is simply never invoked (there is no AppWidget host to call it).
registerWidgetTaskHandler(widgetTaskHandler);
