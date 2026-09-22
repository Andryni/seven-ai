import * as Linking from 'expo-linking';
import * as Battery from 'expo-battery';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

export interface DeviceActionResult {
  success: boolean;
  message: string;
  data?: any;
}

class DeviceControlService {
  private static instance: DeviceControlService;

  private constructor() {}

  public static getInstance(): DeviceControlService {
    if (!DeviceControlService.instance) {
      DeviceControlService.instance = new DeviceControlService();
    }
    return DeviceControlService.instance;
  }

  /**
   * Get Battery Level and State
   */
  public async getBatteryStatus(): Promise<DeviceActionResult> {
    try {
      const level = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      const isLowPowerMode = await Battery.isLowPowerModeEnabledAsync();

      const pct = Math.round(level * 100);
      let stateDesc = 'on battery';
      if (state === Battery.BatteryState.CHARGING) stateDesc = 'charging';
      else if (state === Battery.BatteryState.FULL) stateDesc = 'fully charged';
      else if (state === Battery.BatteryState.UNPLUGGED) stateDesc = 'unplugged (discharging)';

      const message = `Battery is at ${pct}%, ${stateDesc}.${isLowPowerMode ? ' Power saving mode is ACTIVE.' : ''}`;
      return {
        success: true,
        message,
        data: { level: pct, state: stateDesc, isLowPowerMode },
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Battery status unavailable: ${e.message || e}`,
      };
    }
  }

  /**
   * Read system clipboard content
   */
  public async readClipboard(): Promise<DeviceActionResult> {
    try {
      const content = await Clipboard.getStringAsync();
      if (!content || !content.trim()) {
        return { success: true, message: 'The clipboard is currently empty.', data: '' };
      }
      return {
        success: true,
        message: `Clipboard content retrieved (${content.length} characters).`,
        data: content,
      };
    } catch (e: any) {
      return { success: false, message: `Failed to read clipboard: ${e.message || e}` };
    }
  }

  /**
   * Copy text to system clipboard
   */
  public async copyToClipboard(text: string): Promise<DeviceActionResult> {
    try {
      await Clipboard.setStringAsync(text);
      return {
        success: true,
        message: 'Content successfully copied to your device clipboard.',
        data: text,
      };
    } catch (e: any) {
      return { success: false, message: `Failed to copy to clipboard: ${e.message || e}` };
    }
  }

  /**
   * Initiate phone call
   */
  public async callNumber(phoneNumber: string): Promise<DeviceActionResult> {
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    const url = `tel:${cleanNumber}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported || Platform.OS === 'android') {
        await Linking.openURL(url);
        return { success: true, message: `Dialer opened for ${phoneNumber}` };
      }
      return { success: false, message: `Telephony is not available on this device.` };
    } catch (e: any) {
      return { success: false, message: `Failed to initiate call: ${e.message || e}` };
    }
  }

  /**
   * Send SMS
   */
  public async sendSms(phoneNumber: string, body?: string): Promise<DeviceActionResult> {
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    const encodedBody = body ? encodeURIComponent(body) : '';
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${cleanNumber}${encodedBody ? `${separator}body=${encodedBody}` : ''}`;
    try {
      await Linking.openURL(url);
      return { success: true, message: `SMS composer opened for ${phoneNumber}` };
    } catch (e: any) {
      return { success: false, message: `Failed to open SMS composer: ${e.message || e}` };
    }
  }

  /**
   * Open WhatsApp with recipient and message
   */
  public async openWhatsApp(phoneNumber?: string, text?: string): Promise<DeviceActionResult> {
    const cleanNumber = phoneNumber ? phoneNumber.replace(/[^\d+]/g, '') : '';
    const encodedText = text ? encodeURIComponent(text) : '';
    let url = 'whatsapp://send';
    if (cleanNumber) {
      url += `?phone=${cleanNumber}${encodedText ? `&text=${encodedText}` : ''}`;
    } else if (encodedText) {
      url += `?text=${encodedText}`;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported || Platform.OS === 'android') {
        await Linking.openURL(url);
        return { success: true, message: 'WhatsApp dispatched successfully.' };
      }
      // Fallback to web WhatsApp
      const webUrl = `https://wa.me/${cleanNumber}${encodedText ? `?text=${encodedText}` : ''}`;
      await Linking.openURL(webUrl);
      return { success: true, message: 'WhatsApp Web link dispatched.' };
    } catch (e: any) {
      return { success: false, message: `Failed to dispatch WhatsApp: ${e.message || e}` };
    }
  }

  /**
   * Open Maps / Navigation to location
   */
  public async openMaps(destination: string): Promise<DeviceActionResult> {
    const encoded = encodeURIComponent(destination);
    const url =
      Platform.OS === 'ios'
        ? `maps://?q=${encoded}`
        : `geo:0,0?q=${encoded}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return { success: true, message: `Navigation routed to "${destination}".` };
      }
      // Fallback to Google Maps Web
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
      return { success: true, message: `Google Maps opened for "${destination}".` };
    } catch (e: any) {
      return { success: false, message: `Could not open maps: ${e.message || e}` };
    }
  }

  /**
   * Open specific Android Settings
   */
  public async openSettings(settingType: 'wifi' | 'bluetooth' | 'battery' | 'application' = 'application'): Promise<DeviceActionResult> {
    try {
      if (Platform.OS === 'android') {
        // Expo Linking openSettings opens app details settings
        await Linking.openSettings();
        return { success: true, message: `Android Settings opened (${settingType}).` };
      } else {
        await Linking.openURL('app-settings:');
        return { success: true, message: 'System Settings opened.' };
      }
    } catch (e: any) {
      return { success: false, message: `Unable to open settings: ${e.message || e}` };
    }
  }
}

export const deviceControl = DeviceControlService.getInstance();
