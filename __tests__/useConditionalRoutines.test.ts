/**
 * `useConditionalRoutines` is the live-polling glue between the pure
 * firing rules in `conditionalRoutines.ts` and the real battery/NetInfo/
 * calendar/notification services. This pins: it only polls while
 * enabled+conditional routines actually exist, it fetches each live fact
 * at most once per tick, it runs the real routine action and posts a real
 * (trigger: null) notification when a condition fires, and it re-checks
 * immediately on every foreground return in addition to the interval.
 */
import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import { useConditionalRoutines } from '../src/hooks/useConditionalRoutines';
import { useSevenStore } from '../src/store/useSevenStore';
import { routineService } from '../src/services/routineService';
import { calendarService } from '../src/services/calendarService';
import type { AutomationRoutine } from '../src/types';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('native-id'),
}));

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn().mockResolvedValue(0.5),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn().mockResolvedValue({ type: 'none', isConnected: false }) },
}));

jest.mock('../src/services/routineService', () => ({
  routineService: {
    runAction: jest.fn().mockResolvedValue('Done.'),
    ensurePermissionsAsync: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/calendarService', () => ({
  calendarService: {
    hasPermission: jest.fn().mockResolvedValue(false),
    getTodayEvents: jest.fn().mockResolvedValue([]),
  },
}));

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockedBattery = Battery as jest.Mocked<typeof Battery>;
const mockedNetInfo = NetInfo as unknown as { fetch: jest.Mock };
const mockedRoutineService = routineService as jest.Mocked<typeof routineService>;
const mockedCalendarService = calendarService as jest.Mocked<typeof calendarService>;

function makeRoutine(overrides: Partial<AutomationRoutine> = {}): AutomationRoutine {
  return {
    id: 'c1',
    name: 'Low battery nudge',
    trigger: { type: 'battery_low', batteryThreshold: 20 },
    action: { type: 'reminder', payload: 'Plug me in' },
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('useConditionalRoutines', () => {
  let listeners: ((state: string) => void)[];
  let addEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    listeners = [];
    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.5);
    mockedNetInfo.fetch.mockResolvedValue({ type: 'none', isConnected: false });
    mockedCalendarService.hasPermission.mockResolvedValue(false);
    mockedCalendarService.getTodayEvents.mockResolvedValue([]);
    mockedRoutineService.runAction.mockResolvedValue('Done.');
    mockedRoutineService.ensurePermissionsAsync.mockResolvedValue(true);
    useSevenStore.setState({
      automationRoutines: [],
      config: {
        ...useSevenStore.getState().config,
        language: 'en',
        // The debounce state is persisted (config.conditionalRoutineState),
        // so it would otherwise leak from one test's fired routine into the
        // next test's fresh scenario.
        conditionalRoutineState: undefined,
      },
    });
    addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(
      ((_event: string, handler: (state: string) => void) => {
        listeners.push(handler);
        return { remove: jest.fn() };
      }) as typeof AppState.addEventListener
    );
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const emitForeground = async () => {
    await act(async () => {
      listeners.forEach((l) => l('active'));
      await Promise.resolve();
    });
  };

  it('does nothing when there are no enabled conditional routines', async () => {
    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedBattery.getBatteryLevelAsync).not.toHaveBeenCalled();
  });

  it('ignores a disabled conditional routine', async () => {
    useSevenStore.setState({ automationRoutines: [makeRoutine({ enabled: false })] });
    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedBattery.getBatteryLevelAsync).not.toHaveBeenCalled();
  });

  it('fires a battery_low routine once battery drops to/below the threshold', async () => {
    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.1); // 10%
    useSevenStore.setState({ automationRoutines: [makeRoutine({ trigger: { type: 'battery_low', batteryThreshold: 20 } })] });

    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);
    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.trigger).toBeNull();
    expect(call.content.data).toMatchObject({ kind: 'seven-conditional-routine', routineId: 'c1' });
  });

  it('does not re-fire battery_low on the next tick while still low (edge-triggered, not level-triggered)', async () => {
    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.1);
    useSevenStore.setState({ automationRoutines: [makeRoutine()] });

    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);
  });

  it('re-arms battery_low after recharging back above the threshold', async () => {
    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.1);
    useSevenStore.setState({ automationRoutines: [makeRoutine()] });

    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);

    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.9);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);

    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.1);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(2);
  });

  it('fires a wifi_connect routine only on the transition into connected', async () => {
    mockedNetInfo.fetch.mockResolvedValue({ type: 'wifi', isConnected: true });
    useSevenStore.setState({ automationRoutines: [makeRoutine({ trigger: { type: 'wifi_connect' } })] });

    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);
  });

  it('fires a calendar_soon routine for an event inside its lead window', async () => {
    mockedCalendarService.hasPermission.mockResolvedValue(true);
    mockedCalendarService.getTodayEvents.mockResolvedValue([
      { id: 'e1', title: 'Standup', startDate: new Date(Date.now() + 5 * 60 * 1000), endDate: new Date(), allDay: false } as any,
    ]);
    useSevenStore.setState({
      automationRoutines: [makeRoutine({ trigger: { type: 'calendar_soon', minutesBefore: 15 } })],
    });

    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);
    const call = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.body).toMatch(/Standup/);
  });

  it('re-checks immediately when the app returns to the foreground', async () => {
    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.5);
    useSevenStore.setState({ automationRoutines: [makeRoutine({ trigger: { type: 'battery_low', batteryThreshold: 20 } })] });

    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedRoutineService.runAction).not.toHaveBeenCalled();

    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.05);
    await emitForeground();
    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);
  });

  it('never calls the OS scheduler when notification permission is not granted', async () => {
    mockedRoutineService.ensurePermissionsAsync.mockResolvedValue(false);
    mockedBattery.getBatteryLevelAsync.mockResolvedValue(0.1);
    useSevenStore.setState({ automationRoutines: [makeRoutine()] });

    renderHook(() => useConditionalRoutines());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRoutineService.runAction).toHaveBeenCalledTimes(1);
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
