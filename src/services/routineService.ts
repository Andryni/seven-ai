import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useSevenStore } from '../store/useSevenStore';
import type { AutomationRoutine, RoutineAction, RoutineTrigger } from '../types';
import { morningBriefingService } from './morningBriefingService';
import { fileOrganizer } from './fileOrganizer';
import { gmailService } from './gmailService';
import { webSearchService } from './webSearchService';

/**
 * Local, no-server automation engine: "every morning at 8, run my briefing",
 * "every Monday at 9, check my emails", "remind me to call the bank at
 * 17:00". SEVEN has no persistent server-side process, so triggers are
 * scheduled as real OS-level local notifications (the same mechanism
 * already proven by briefingNotificationService) — the OS itself wakes the
 * device and delivers the notification even if the app was killed, which a
 * JS timer or in-memory scheduler could never do.
 *
 * Tapping the notification (or the app being foregrounded right after it
 * fires) is what actually runs the routine's action — see
 * `runDueRoutineFromNotification`. This means an action never silently
 * "fires" while the app is fully backgrounded with no process alive; it
 * runs the moment the user is back in the app, which for a personal
 * assistant is an intentional trade-off over a fragile background-fetch
 * job that the OS may throttle or kill outright.
 */

export type RoutineScheduleResult = 'scheduled' | 'denied' | 'unsupported' | 'failed' | 'invalid';

const isSupported = Platform.OS !== 'web';
const CHANNEL_ID = 'seven-routines';
const NOTIFICATION_DATA_KIND = 'seven-routine';

function notificationIdFor(routineId: string): string {
  return `seven-routine-${routineId}`;
}

/** Validates a trigger's shape before it is ever handed to the OS scheduler. */
export function validateTrigger(trigger: RoutineTrigger): string | null {
  if (!Number.isInteger(trigger.hour) || trigger.hour < 0 || trigger.hour > 23) {
    return 'Hour must be between 0 and 23.';
  }
  if (!Number.isInteger(trigger.minute) || trigger.minute < 0 || trigger.minute > 59) {
    return 'Minute must be between 0 and 59.';
  }
  if (trigger.type === 'weekly') {
    if (!Number.isInteger(trigger.weekday) || trigger.weekday! < 1 || trigger.weekday! > 7) {
      return 'A weekly routine needs a weekday between 1 (Sunday) and 7 (Saturday).';
    }
  }
  if (trigger.type === 'once') {
    if (!trigger.date || Number.isNaN(new Date(`${trigger.date}T00:00:00`).getTime())) {
      return 'A one-time routine needs a valid date (YYYY-MM-DD).';
    }
    const target = new Date(`${trigger.date}T${String(trigger.hour).padStart(2, '0')}:${String(trigger.minute).padStart(2, '0')}:00`);
    if (target.getTime() <= Date.now()) {
      return 'A one-time routine must be scheduled in the future.';
    }
  }
  return null;
}

function describeAction(action: RoutineAction, language: 'fr' | 'en'): { title: string; body: string } {
  const isFr = language === 'fr';
  switch (action.type) {
    case 'morning_briefing':
      return {
        title: isFr ? 'SEVEN // Briefing programmé' : 'SEVEN // Scheduled briefing',
        body: isFr ? 'Ouvrez SEVEN pour votre briefing du jour.' : 'Open SEVEN for your scheduled briefing.',
      };
    case 'organize_files':
      return {
        title: isFr ? 'SEVEN // Rangement programmé' : 'SEVEN // Scheduled organize',
        body: isFr
          ? 'Ouvrez SEVEN pour ranger vos fichiers téléchargés.'
          : 'Open SEVEN to organize your downloaded files.',
      };
    case 'check_emails':
      return {
        title: isFr ? 'SEVEN // Vérification des e-mails' : 'SEVEN // Email check',
        body: isFr ? 'Ouvrez SEVEN pour voir vos nouveaux e-mails.' : 'Open SEVEN to check your new emails.',
      };
    case 'web_search':
      return {
        title: isFr ? 'SEVEN // Recherche programmée' : 'SEVEN // Scheduled search',
        body: action.payload
          ? (isFr ? `Ouvrez SEVEN pour : "${action.payload}"` : `Open SEVEN for: "${action.payload}"`)
          : (isFr ? 'Ouvrez SEVEN pour votre recherche programmée.' : 'Open SEVEN for your scheduled search.'),
      };
    case 'reminder':
    default:
      return {
        title: isFr ? 'SEVEN // Rappel' : 'SEVEN // Reminder',
        body: action.payload || (isFr ? 'Vous avez un rappel.' : 'You have a reminder.'),
      };
  }
}

