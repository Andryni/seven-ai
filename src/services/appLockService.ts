import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/**
 * Biometric app lock: gates the whole app behind Face ID / fingerprint /
 * device passcode when the user opts in. The assistant stores API keys,
 * chat history, and (via the contacts/calendar integrations) a live view
 * into the user's address book and schedule — worth a lock screen for
 * anyone who shares a phone or is worried about it being picked up.
 *
 * Deliberately thin: it only answers "can we lock?" and "did the user just
 * prove who they are?" — everything about *when* to ask (cold launch,
 * returning from background) lives in `useAppLock`, which is what actually
 * has a UI lifecycle to hook into.
 */
class AppLockService {
  /** Whether this device has usable biometric/passcode hardware at all. */
  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return false;
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      return isEnrolled;
    } catch {
      return false;
    }
  }

  /** Human-readable description of what will be used (for the settings hint). */
  async describeMethod(lang: 'fr' | 'en'): Promise<string> {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
      if (hasFace && hasFingerprint) {
        return lang === 'fr' ? 'Empreinte ou visage' : 'Fingerprint or face';
      }
      if (hasFace) return lang === 'fr' ? 'Reconnaissance faciale' : 'Face recognition';
      if (hasFingerprint) return lang === 'fr' ? 'Empreinte digitale' : 'Fingerprint';
      return lang === 'fr' ? 'Code de l\u2019appareil' : 'Device passcode';
    } catch {
      return lang === 'fr' ? 'Verrouillage de l\u2019appareil' : 'Device lock';
    }
  }

  /**
   * Prompts the OS authentication sheet. Resolves to true only on an
   * explicit success — a cancel, a lockout, or any error all count as "not
   * unlocked" so the caller's default stays locked-out rather than open.
   */
  async authenticate(promptMessage: string, cancelLabel: string): Promise<boolean> {
    if (Platform.OS === 'web') return true; // No biometric concept on web; never gate it.
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel,
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  }
}

export const appLockService = new AppLockService();
