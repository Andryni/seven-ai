import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Why this file is defensive: expo-notifications only implements local
 * scheduling on iOS/Android. On web every call rejects with an
 * UnavailabilityError, which used to surface as an uncaught error overlay and
 * took the whole Settings screen down. Every entry point here therefore checks
 * support first and swallows transport errors.
 */
export type BriefingResult = 'scheduled' | 'denied' | 'unsupported' | 'failed';

const isSupported = Platform.OS !== 'web';

/**
 * Daily morning briefing via local notifications (no server needed).
 * Scheduled at 08:00 local time; cancelled by the Settings toggle.
 */
class BriefingNotificationService {
  get supported(): boolean {
    return isSupported;
  }

  /** Idempotent: configures the Android channel and asks for permission. */
  async ensurePermissionsAsync(): Promise<boolean> {
    if (!isSupported) return false;
    try {
      const settings = await Notifications.getPermissionsAsync();
      let granted =
        settings.status === 'granted' ||
        settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      if (!granted) {
        const req = await Notifications.requestPermissionsAsync();
        granted = req.status === 'granted' || req.granted;
      }
      if (!granted) return false;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('briefing', {
          name: 'Morning Briefing',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#FFD700',
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Schedules (or re-schedules) the daily 08:00 briefing. */
  async scheduleDailyBriefing(): Promise<BriefingResult> {
    if (!isSupported) return 'unsupported';
    try {
      const ok = await this.ensurePermissionsAsync();
      if (!ok) return 'denied';

      await this.cancelDailyBriefing();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'SEVEN_OS // MORNING BRIEFING',
          body: 'Systems nominal. Tap to review your daily intel, unread emails and queued directives.',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: 'briefing',
          hour: 8,
          minute: 0,
        },
      });
      return 'scheduled';
    } catch {
      return 'failed';
    }
  }

  async cancelDailyBriefing(): Promise<void> {
    if (!isSupported) return;
    try {
      await Notifications.cancelScheduledNotificationAsync('morning-briefing');
    } catch {
      // Id was never scheduled — nothing to do.
    }
    try {
      // Fallback sweep: cancel anything tagged as the briefing.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of scheduled) {
        if (n.identifier === 'morning-briefing' || n.content?.title?.includes('MORNING BRIEFING')) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
    } catch {
      // Nothing scheduled / API unavailable on this platform.
    }
  }
}

export const briefingNotifications = new BriefingNotificationService();
