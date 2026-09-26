import { Platform } from 'react-native';
import type * as QuickActionsType from 'expo-quick-actions';
import type { Language } from '../theme/i18n';
import { isExpoGo } from './notificationsAdapter';

let QuickActions: typeof QuickActionsType | null = null;
if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    QuickActions = require('expo-quick-actions');
  } catch { QuickActions = null; }
}

/**
 * Long-press-the-app-icon shortcuts (Android "App Shortcuts" / iOS "Home
 * Screen Quick Actions"). This is the one piece of "JARVIS lives outside the
 * app too" the project didn't have: every other module lived entirely
 * behind a cold launch + tap. A no-op on web (expo-quick-actions ships a web
 * shim) and safe to call every time the app boots — setItems just replaces
 * whatever was registered before.
 */
export const QUICK_ACTION_IDS = {
  organize: 'organize_downloads',
  briefing: 'morning_briefing',
  research: 'research_pdf',
  build: 'dave_build',
} as const;

export type QuickActionId = (typeof QUICK_ACTION_IDS)[keyof typeof QUICK_ACTION_IDS];

class QuickActionsService {
  private static instance: QuickActionsService;

  private constructor() {}

  public static getInstance(): QuickActionsService {
    if (!QuickActionsService.instance) {
      QuickActionsService.instance = new QuickActionsService();
    }
    return QuickActionsService.instance;
  }

  public async isSupported(): Promise<boolean> {
    if (!QuickActions) return false;
    try {
      return await QuickActions.isSupported();
    } catch {
      return false;
    }
  }

  /** Registers the four highest-value shortcuts, localized. */
  public async registerDefaultActions(lang: Language = 'en'): Promise<void> {
    if (!QuickActions) return;
    const isFr = lang === 'fr';
    try {
      await QuickActions.setItems([
        {
          id: QUICK_ACTION_IDS.organize,
          title: isFr ? 'Organiser les fichiers' : 'Organize files',
          subtitle: isFr ? 'Trier le dossier Téléchargements' : 'Sort the Downloads folder',
          icon: Platform.OS === 'ios' ? 'symbol:folder.fill' : undefined,
        },
        {
          id: QUICK_ACTION_IDS.briefing,
          title: isFr ? 'Briefing du matin' : 'Morning briefing',
          subtitle: isFr ? 'Météo, actus, appareil' : 'Weather, news, device',
          icon: Platform.OS === 'ios' ? 'symbol:sun.max.fill' : undefined,
        },
        {
          id: QUICK_ACTION_IDS.research,
          title: isFr ? 'Recherche → PDF' : 'Research to PDF',
          subtitle: isFr ? 'Nouveau rapport' : 'New report',
          icon: Platform.OS === 'ios' ? 'symbol:doc.text.fill' : undefined,
        },
        {
          id: QUICK_ACTION_IDS.build,
          title: isFr ? 'Créer un site' : 'Build a website',
          subtitle: isFr ? 'Dave Agent' : 'Dave Agent',
          icon: Platform.OS === 'ios' ? 'symbol:hammer.fill' : undefined,
        },
      ]);
    } catch {
      // Older OS versions / unsupported devices: silently keep the app's
      // in-app quick commands as the only entry point.
    }
  }
}

export const quickActionsService = QuickActionsService.getInstance();
