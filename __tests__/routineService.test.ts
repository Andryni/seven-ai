/**
 * A generic routine/automation engine ("every morning at 8, run my
 * briefing") did not exist before — only a single hardcoded 8am briefing
 * notification did. This pins: trigger validation (rejecting impossible
 * hours/minutes/weekdays and past one-shot dates before ever touching the
 * OS), the daily/weekly/once -> expo-notifications trigger mapping,
 * schedule/cancel idempotency, every action type actually calling its real
 * underlying service (no simulated action), and the notification-tap
 * handler that runs the matching routine exactly once and disables
 * one-shot routines after they fire.
 */
import * as Notifications from 'expo-notifications';
import { routineService, validateTrigger } from '../src/services/routineService';
import { useSevenStore } from '../src/store/useSevenStore';
import { morningBriefingService } from '../src/services/morningBriefingService';
import { fileOrganizer } from '../src/services/fileOrganizer';
import { gmailService } from '../src/services/gmailService';
import { webSearchService } from '../src/services/webSearchService';
import type { AutomationRoutine } from '../src/types';

jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('native-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/morningBriefingService', () => ({
  morningBriefingService: { generateBriefing: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../src/services/fileOrganizer', () => ({
  fileOrganizer: { organizeDownloads: jest.fn().mockResolvedValue({ message: 'Organized 3 files.' }) },
}));
jest.mock('../src/services/gmailService', () => ({
  gmailService: { fetchUnreadEmails: jest.fn().mockResolvedValue('You have 2 unread messages.') },
}));
jest.mock('../src/services/webSearchService', () => ({
  webSearchService: { searchWeb: jest.fn().mockResolvedValue({ summary: 'Search results summary.' }) },
}));

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;

function makeRoutine(overrides: Partial<AutomationRoutine> = {}): AutomationRoutine {
  return {
    id: 'r1',
    name: 'Daily briefing',
    trigger: { type: 'daily', hour: 8, minute: 0 },
    action: { type: 'morning_briefing' },
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('validateTrigger', () => {
  it('accepts a valid daily trigger', () => {
    expect(validateTrigger({ type: 'daily', hour: 8, minute: 0 })).toBeNull();
  });

  it('rejects an out-of-range hour', () => {
    expect(validateTrigger({ type: 'daily', hour: 24, minute: 0 })).toMatch(/hour/i);
    expect(validateTrigger({ type: 'daily', hour: -1, minute: 0 })).toMatch(/hour/i);
  });

  it('rejects an out-of-range minute', () => {
    expect(validateTrigger({ type: 'daily', hour: 8, minute: 60 })).toMatch(/minute/i);
  });

  it('rejects a weekly trigger with no weekday', () => {
    expect(validateTrigger({ type: 'weekly', hour: 9, minute: 0 })).toMatch(/weekday/i);
  });

  it('rejects a weekly trigger with an out-of-range weekday', () => {
    expect(validateTrigger({ type: 'weekly', hour: 9, minute: 0, weekday: 8 })).toMatch(/weekday/i);
  });

  it('accepts a valid weekly trigger', () => {
    expect(validateTrigger({ type: 'weekly', hour: 9, minute: 30, weekday: 2 })).toBeNull();
  });

  it('rejects a one-time trigger with no date', () => {
    expect(validateTrigger({ type: 'once', hour: 9, minute: 0 })).toMatch(/date/i);
  });

  it('rejects a one-time trigger scheduled in the past', () => {
    expect(validateTrigger({ type: 'once', hour: 9, minute: 0, date: '2000-01-01' })).toMatch(/future/i);
  });

  it('accepts a valid future one-time trigger', () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const dateStr = future.toISOString().slice(0, 10);
    expect(validateTrigger({ type: 'once', hour: 9, minute: 0, date: dateStr })).toBeNull();
  });
});

describe('routineService.scheduleRoutine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
  });

  it('returns "invalid" for a malformed trigger without touching the OS at all', async () => {
    const routine = makeRoutine({ trigger: { type: 'daily', hour: 99, minute: 0 } });
    const result = await routineService.scheduleRoutine(routine);
    expect(result).toBe('invalid');
    expect(mockedNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('returns "denied" and never schedules when permission is refused', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    const result = await routineService.scheduleRoutine(makeRoutine());
    expect(result).toBe('denied');
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a daily routine with the correct trigger shape', async () => {
    const result = await routineService.scheduleRoutine(makeRoutine());
    expect(result).toBe('scheduled');
    const call = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.identifier).toBe('seven-routine-r1');
    expect(call.trigger).toMatchObject({ type: 'daily', hour: 8, minute: 0 });
    expect(call.content.data).toMatchObject({ kind: 'seven-routine', routineId: 'r1' });
  });

  it('schedules a weekly routine with the weekday carried through', async () => {
    const routine = makeRoutine({ trigger: { type: 'weekly', hour: 9, minute: 30, weekday: 2 } });
    await routineService.scheduleRoutine(routine);
    const call = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.trigger).toMatchObject({ type: 'weekly', weekday: 2, hour: 9, minute: 30 });
  });

  it('schedules a one-time routine as a DATE trigger', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = future.toISOString().slice(0, 10);
    const routine = makeRoutine({ trigger: { type: 'once', hour: 10, minute: 0, date: dateStr } });
    await routineService.scheduleRoutine(routine);
    const call = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect((call.trigger as any).type).toBe('date');
    expect((call.trigger as any).date).toBeInstanceOf(Date);
  });

  it('cancels any previous notification for the same routine before rescheduling (no orphan duplicates)', async () => {
    await routineService.scheduleRoutine(makeRoutine());
    expect(mockedNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('seven-routine-r1');
  });

  it('returns "failed" when the OS scheduler throws', async () => {
    mockedNotifications.scheduleNotificationAsync.mockRejectedValue(new Error('boom'));
    const result = await routineService.scheduleRoutine(makeRoutine());
    expect(result).toBe('failed');
  });

  it('localizes the notification title/body to French', async () => {
    await routineService.scheduleRoutine(makeRoutine({ name: 'Brief matinal' }), 'fr');
    const call = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.title).toMatch(/Briefing programmé/);
  });
});

