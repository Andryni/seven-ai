/**
 * create_routine / list_routines / delete_routine let the agent schedule
 * automation from natural language ("every morning at 8, run my
 * briefing") instead of requiring the user to open the dedicated Routines
 * screen. This pins: the tool actually calls routineService.scheduleRoutine
 * (never simulates success), every non-'scheduled' outcome is surfaced as a
 * distinct, honest message instead of a generic failure, a successful
 * schedule is persisted into the store, list_routines formats the existing
 * routines, and delete_routine does a case-insensitive partial-name match
 * that also cancels the OS notification.
 */
import { executeTool } from '../src/core/sevenAgentTools';
import { routineService } from '../src/services/routineService';
import { useSevenStore } from '../src/store/useSevenStore';
import type { AutomationRoutine } from '../src/types';

jest.mock('../src/services/fileOrganizer', () => ({ fileOrganizer: {} }));
jest.mock('../src/core/daveAgent', () => ({ daveAgent: {} }));
jest.mock('../src/services/researchService', () => ({ researchService: {} }));
jest.mock('../src/services/gmailService', () => ({ gmailService: {} }));
jest.mock('../src/services/instagramService', () => ({ instagramService: {} }));
jest.mock('../src/core/selfHealing', () => ({ selfHealing: {} }));
jest.mock('../src/services/deviceControlService', () => ({ deviceControl: {} }));
jest.mock('../src/services/webSearchService', () => ({ webSearchService: {} }));
jest.mock('../src/services/sandboxService', () => ({ sandboxService: {} }));
jest.mock('../src/services/memoryService', () => ({ memoryService: {} }));
jest.mock('../src/services/contactsService', () => ({ contactsService: {} }));
jest.mock('../src/services/calendarService', () => ({ calendarService: {} }));

jest.mock('../src/services/routineService', () => ({
  routineService: {
    scheduleRoutine: jest.fn(),
    cancelRoutine: jest.fn().mockResolvedValue(undefined),
  },
  validateTrigger: jest.fn(() => null),
  // list_routines branches on this to describe time-based vs conditional
  // triggers; mirror the real predicate (see routineService.ts).
  isTimeBasedTrigger: jest.fn((type: string) => ['daily', 'weekly', 'once'].includes(type)),
}));

const mockedRoutineService = routineService as jest.Mocked<typeof routineService>;

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

