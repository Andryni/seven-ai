import type { AutomationRoutine } from '../types';
import type { CalendarEventSummary } from '../services/calendarService';

/**
 * Pure "should this conditional routine fire right now" decisions, kept
 * completely separate from `useConditionalRoutines` (which owns the actual
 * battery/NetInfo/calendar polling and the OS notification side effect) so
 * the firing logic — including its debounce rules, which are the easy part
 * to get subtly wrong — is unit-testable without mocking three native
 * modules.
 *
 * None of these trigger types are checked in the background: there is no
 * background-task/push infrastructure in this app (see the README's
 * honesty matrix), so a conditional routine only ever evaluates while
 * SEVEN is open in the foreground. `battery_low` and `wifi_connect` are
 * edge-triggered (fire once when crossing into the condition, not on every
 * tick the condition remains true) via `lastFiredAt`/state snapshots the
 * caller threads back in; `calendar_soon` re-arms once per calendar event
 * id so the same meeting doesn't re-notify every polling tick inside its
 * lead window.
 */

export interface ConditionalRoutineState {
  /** Timestamp this trigger last fired, if ever. */
  lastFiredAt?: number;
  /** For 'wifi_connect': the last known connectivity state, to detect the
   *  transition into "connected" instead of firing on every tick while
   *  already connected. */
  wasConnected?: boolean;
  /** For 'calendar_soon': ids of events already notified for, so the same
   *  event doesn't re-fire on every poll while inside its lead window. */
  notifiedEventIds?: string[];
}

/** Fires once as the battery level crosses at/below the threshold — not on
 *  every tick while it stays low, and not again until it's recharged back
 *  above the threshold (tracked via `lastFiredAt` being cleared by the
 *  caller once level recovers, matching `useConditionalRoutines`). */
export function shouldFireBatteryLow(
  routine: AutomationRoutine,
  batteryLevelPct: number,
  state: ConditionalRoutineState
): boolean {
  if (routine.trigger.type !== 'battery_low') return false;
  const threshold = routine.trigger.batteryThreshold ?? 20;
  if (batteryLevelPct > threshold) return false;
  if (state.lastFiredAt) return false; // already fired for this low-battery episode
  return true;
}

/** Fires once on the transition from disconnected/unknown to connected —
 *  never while already connected on a previous check, so it doesn't spam
 *  every foreground poll on an already-joined network. */
export function shouldFireWifiConnect(
  routine: AutomationRoutine,
  isWifiConnected: boolean,
  state: ConditionalRoutineState
): boolean {
  if (routine.trigger.type !== 'wifi_connect') return false;
  if (!isWifiConnected) return false;
  if (state.wasConnected) return false; // already connected last check — not a new join
  return true;
}

/**
 * Which of today's calendar events are now inside the routine's lead
 * window (event starts in <= minutesBefore, but hasn't started yet) and
 * haven't already been notified for. Returns the event ids to fire for —
 * the caller marks them notified after actually running the action.
 */
export function calendarEventsDueSoon(
  routine: AutomationRoutine,
  events: CalendarEventSummary[],
  state: ConditionalRoutineState,
  now: number = Date.now()
): CalendarEventSummary[] {
  if (routine.trigger.type !== 'calendar_soon') return [];
  const minutesBefore = routine.trigger.minutesBefore ?? 15;
  const windowMs = minutesBefore * 60 * 1000;
  const notified = new Set(state.notifiedEventIds ?? []);
  return events.filter((e) => {
    if (notified.has(e.id)) return false;
    if (e.allDay) return false;
    const msUntilStart = e.startDate.getTime() - now;
    return msUntilStart > 0 && msUntilStart <= windowMs;
  });
}
