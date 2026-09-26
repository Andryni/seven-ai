import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';

export type NotificationsModule = typeof ExpoNotifications;

/**
 * expo-notifications throws while the module is being evaluated in Expo Go on
 * Android (SDK 53+). A normal static import therefore prevents Expo Router from
 * evaluating every route and misleadingly reports that their default exports
 * are missing. Keep the native module behind this runtime gate instead.
 */
export const isExpoGo =
  Constants.appOwnership === 'expo' ||
  String(Constants.executionEnvironment) === 'storeClient';

let cached: NotificationsModule | null | undefined;

export function getNotificationsModule(): NotificationsModule | null {
  if (Platform.OS === 'web' || isExpoGo) return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch (error) {
    console.warn('[notifications] Native module unavailable; reminders disabled.', error);
    cached = null;
  }
  return cached;
}

export const localNotificationsSupported = (): boolean =>
  getNotificationsModule() !== null;