describe('routineService.cancelRoutine', () => {
  it('swallows an error when nothing was scheduled', async () => {
    mockedNotifications.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('not found'));
    await expect(routineService.cancelRoutine('missing')).resolves.toBeUndefined();
  });
});

describe('routineService.runAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs the real morning briefing service for morning_briefing', async () => {
    const outcome = await routineService.runAction({ type: 'morning_briefing' });
    expect(morningBriefingService.generateBriefing).toHaveBeenCalled();
    expect(outcome).toMatch(/briefing generated/i);
  });

  it('runs the real file organizer for organize_files and returns its message', async () => {
    const outcome = await routineService.runAction({ type: 'organize_files' });
    expect(fileOrganizer.organizeDownloads).toHaveBeenCalled();
    expect(outcome).toBe('Organized 3 files.');
  });

  it('runs the real gmail service for check_emails', async () => {
    const outcome = await routineService.runAction({ type: 'check_emails' });
    expect(gmailService.fetchUnreadEmails).toHaveBeenCalled();
    expect(outcome).toBe('You have 2 unread messages.');
  });

  it('runs a real web search for web_search with the configured query', async () => {
    const outcome = await routineService.runAction({ type: 'web_search', payload: 'AI news' });
    expect(webSearchService.searchWeb).toHaveBeenCalledWith('AI news', 'en');
    expect(outcome).toBe('Search results summary.');
  });

  it('reports a clean message when web_search has no configured query', async () => {
    const outcome = await routineService.runAction({ type: 'web_search' });
    expect(webSearchService.searchWeb).not.toHaveBeenCalled();
    expect(outcome).toMatch(/no query/i);
  });

  it('returns the reminder payload verbatim for a reminder action', async () => {
    const outcome = await routineService.runAction({ type: 'reminder', payload: 'Call the bank' });
    expect(outcome).toBe('Call the bank');
  });

  it('never throws when the underlying service rejects', async () => {
    (fileOrganizer.organizeDownloads as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    const outcome = await routineService.runAction({ type: 'organize_files' });
    expect(outcome).toMatch(/failed/i);
    expect(outcome).toContain('disk full');
  });
});

describe('routineService.handleNotificationResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSevenStore.setState({
      automationRoutines: [makeRoutine({ id: 'r1', enabled: true })],
      config: { ...useSevenStore.getState().config, language: 'en' },
    });
  });

  it('does nothing for data from an unrelated notification', async () => {
    const result = await routineService.handleNotificationResponse({ kind: 'something-else' });
    expect(result.ran).toBe(false);
  });

  it('does nothing when no data is present', async () => {
    const result = await routineService.handleNotificationResponse(undefined);
    expect(result.ran).toBe(false);
  });

  it('does nothing when the routine no longer exists', async () => {
    const result = await routineService.handleNotificationResponse({ kind: 'seven-routine', routineId: 'ghost' });
    expect(result.ran).toBe(false);
  });

  it('does nothing when the routine is disabled', async () => {
    useSevenStore.setState({ automationRoutines: [makeRoutine({ id: 'r1', enabled: false })] });
    const result = await routineService.handleNotificationResponse({ kind: 'seven-routine', routineId: 'r1' });
    expect(result.ran).toBe(false);
  });

  it('runs the matching enabled routine exactly once and records lastRunAt', async () => {
    const result = await routineService.handleNotificationResponse({ kind: 'seven-routine', routineId: 'r1' });
    expect(result.ran).toBe(true);
    expect(morningBriefingService.generateBriefing).toHaveBeenCalledTimes(1);
    const updated = useSevenStore.getState().automationRoutines.find((r) => r.id === 'r1');
    expect(updated?.lastRunAt).toBeGreaterThan(0);
  });

  it('keeps a daily/weekly routine enabled after it runs', async () => {
    await routineService.handleNotificationResponse({ kind: 'seven-routine', routineId: 'r1' });
    const updated = useSevenStore.getState().automationRoutines.find((r) => r.id === 'r1');
    expect(updated?.enabled).toBe(true);
  });

  it('disables a one-shot routine after it runs', async () => {
    useSevenStore.setState({
      automationRoutines: [
        makeRoutine({ id: 'r1', enabled: true, trigger: { type: 'once', hour: 9, minute: 0, date: '2099-01-01' } }),
      ],
    });
    await routineService.handleNotificationResponse({ kind: 'seven-routine', routineId: 'r1' });
    const updated = useSevenStore.getState().automationRoutines.find((r) => r.id === 'r1');
    expect(updated?.enabled).toBe(false);
  });
});
