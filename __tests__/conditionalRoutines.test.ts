/**
 * Pure firing rules for the three conditional routine triggers
 * (battery_low, wifi_connect, calendar_soon). These are the easy-to-get-
 * subtly-wrong parts — debouncing so a routine doesn't re-fire every
 * foreground poll — so they're pinned in isolation from the native battery/
 * NetInfo/calendar polling that drives them in `useConditionalRoutines`.
 */
import {
  shouldFireBatteryLow,
  shouldFireWifiConnect,
  calendarEventsDueSoon,
  type ConditionalRoutineState,
} from '../src/core/conditionalRoutines';
import type { AutomationRoutine } from '../src/types';
import type { CalendarEventSummary } from '../src/services/calendarService';

function makeRoutine(overrides: Partial<AutomationRoutine> = {}): AutomationRoutine {
  return {
    id: 'r1',
    name: 'Test routine',
    trigger: { type: 'battery_low', batteryThreshold: 20 },
    action: { type: 'reminder', payload: 'Plug in the charger' },
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('shouldFireBatteryLow', () => {
  it('fires when level is at or below the threshold and it has not fired yet', () => {
    const routine = makeRoutine({ trigger: { type: 'battery_low', batteryThreshold: 20 } });
    expect(shouldFireBatteryLow(routine, 20, {})).toBe(true);
    expect(shouldFireBatteryLow(routine, 15, {})).toBe(true);
  });

  it('does not fire above the threshold', () => {
    const routine = makeRoutine({ trigger: { type: 'battery_low', batteryThreshold: 20 } });
    expect(shouldFireBatteryLow(routine, 21, {})).toBe(false);
  });

  it('defaults the threshold to 20 when unset', () => {
    const routine = makeRoutine({ trigger: { type: 'battery_low' } });
    expect(shouldFireBatteryLow(routine, 20, {})).toBe(true);
    expect(shouldFireBatteryLow(routine, 25, {})).toBe(false);
  });

  it('does not re-fire while already fired for this low-battery episode', () => {
    const routine = makeRoutine({ trigger: { type: 'battery_low', batteryThreshold: 20 } });
    const state: ConditionalRoutineState = { lastFiredAt: Date.now() };
    expect(shouldFireBatteryLow(routine, 10, state)).toBe(false);
  });

  it('ignores routines of a different trigger type', () => {
    const routine = makeRoutine({ trigger: { type: 'daily', hour: 8, minute: 0 } });
    expect(shouldFireBatteryLow(routine, 5, {})).toBe(false);
  });
});

describe('shouldFireWifiConnect', () => {
  const routine = makeRoutine({ trigger: { type: 'wifi_connect' } });

  it('fires on the transition into connected', () => {
    expect(shouldFireWifiConnect(routine, true, { wasConnected: false })).toBe(true);
    expect(shouldFireWifiConnect(routine, true, {})).toBe(true);
  });

  it('does not fire while already connected on the previous check', () => {
    expect(shouldFireWifiConnect(routine, true, { wasConnected: true })).toBe(false);
  });

  it('does not fire while disconnected', () => {
    expect(shouldFireWifiConnect(routine, false, { wasConnected: false })).toBe(false);
  });

  it('ignores routines of a different trigger type', () => {
    const other = makeRoutine({ trigger: { type: 'battery_low', batteryThreshold: 20 } });
    expect(shouldFireWifiConnect(other, true, {})).toBe(false);
  });
});

describe('calendarEventsDueSoon', () => {
  const now = Date.now();
  const event = (overrides: Partial<CalendarEventSummary> = {}): CalendarEventSummary => ({
    id: 'evt-1',
    title: 'Meeting',
    startDate: new Date(now + 10 * 60 * 1000),
    endDate: new Date(now + 40 * 60 * 1000),
    location: null,
    calendarTitle: 'Work',
    allDay: false,
    ...overrides,
  });

  it('returns events starting within the lead window', () => {
    const routine = makeRoutine({ trigger: { type: 'calendar_soon', minutesBefore: 15 } });
    const result = calendarEventsDueSoon(routine, [event()], {}, now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('evt-1');
  });

  it('excludes events starting further out than the lead window', () => {
    const routine = makeRoutine({ trigger: { type: 'calendar_soon', minutesBefore: 15 } });
    const farEvent = event({ id: 'evt-2', startDate: new Date(now + 60 * 60 * 1000) });
    expect(calendarEventsDueSoon(routine, [farEvent], {}, now)).toHaveLength(0);
  });

  it('excludes events that have already started', () => {
    const routine = makeRoutine({ trigger: { type: 'calendar_soon', minutesBefore: 15 } });
    const started = event({ id: 'evt-3', startDate: new Date(now - 60 * 1000) });
    expect(calendarEventsDueSoon(routine, [started], {}, now)).toHaveLength(0);
  });

  it('excludes all-day events (no meaningful "starts soon" for those)', () => {
    const routine = makeRoutine({ trigger: { type: 'calendar_soon', minutesBefore: 15 } });
    const allDay = event({ id: 'evt-4', allDay: true });
    expect(calendarEventsDueSoon(routine, [allDay], {}, now)).toHaveLength(0);
  });

  it('excludes events already notified for', () => {
    const routine = makeRoutine({ trigger: { type: 'calendar_soon', minutesBefore: 15 } });
    const result = calendarEventsDueSoon(routine, [event()], { notifiedEventIds: ['evt-1'] }, now);
    expect(result).toHaveLength(0);
  });

  it('defaults minutesBefore to 15 when unset', () => {
    const routine = makeRoutine({ trigger: { type: 'calendar_soon' } });
    const inWindow = event({ id: 'evt-5', startDate: new Date(now + 14 * 60 * 1000) });
    const outOfWindow = event({ id: 'evt-6', startDate: new Date(now + 16 * 60 * 1000) });
    const result = calendarEventsDueSoon(routine, [inWindow, outOfWindow], {}, now);
    expect(result.map((e) => e.id)).toEqual(['evt-5']);
  });

  it('ignores routines of a different trigger type', () => {
    const other = makeRoutine({ trigger: { type: 'battery_low', batteryThreshold: 20 } });
    expect(calendarEventsDueSoon(other, [event()], {}, now)).toHaveLength(0);
  });
});
