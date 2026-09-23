import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Foreground presentation policy for OS notifications.
 *
 * expo-notifications' documented default, when no handler is installed, is
 * **not to show the notification at all**. That made a routine firing while
 * SEVEN happened to be open invisible: no banner, no tray entry, so the
 * user could never tap it and the action silently looked like it never
 * happened. Routines and briefings are reminders — they must always surface.
 *
 * `shouldPlaySound` stays true on purpose: on Android, a false value
 * suppresses the drop-down alert no matter what the channel's importance is,
 * which would reintroduce the same invisibility.
 */
let installed = false;

/** Idempotent: installing the handler twice would only reset the same policy. */
export function installNotificationHandler(): void {
  // Web has no notification handler; calling it there would only add a
  // native-module warning to the console.
  if (Platform.OS === 'web' || installed) return;
  installed = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // Unread routine count is not a concept this app has.
      shouldSetBadge: false,
    }),
  });
}
