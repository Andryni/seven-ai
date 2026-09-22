import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useSevenStore } from '../store/useSevenStore';

class InstagramService {
  private static instance: InstagramService;

  private constructor() {}

  public static getInstance(): InstagramService {
    if (!InstagramService.instance) {
      InstagramService.instance = new InstagramService();
    }
    return InstagramService.instance;
  }

  /**
   * Opens the real Instagram login page in the system browser.
   *
   * NOTE: Instagram exposes no public API for reading DMs on behalf of a
   * personal account. The previous implementation fabricated a connected
   * state with fake unread messages; that is removed. The app can only open
   * the browser session — it cannot scrape DMs.
   */
  public async connectViaBrowser(): Promise<boolean> {
    const store = useSevenStore.getState();
    store.addTerminalLog('Opening Instagram login in system browser...', 'cmd');

    try {
      if (Platform.OS !== 'web') {
        await WebBrowser.openBrowserAsync('https://www.instagram.com/accounts/login/', {
          showInRecents: true,
        });
      } else if (typeof window !== 'undefined') {
        window.open('https://www.instagram.com/accounts/login/', '_blank');
      }

      store.addTerminalLog(
        'Browser session opened. DM monitoring is not possible: Instagram has no public DM API.',
        'info'
      );
      return true;
    } catch (e: any) {
      store.addTerminalLog(`Instagram browser error: ${e?.message || e}`, 'error');
      return false;
    }
  }

  /**
   * Honest response: there is no public API to read Instagram DMs.
   */
  public async checkDirectMessages(): Promise<string> {
    const store = useSevenStore.getState();
    store.addTerminalLog('Instagram DM check requested but no public API exists.', 'warn');
    return 'Instagram DM monitoring is not available: Instagram does not provide a public API to read direct messages for personal accounts. You can open Instagram in your browser from Settings.';
  }
}

export const instagramService = InstagramService.getInstance();
