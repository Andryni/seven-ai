import { useEffect } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import { getNotificationsModule } from '../services/notificationsAdapter';
import { useSevenStore } from '../store/useSevenStore';
import { calendarService } from '../services/calendarService';
import { routineService } from '../services/routineService';
import type { AutomationRoutine } from '../types';
import {
  shouldFireBatteryLow,
  shouldFireWifiConnect,
  calendarEventsDueSoon,
  type ConditionalRoutineState,
} from '../core/conditionalRoutines';

/**
 * Drives the three "live condition" routine triggers (battery_low,
 * calendar_soon, wifi_connect) — see the `RoutineTriggerType` doc comment
 * for why these only ever evaluate in the foreground: there is no
 * background-task/push infrastructure in this app.
 *
 * Mounted once from `app/_layout.tsx`, alongside the rest of the app-wide
 * setup (font scaling, app lock). Polls every `POLL_INTERVAL_MS` while the
 * app is foregrounded (battery/network already push their own change
 * events too, so battery_low and wifi_connect react close to instantly;
 * the poll mainly drives calendar_soon, which has no native "about to
 * start" event to subscribe to) and re-checks once immediately whenever
 * the app returns to the foreground, so a routine due while the phone was
 * locked doesn't have to wait for the next tick.
 *
 * Firing a conditional routine posts an immediate local notification
 * (trigger: null) — the same visible, tap-to-open mechanism the time-based
 * routines already use — rather than silently running the action, so a
 * calendar reminder or low-battery nudge is never invisible.
 */
const POLL_INTERVAL_MS = 60_000;
const CHANNEL_ID = 'seven-routines';
const NOTIFICATION_DATA_KIND = 'seven-conditional-routine';

export function useConditionalRoutines(): void {
  // Debounce state is persisted in `config.conditionalRoutineState` (not a
  // ref): the hook's lifetime is the app's foreground lifetime, while the
  // "already fired for this episode" guarantee must survive restarts — with
  // an in-memory map, a battery_low routine fired at 5% would fire again on
  // every relaunch while the battery stayed low.

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;

    const checkOnce = async () => {
      const store = useSevenStore.getState();
      const language = (store.config.language || 'en') === 'fr' ? 'fr' : 'en';
      const routines = store.automationRoutines.filter(
        (r) =>
          r.enabled &&
          (r.trigger.type === 'battery_low' ||
            r.trigger.type === 'calendar_soon' ||
            r.trigger.type === 'wifi_connect')
      );
      if (routines.length === 0) return;

      // Fetch each live fact at most once per tick, even if several
      // routines watch the same condition.
      const needsBattery = routines.some((r) => r.trigger.type === 'battery_low');
      const needsWifi = routines.some((r) => r.trigger.type === 'wifi_connect');
      const needsCalendar = routines.some((r) => r.trigger.type === 'calendar_soon');

      const [batteryLevel, netState, calendarGranted] = await Promise.all([
        needsBattery ? Battery.getBatteryLevelAsync().catch(() => -1) : Promise.resolve(-1),
        needsWifi ? NetInfo.fetch().catch(() => null) : Promise.resolve(null),
        needsCalendar ? calendarService.hasPermission().catch(() => false) : Promise.resolve(false),
      ]);
      if (cancelled) return;

      const batteryPct = batteryLevel >= 0 ? Math.round(batteryLevel * 100) : null;
      const isWifiConnected = !!netState && netState.type === 'wifi' && !!netState.isConnected;
      const calendarEvents =
        needsCalendar && calendarGranted ? await calendarService.getTodayEvents().catch(() => null) : null;
      if (cancelled) return;

      /** Persisted view of the per-routine debounce state for this tick. */
      const persisted = store.config.conditionalRoutineState ?? {};
      /** Mutated during this tick, then written back once via setConfig. */
      const next = { ...persisted } as NonNullable<
        typeof store.config.conditionalRoutineState
      >;

      for (const routine of routines) {
        const prev: ConditionalRoutineState = persisted[routine.id] ?? {};

        if (routine.trigger.type === 'battery_low' && batteryPct !== null) {
          const threshold = routine.trigger.batteryThreshold ?? 20;
          if (shouldFireBatteryLow(routine, batteryPct, prev)) {
            await fireConditionalRoutine(routine, language);
            next[routine.id] = { ...prev, lastFiredAt: Date.now() };
          } else if (batteryPct > threshold && prev.lastFiredAt) {
            // Recharged back above the threshold: re-arm for the next dip.
            next[routine.id] = { ...prev, lastFiredAt: undefined };
          }
          continue;
        }

        if (routine.trigger.type === 'wifi_connect') {
          if (shouldFireWifiConnect(routine, isWifiConnected, prev)) {
            await fireConditionalRoutine(routine, language);
          }
          next[routine.id] = { ...prev, wasConnected: isWifiConnected };
          continue;
        }

        if (routine.trigger.type === 'calendar_soon') {
          const due = calendarEventsDueSoon(routine, calendarEvents ?? [], prev);
          if (due.length > 0) {
            for (const event of due) {
              await fireConditionalRoutine(routine, language, event.title);
            }
            next[routine.id] = {
              ...prev,
              notifiedEventIds: [...(prev.notifiedEventIds ?? []), ...due.map((e) => e.id)],
            };
          }
        }
      }

      // One write per tick only when something actually changed.
      if (JSON.stringify(next) !== JSON.stringify(persisted)) {
        useSevenStore.getState().setConfig({ conditionalRoutineState: next });
      }
    };

    const fireConditionalRoutine = async (
      routine: AutomationRoutine,
      language: 'fr' | 'en',
      eventTitle?: string
    ) => {
      const store = useSevenStore.getState();
      const outcome = await routineService.runAction(routine.action, language);
      store.updateAutomationRoutine(routine.id, { lastRunAt: Date.now() });
      store.addTerminalLog(`ROUTINE (${routine.name}): ${outcome}`, 'success');
      try {
        const granted = await routineService.ensurePermissionsAsync();
        const notifications = getNotificationsModule();
        if (!granted || !notifications) return;
        const title =
          language === 'fr' ? `SEVEN // ${routine.name}` : `SEVEN // ${routine.name}`;
        const body = eventTitle
          ? language === 'fr'
            ? `"${eventTitle}" commence bientôt.`
            : `"${eventTitle}" starts soon.`
          : outcome;
        await notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: true,
            data: { kind: NOTIFICATION_DATA_KIND, routineId: routine.id },
          },
          trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
        });
      } catch {
        // Notification best-effort only — the action itself already ran.
      }
    };

    checkOnce();
    const interval = setInterval(checkOnce, POLL_INTERVAL_MS);

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') checkOnce();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      appStateSub.remove();
    };
  }, []);
}