describe('executeTool — automation routines', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSevenStore.setState({ automationRoutines: [] });
  });

  describe('create_routine', () => {
    it('schedules a valid daily routine and persists it', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('scheduled');
      const result = await executeTool('create_routine', {
        name: 'Morning ritual',
        trigger_type: 'daily',
        hour: 8,
        minute: 30,
        action_type: 'morning_briefing',
      });
      expect(mockedRoutineService.scheduleRoutine).toHaveBeenCalled();
      expect(result.text).toMatch(/scheduled/i);
      expect(result.toolCall?.name).toBe('routine');
      const stored = useSevenStore.getState().automationRoutines;
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Morning ritual');
      expect(stored[0].trigger).toMatchObject({ type: 'daily', hour: 8, minute: 30 });
    });

    it('reports permission denial without pretending the routine will fire', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('denied');
      const result = await executeTool('create_routine', {
        name: 'Emails',
        trigger_type: 'daily',
        hour: 9,
        action_type: 'check_emails',
      });
      expect(result.text).toMatch(/permission was denied/i);
      // Still saved so the user can grant permission later and have it work.
      expect(useSevenStore.getState().automationRoutines).toHaveLength(1);
    });

    it('reports an invalid trigger without ever saving the routine', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('invalid');
      const result = await executeTool('create_routine', {
        name: 'Broken',
        trigger_type: 'daily',
        hour: 99,
        action_type: 'reminder',
      });
      expect(result.text).toMatch(/couldn't schedule/i);
      expect(useSevenStore.getState().automationRoutines).toHaveLength(0);
    });

    it('reports platform unsupported cleanly', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('unsupported');
      const result = await executeTool('create_routine', {
        name: 'Web-only',
        trigger_type: 'daily',
        hour: 10,
        action_type: 'reminder',
      });
      expect(result.text).toMatch(/unavailable on this platform/i);
      expect(useSevenStore.getState().automationRoutines).toHaveLength(0);
    });

    it('saves the routine even when the scheduler call fails, so it can be retried', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('failed');
      const result = await executeTool('create_routine', {
        name: 'Flaky',
        trigger_type: 'daily',
        hour: 10,
        action_type: 'reminder',
      });
      expect(result.text).toMatch(/could not reach the scheduler/i);
      expect(useSevenStore.getState().automationRoutines).toHaveLength(1);
    });

    it('forwards a weekly trigger weekday and a reminder payload', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('scheduled');
      await executeTool('create_routine', {
        name: 'Call the bank',
        trigger_type: 'weekly',
        hour: 17,
        minute: 0,
        weekday: 2,
        action_type: 'reminder',
        payload: 'Call the bank about the loan',
      });
      const stored = useSevenStore.getState().automationRoutines[0];
      expect(stored.trigger).toMatchObject({ type: 'weekly', weekday: 2 });
      expect(stored.action).toMatchObject({ type: 'reminder', payload: 'Call the bank about the loan' });
    });

    it('creates a battery_low routine without requiring hour/minute', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('scheduled');
      const result = await executeTool('create_routine', {
        name: 'Low battery nudge',
        trigger_type: 'battery_low',
        battery_threshold: 15,
        action_type: 'reminder',
        payload: 'Plug me in',
      });
      expect(result.text).toMatch(/scheduled/i);
      const stored = useSevenStore.getState().automationRoutines[0];
      expect(stored.trigger).toMatchObject({ type: 'battery_low', batteryThreshold: 15 });
      expect(stored.trigger.hour).toBeUndefined();
      expect(result.toolCall?.summary).toMatch(/battery <= 15%/);
    });

    it('creates a calendar_soon routine with the configured lead time', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('scheduled');
      const result = await executeTool('create_routine', {
        name: 'Meeting heads-up',
        trigger_type: 'calendar_soon',
        minutes_before: 10,
        action_type: 'reminder',
        payload: 'Meeting starting soon',
      });
      const stored = useSevenStore.getState().automationRoutines[0];
      expect(stored.trigger).toMatchObject({ type: 'calendar_soon', minutesBefore: 10 });
      expect(result.toolCall?.summary).toMatch(/10min before events/);
    });

    it('creates a wifi_connect routine with no extra fields', async () => {
      mockedRoutineService.scheduleRoutine.mockResolvedValue('scheduled');
      const result = await executeTool('create_routine', {
        name: 'Home wifi hello',
        trigger_type: 'wifi_connect',
        action_type: 'check_emails',
      });
      const stored = useSevenStore.getState().automationRoutines[0];
      expect(stored.trigger).toMatchObject({ type: 'wifi_connect' });
      expect(result.toolCall?.summary).toMatch(/next wifi connect/);
    });
  });

  describe('list_routines', () => {
    it('reports when there are no routines', async () => {
      const result = await executeTool('list_routines', {});
      expect(result.text).toMatch(/no automation routines/i);
    });

    it('formats existing routines into readable lines', async () => {
      useSevenStore.setState({ automationRoutines: [makeRoutine({ name: 'Morning briefing' })] });
      const result = await executeTool('list_routines', {});
      expect(result.text).toContain('Morning briefing');
      expect(result.text).toContain('08:00');
    });
  });

  describe('delete_routine', () => {
    it('deletes a routine matched case-insensitively by partial name and cancels its notification', async () => {
      useSevenStore.setState({ automationRoutines: [makeRoutine({ id: 'r1', name: 'Morning Briefing' })] });
      const result = await executeTool('delete_routine', { name: 'morning' });
      expect(mockedRoutineService.cancelRoutine).toHaveBeenCalledWith('r1');
      expect(useSevenStore.getState().automationRoutines).toHaveLength(0);
      expect(result.text).toMatch(/deleted/i);
    });

    it('reports a clean not-found message without throwing', async () => {
      useSevenStore.setState({ automationRoutines: [makeRoutine({ name: 'Morning Briefing' })] });
      const result = await executeTool('delete_routine', { name: 'nonexistent' });
      expect(result.text).toMatch(/couldn't find/i);
      expect(useSevenStore.getState().automationRoutines).toHaveLength(1);
    });
  });
});
