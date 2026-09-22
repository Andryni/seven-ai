import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Central haptic feedback service. On Android this maps to the platform
 * vibration API through expo-haptics; on web it is a silent no-op.
 * Every interactive surface in the app routes through these four verbs.
 */
class HapticsService {
  /** Light tick: taps, chips, deck cards. */
  light() {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  /** Medium impact: mic toggle, primary actions. */
  medium() {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  /** Success notification: task completed. */
  success() {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  /** Warning double-tap: offline queued, failures. */
  warning() {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }

  /** Error notification: exceptions. */
  error() {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }
}

export const haptics = new HapticsService();