class RoutineService {
  get supported(): boolean {
    return isSupported;
  }

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
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'SEVEN Routines',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Schedules (or re-schedules, cancelling the previous notification first
   * so a rename/time-change never leaves an orphaned duplicate) the OS
   * notification behind a routine. Returns 'invalid' without touching the
   * OS at all when the trigger itself doesn't make sense, so callers can
   * surface a precise error instead of a generic "failed".
   */
  async scheduleRoutine(routine: AutomationRoutine, language: 'fr' | 'en' = 'en'): Promise<RoutineScheduleResult> {
    if (!isSupported) return 'unsupported';

    const validationError = validateTrigger(routine.trigger);
    if (validationError) return 'invalid';

    const granted = await this.ensurePermissionsAsync();
    if (!granted) return 'denied';

    await this.cancelRoutine(routine.id);

    try {
      const { title, body } = describeAction(routine.action, language);
      const trigger = this.buildNotificationTrigger(routine.trigger);

      await Notifications.scheduleNotificationAsync({
        identifier: notificationIdFor(routine.id),
        content: {
          title: `${title} — ${routine.name}`,
          body,
          sound: true,
          data: { kind: NOTIFICATION_DATA_KIND, routineId: routine.id },
        },
        trigger,
      });
      return 'scheduled';
    } catch {
      return 'failed';
    }
  }

  private buildNotificationTrigger(trigger: RoutineTrigger): Notifications.SchedulableNotificationTriggerInput {
    switch (trigger.type) {
      case 'weekly':
        return {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          channelId: CHANNEL_ID,
          weekday: trigger.weekday!,
          hour: trigger.hour,
          minute: trigger.minute,
        };
      case 'once': {
        const date = new Date(
          `${trigger.date}T${String(trigger.hour).padStart(2, '0')}:${String(trigger.minute).padStart(2, '0')}:00`
        );
        return {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          channelId: CHANNEL_ID,
          date,
        };
      }
      case 'daily':
      default:
        return {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: CHANNEL_ID,
          hour: trigger.hour,
          minute: trigger.minute,
        };
    }
  }

  async cancelRoutine(routineId: string): Promise<void> {
    if (!isSupported) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationIdFor(routineId));
    } catch {
      // Was never scheduled — nothing to do.
    }
  }

  /**
   * Actually performs a routine's action, reusing the same real services
   * every other entry point in the app uses (no simulated/mocked action).
   * Returns a short human-readable outcome so the caller can log/announce
   * it. Every branch fails soft: an errored action never throws out of
   * this function, since it typically runs right after a cold app launch
   * from a tapped notification, and a background flow crashing that early
   * would look like the app itself is broken.
   */
  async runAction(action: RoutineAction, language: 'fr' | 'en' = 'en'): Promise<string> {
    const isFr = language === 'fr';
    try {
      switch (action.type) {
        case 'morning_briefing': {
          await morningBriefingService.generateBriefing();
          return isFr ? 'Briefing du matin généré.' : 'Morning briefing generated.';
        }
        case 'organize_files': {
          const result = await fileOrganizer.organizeDownloads();
          return result.message;
        }
        case 'check_emails': {
          return await gmailService.fetchUnreadEmails();
        }
        case 'web_search': {
          const query = action.payload?.trim();
          if (!query) return isFr ? 'Aucune requête définie pour cette routine.' : 'No query configured for this routine.';
          const res = await webSearchService.searchWeb(query, language);
          return res.summary;
        }
        case 'reminder':
        default:
          return action.payload || (isFr ? 'Rappel.' : 'Reminder.');
      }
    } catch (e: any) {
      return isFr
        ? `Échec de l'exécution de la routine : ${e?.message || e}`
        : `Routine execution failed: ${e?.message || e}`;
    }
  }

  /**
   * Called on app foreground (see app/_layout.tsx) with the last tapped
   * notification response. Runs the matching routine's action exactly
   * once per notification tap, marks `lastRunAt`, and re-schedules 'daily'
   * / 'weekly' routines for their next occurrence (expo-notifications
   * already repeats those on the OS side, so this is a no-op for them —
   * only a 'once' routine is disabled after running, since firing it again
   * would contradict its own definition).
   */
  async handleNotificationResponse(
    data: Record<string, unknown> | undefined
  ): Promise<{ ran: boolean; routineId?: string; outcome?: string }> {
    if (!data || data.kind !== NOTIFICATION_DATA_KIND || typeof data.routineId !== 'string') {
      return { ran: false };
    }
    const routineId = data.routineId;
    const store = useSevenStore.getState();
    const routine = store.automationRoutines.find((r) => r.id === routineId);
    if (!routine || !routine.enabled) {
      return { ran: false };
    }

    const language = (store.config.language || 'en') === 'fr' ? 'fr' : 'en';
    const outcome = await this.runAction(routine.action, language);

    store.updateAutomationRoutine(routineId, {
      lastRunAt: Date.now(),
      // A one-shot routine has served its purpose; recurring ones stay on.
      enabled: routine.trigger.type === 'once' ? false : routine.enabled,
    });

    return { ran: true, routineId, outcome };
  }
}

export const routineService = new RoutineService();
